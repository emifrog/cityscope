-- =============================================================================
-- Sprint 9 — SEC-03: rate limiting shared by every instance of the API, and
-- traces of the sensitive refusals (ADR-023).
--
--   * app.rate_limit_bucket: fixed-window counters, UNLOGGED (lost on a crash,
--     which only resets the windows). Consumed by the API outside the
--     transaction of the request, so that a refused attempt always counts.
--   * app.record_security_event: a refusal (second factor, permission, terminal
--     proof, rate limit, closed session...) written to the audit log with
--     outcome 'denied', in its own transaction as well.
-- =============================================================================

create unlogged table app.rate_limit_bucket (
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits integer not null check (hits > 0),
  primary key (key, window_start)
);
comment on table app.rate_limit_bucket is
  'Rate limiting windows (SEC-03): hashed keys (rule and caller), hits per fixed window; purged by the worker.';
-- No grant: only the functions below read or write the counters.
alter table app.rate_limit_bucket enable row level security;

-- One hit on a key: allowed or not, and in how many seconds the window ends.
create function app.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, hits integer, retry_after integer)
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_limit is null or p_limit not between 1 and 1000000
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into app.rate_limit_bucket as b (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = b.hits + 1
  returning b.hits into v_hits;
  return query select
    v_hits <= p_limit,
    v_hits,
    greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer);
end
$$;

-- Old windows are useless: the worker removes them (CAP-03 maintenance).
create function app.worker_purge_rate_limits() returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from app.rate_limit_bucket b where b.window_start < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- A refusal worth tracing. The person is named only when the token was verified; the SIS
-- only when the person is one of its members (a header sent by a client proves nothing).
create function app.record_security_event(
  p_auth_provider text,
  p_auth_subject text,
  p_tenant_id uuid,
  p_action text,
  p_reason text,
  p_trace_id uuid,
  p_origin text,
  p_metadata jsonb
) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tenant uuid;
  v_id uuid;
begin
  if p_action is null or p_action !~ '^security\.[a-z_]+$' then
    raise exception 'invalid security event' using errcode = '22023';
  end if;
  if p_auth_subject is not null then
    select u.id into v_user from app.user_account u
    where u.auth_provider = p_auth_provider and u.auth_subject = p_auth_subject;
  end if;
  if v_user is not null and p_tenant_id is not null then
    select m.tenant_id into v_tenant from app.membership m
    where m.user_id = v_user and m.tenant_id = p_tenant_id;
  end if;
  insert into app.audit_event (tenant_id, actor_user_id, actor_type, action, entity_type, entity_id,
                               outcome, reason, origin, trace_id, metadata)
  values (v_tenant, v_user, case when v_user is null then 'system' else 'user' end, p_action, 'request', null,
          'denied', left(p_reason, 300),
          case when p_origin in ('web', 'mobile', 'api', 'integration') then p_origin else 'api' end,
          p_trace_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end
$$;

grant execute on function
  app.consume_rate_limit(text, integer, integer),
  app.record_security_event(text, text, uuid, text, text, uuid, text, jsonb)
to etare_api;
grant execute on function app.worker_purge_rate_limits() to etare_worker;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;

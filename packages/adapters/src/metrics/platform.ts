import type { Pool } from '../postgres/pool';
import type { LabelValues, MetricFamily } from './registry';

/**
 * Figures of the platform read from PostgreSQL at scrape time (app.platform_metrics,
 * EXP-03): job queue, workers, publications, terminals, files, base maps,
 * notifications, field reports, refusals. Aggregates only; labels are job types,
 * SIS slugs, receipt statuses and refusal actions.
 */
export class PostgresPlatformMetrics {
  constructor(private readonly pool: Pool) {}

  async read(): Promise<unknown> {
    const { rows } = await this.pool.query<{ metrics: unknown }>('select app.platform_metrics() as metrics');
    return rows[0]?.metrics ?? null;
  }
}

type Row = Readonly<Record<string, unknown>>;

const numberOf = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const rowsOf = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((row): row is Row => typeof row === 'object' && row !== null) : [];

const objectOf = (value: unknown): Row => (typeof value === 'object' && value !== null ? (value as Row) : {});

/** One gauge per field of a list section, labelled by one of its columns. */
interface ListGauge {
  readonly section: string;
  readonly label: { readonly name: string; readonly column: string };
  readonly field: string;
  readonly metric: string;
  readonly help: string;
}

/** One gauge per field of an object section. */
interface ObjectGauge {
  readonly section: string;
  readonly field: string;
  readonly metric: string;
  readonly help: string;
}

const job = (field: string, metric: string, help: string): ListGauge => ({
  section: 'jobs',
  label: { name: 'type', column: 'job_type' },
  field,
  metric,
  help,
});
const perSis = (section: string, field: string, metric: string, help: string): ListGauge => ({
  section,
  label: { name: 'tenant', column: 'slug' },
  field,
  metric,
  help,
});

const LIST_GAUGES: readonly ListGauge[] = [
  job('queued', 'etare_jobs_queued', 'Jobs waiting in the queue.'),
  job('retrying', 'etare_jobs_retrying', 'Queued jobs that already failed at least once.'),
  job('running', 'etare_jobs_running', 'Jobs being run by a worker.'),
  job('oldest_queued_seconds', 'etare_jobs_oldest_queued_seconds', 'Age of the oldest runnable queued job.'),
  job('dead_24h', 'etare_jobs_dead_24h', 'Jobs that ended dead over the last 24 hours.'),
  job('succeeded_1h', 'etare_jobs_succeeded_1h', 'Jobs that succeeded over the last hour.'),
  job('duration_p95_seconds', 'etare_jobs_duration_p95_seconds', 'p95 compute time of the jobs of the last hour.'),
  job('wait_p95_seconds', 'etare_jobs_wait_p95_seconds', 'p95 queue wait of the jobs started over the last hour.'),
  perSis('publications', 'in_force', 'etare_publications_in_force', 'Versions in force (published).'),
  perSis('publications', 'published_24h', 'etare_publications_published_24h', 'Versions published over 24 hours.'),
  perSis('publications', 'failed_24h', 'etare_publications_failed_24h', 'Publications failed over 24 hours.'),
  perSis('publications', 'stuck', 'etare_publications_stuck', 'Publications queued or building for over 15 minutes.'),
  perSis(
    'publications',
    'duration_p95_seconds',
    'etare_publications_duration_p95_seconds',
    'p95 time from request to publication over 24 hours.',
  ),
  perSis('devices', 'active', 'etare_devices_active', 'Enrolled terminals.'),
  perSis('devices', 'late', 'etare_devices_late', 'Terminals without an installation receipt for 7 days.'),
  perSis('devices', 'contacted_24h', 'etare_devices_contacted_24h', 'Terminals that contacted the server in 24 hours.'),
  perSis(
    'devices',
    'contacted_up_to_date_24h',
    'etare_devices_contacted_up_to_date_24h',
    'Terminals contacted in 24 hours that installed the generation they were announced.',
  ),
  perSis(
    'devices',
    'holding_withdrawn',
    'etare_devices_holding_withdrawn',
    'Terminals still holding a withdrawn version.',
  ),
  perSis(
    'integrity',
    'integrity_errors_24h',
    'etare_sync_integrity_errors_24h',
    'Receipts of terminals that refused content (hash, signature, replay) over 24 hours.',
  ),
  perSis('files', 'clean_bytes', 'etare_files_clean_bytes', 'Bytes of verified files.'),
  perSis('files', 'pending', 'etare_files_pending', 'Uploaded files waiting for their verification.'),
  perSis(
    'files',
    'pending_oldest_seconds',
    'etare_files_pending_oldest_seconds',
    'Age of the oldest file waiting for its verification.',
  ),
  perSis('files', 'rejected_24h', 'etare_files_rejected_24h', 'Files rejected over 24 hours.'),
  perSis('field_reports', 'new', 'etare_field_reports_new', 'Field reports not triaged yet.'),
  perSis(
    'field_reports',
    'oldest_new_seconds',
    'etare_field_reports_oldest_new_seconds',
    'Age of the oldest field report not triaged.',
  ),
];

const OBJECT_GAUGES: readonly ObjectGauge[] = [
  {
    section: 'workers',
    field: 'alive',
    metric: 'etare_workers_alive',
    help: 'Workers that beat in the last 2 minutes.',
  },
  {
    section: 'workers',
    field: 'last_seen_seconds',
    metric: 'etare_workers_last_seen_seconds',
    help: 'Seconds since the last beat of any worker (-1: never).',
  },
  { section: 'basemaps', field: 'ready', metric: 'etare_basemaps_ready', help: 'Base maps in force.' },
  {
    section: 'basemaps',
    field: 'ready_bytes',
    metric: 'etare_basemaps_ready_bytes',
    help: 'Bytes of base maps in force.',
  },
  {
    section: 'basemaps',
    field: 'failed',
    metric: 'etare_basemaps_failed_24h',
    help: 'Base map builds failed in 24 hours.',
  },
  {
    section: 'basemaps',
    field: 'renewal_due',
    metric: 'etare_basemaps_renewal_due',
    help: 'Base maps past their six-month renewal.',
  },
  {
    section: 'notifications',
    field: 'pending',
    metric: 'etare_notifications_pending',
    help: 'Notifications not sent yet.',
  },
  {
    section: 'notifications',
    field: 'pending_oldest_seconds',
    metric: 'etare_notifications_pending_oldest_seconds',
    help: 'Age of the oldest notification not sent.',
  },
  {
    section: 'notifications',
    field: 'failed_24h',
    metric: 'etare_notifications_failed_24h',
    help: 'Notifications failed over 24 hours.',
  },
  { section: 'database', field: 'size_bytes', metric: 'etare_database_size_bytes', help: 'Size of the database.' },
];

const RECEIPTS_METRIC = 'etare_sync_receipts_24h';
const SECURITY_METRIC = 'etare_security_denied_1h';

/** Every metric name the platform exposes from the database (alert rules are checked against it). */
export const PLATFORM_METRIC_NAMES: readonly string[] = [
  ...new Set([
    ...LIST_GAUGES.map((gauge) => gauge.metric),
    ...OBJECT_GAUGES.map((gauge) => gauge.metric),
    RECEIPTS_METRIC,
    SECURITY_METRIC,
  ]),
];

/** Turns the snapshot of app.platform_metrics() into metric families. */
export function platformFamilies(snapshot: unknown): MetricFamily[] {
  const data = objectOf(snapshot);
  const families: MetricFamily[] = [];
  for (const gauge of LIST_GAUGES) {
    families.push({
      name: gauge.metric,
      help: gauge.help,
      type: 'gauge',
      samples: rowsOf(data[gauge.section]).map((row) => ({
        labels: { [gauge.label.name]: String(row[gauge.label.column] ?? '') } as LabelValues,
        value: numberOf(row[gauge.field]),
      })),
    });
  }
  for (const gauge of OBJECT_GAUGES) {
    families.push({
      name: gauge.metric,
      help: gauge.help,
      type: 'gauge',
      samples: [{ value: numberOf(objectOf(data[gauge.section])[gauge.field]) }],
    });
  }
  families.push({
    name: RECEIPTS_METRIC,
    help: 'Installation receipts of the terminals over 24 hours, by outcome.',
    type: 'gauge',
    samples: rowsOf(data['receipts']).map((row) => ({
      labels: { tenant: String(row['slug'] ?? ''), status: String(row['status'] ?? '') },
      value: numberOf(row['count']),
    })),
  });
  families.push({
    name: SECURITY_METRIC,
    help: 'Refusals traced in the audit log over the last hour, by action.',
    type: 'gauge',
    samples: rowsOf(data['security']).map((row) => ({
      labels: { action: String(row['action'] ?? '') },
      value: numberOf(row['count']),
    })),
  });
  return families;
}

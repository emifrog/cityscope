import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { API_METRIC_NAMES, ApiMetrics } from './api-metrics';
import { PLATFORM_METRIC_NAMES, platformFamilies } from './platform';
import { MetricsRegistry, renderFamilies } from './registry';

const snapshot = {
  generated_at: '2026-10-28T10:00:00Z',
  jobs: [
    {
      job_type: 'publication.build',
      queued: 2,
      retrying: 1,
      running: 1,
      oldest_queued_seconds: 42.5,
      dead_24h: 0,
      succeeded_1h: 7,
      duration_p95_seconds: 3.25,
      wait_p95_seconds: 0.8,
    },
  ],
  workers: { alive: 1, last_seen_seconds: 12 },
  publications: [
    { slug: 'sdis-demo-06', in_force: 3, published_24h: 1, failed_24h: 0, stuck: 0, duration_p95_seconds: 4 },
  ],
  devices: [
    {
      slug: 'sdis-demo-06',
      active: 2,
      late: 1,
      contacted_24h: 1,
      contacted_up_to_date_24h: 1,
      holding_withdrawn: 0,
    },
  ],
  receipts: [{ slug: 'sdis-demo-06', status: 'installed', count: 5 }],
  integrity: [{ slug: 'sdis-demo-06', integrity_errors_24h: 0 }],
  files: [{ slug: 'sdis-demo-06', clean_bytes: '250054', pending: 0, pending_oldest_seconds: 0, rejected_24h: 0 }],
  field_reports: [{ slug: 'sdis-demo-06', new: 1, oldest_new_seconds: 60 }],
  basemaps: { ready: 2, ready_bytes: 4096, failed: 0, renewal_due: 0 },
  notifications: { pending: 0, pending_oldest_seconds: 0, failed_24h: 1 },
  security: [{ action: 'security.forbidden', count: 3 }],
  backups: { last_success_seconds: 3600.5, last_archive_bytes: 268036502, last_missing_objects: 0 },
  database: { size_bytes: 1234 },
};

describe('metrics in the text exposition format (EXP-03)', () => {
  it('renders counters and histograms with escaped labels', () => {
    const registry = new MetricsRegistry();
    const counter = registry.counter('etare_test_total', 'A "test".', ['route']);
    counter.inc({ route: '/a"b\\c' });
    counter.inc({ route: '/a"b\\c' }, 2);
    const histogram = registry.histogram('etare_test_seconds', 'Durations.', ['route'], [1, 0.1]);
    histogram.observe({ route: '/x' }, 0.05);
    histogram.observe({ route: '/x' }, 0.5);
    expect(registry.render()).toBe(
      [
        '# HELP etare_test_total A "test".',
        '# TYPE etare_test_total counter',
        'etare_test_total{route="/a\\"b\\\\c"} 3',
        '# HELP etare_test_seconds Durations.',
        '# TYPE etare_test_seconds histogram',
        'etare_test_seconds_bucket{route="/x",le="0.1"} 1',
        'etare_test_seconds_bucket{route="/x",le="1"} 2',
        'etare_test_seconds_bucket{route="/x",le="+Inf"} 2',
        'etare_test_seconds_sum{route="/x"} 0.55',
        'etare_test_seconds_count{route="/x"} 2',
        '',
      ].join('\n'),
    );
    expect(() => counter.inc({ other: 'x' })).toThrow(/unknown label/);
    expect(() => registry.counter('etare_test_total', 'again')).toThrow(/twice/);
    expect(() => registry.counter('Bad-Name', 'x')).toThrow(/Invalid/);
  });

  it('turns the figures of the platform into gauges with bounded labels', () => {
    const text = renderFamilies(platformFamilies(snapshot));
    expect(text).toContain('etare_jobs_queued{type="publication.build"} 2\n');
    expect(text).toContain('etare_jobs_oldest_queued_seconds{type="publication.build"} 42.5\n');
    expect(text).toContain('etare_workers_alive 1\n');
    expect(text).toContain('etare_backup_last_success_seconds 3600.5\n');
    expect(text).toContain('etare_files_clean_bytes{tenant="sdis-demo-06"} 250054\n');
    expect(text).toContain('etare_sync_receipts_24h{tenant="sdis-demo-06",status="installed"} 5\n');
    expect(text).toContain('etare_security_denied_1h{action="security.forbidden"} 3\n');
    // Only job types, SIS slugs, statuses and actions as labels: never an identifier.
    const labels = [...text.matchAll(/\{([^}]*)\}/g)].flatMap(([, body]) =>
      (body ?? '').split(',').map((pair) => pair.split('=')[0]),
    );
    expect(new Set(labels)).toEqual(new Set(['type', 'tenant', 'status', 'action']));
    // Every family declared by name.
    for (const name of PLATFORM_METRIC_NAMES) expect(text).toContain(`# TYPE ${name} gauge`);
  });

  it('exposes the API, its SQL pool, and says when the platform cannot be read', async () => {
    const pool = { totalCount: 4, idleCount: 3, waitingCount: 0 };
    const metrics = new ApiMetrics({
      component: 'api',
      version: '1.2.3',
      pool,
      platform: { read: async () => snapshot },
    });
    metrics.observeRequest('GET', '/api/v1/sites/:id', 200, 0.12);
    metrics.observeRequest('GET', '/api/v1/sites/:id', 503, 0.02);
    const text = await metrics.render();
    expect(text).toContain('etare_build_info{component="api",version="1.2.3"} 1\n');
    expect(text).toContain('etare_db_pool_connections{state="idle"} 3\n');
    expect(text).toContain('etare_http_requests_total{method="GET",route="/api/v1/sites/:id",status="5xx"} 1\n');
    expect(text).toContain('etare_http_request_duration_seconds_count{method="GET",route="/api/v1/sites/:id"} 2\n');
    expect(text).toContain('etare_platform_metrics_up 1\n');

    const broken = new ApiMetrics({
      component: 'api',
      version: 'dev',
      pool,
      platform: {
        read: async () => {
          throw new Error('database down');
        },
      },
    });
    const degraded = await broken.render();
    expect(degraded).toContain('etare_platform_metrics_up 0\n');
    expect(degraded).toContain('etare_platform_metrics_errors_total 1\n');
  });
});

describe('alert rules of the platform (infra/monitoring/prometheus/alerts.yml)', () => {
  const file = resolve(import.meta.dirname, '../../../../infra/monitoring/prometheus/alerts.yml');
  const rules = (
    parse(readFileSync(file, 'utf8')) as {
      groups: {
        name: string;
        rules: { alert: string; expr: string; labels: Record<string, string>; annotations: Record<string, string> }[];
      }[];
    }
  ).groups.flatMap((group) => group.rules);
  const procedures = readFileSync(resolve(import.meta.dirname, '../../../../docs/exploitation/supervision.md'), 'utf8');

  it('use only metrics the platform exposes', () => {
    const known = new Set(API_METRIC_NAMES);
    for (const rule of rules) {
      for (const [name] of rule.expr.matchAll(/\betare_[a-z0-9_]+/g)) {
        expect(known.has(name.replace(/_(bucket|sum|count)$/, '')), `${rule.alert}: ${name}`).toBe(true);
      }
    }
  });

  it('name a severity, a service, an owner, an impact and an existing procedure', () => {
    expect(rules.length).toBeGreaterThan(15);
    for (const rule of rules) {
      expect(['critical', 'warning', 'info'], rule.alert).toContain(rule.labels['severity']);
      expect(rule.labels['service'], rule.alert).toBeTruthy();
      expect(['exploitation', 'sis'], rule.alert).toContain(rule.labels['owner']);
      expect(rule.annotations['impact'], rule.alert).toBeTruthy();
      const anchor = /^docs\/exploitation\/supervision\.md#([a-z0-9-]+)$/.exec(
        rule.annotations['runbook_url'] ?? '',
      )?.[1];
      expect(anchor, rule.alert).toBeTruthy();
      expect(procedures, `${rule.alert}: procedure ${anchor}`).toContain(`<a id="${anchor}"></a>`);
    }
  });
});

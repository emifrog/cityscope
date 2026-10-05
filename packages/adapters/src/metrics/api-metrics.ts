import { PLATFORM_METRIC_NAMES, platformFamilies } from './platform';
import { MetricsRegistry, renderFamilies, type MetricFamily } from './registry';

/** Connections of a pg pool (saturation of the SQL pool, architecture §29). */
export interface PoolStats {
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
}

export interface ApiMetricsOptions {
  readonly component: string;
  readonly version: string;
  readonly pool: PoolStats;
  /** Figures of the platform read at scrape time; null: process metrics only. */
  readonly platform: { read(): Promise<unknown> } | null;
}

const LATENCY_BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/** Process metrics of the API, and the metrics of the platform read at each scrape. */
export class ApiMetrics {
  private readonly registry = new MetricsRegistry();
  private readonly requests = this.registry.counter(
    'etare_http_requests_total',
    'Requests answered by the API, by route template and status class.',
    ['method', 'route', 'status'],
  );
  private readonly durations = this.registry.histogram(
    'etare_http_request_duration_seconds',
    'Time to answer a request, by route template.',
    ['method', 'route'],
    LATENCY_BUCKETS,
  );
  private readonly platformErrors = this.registry.counter(
    'etare_platform_metrics_errors_total',
    'Scrapes whose figures of the platform could not be read.',
  );

  constructor(private readonly options: ApiMetricsOptions) {}

  /** [route] is the template (`/api/v1/sites/:id`), never the concrete path. */
  observeRequest(method: string, route: string, status: number, seconds: number): void {
    this.requests.inc({ method, route, status: `${Math.floor(status / 100)}xx` });
    this.durations.observe({ method, route }, seconds);
  }

  async render(): Promise<string> {
    const { pool } = this.options;
    const own: MetricFamily[] = [
      {
        name: 'etare_build_info',
        help: 'Component and version of the process.',
        type: 'gauge',
        samples: [{ labels: { component: this.options.component, version: this.options.version }, value: 1 }],
      },
      {
        name: 'etare_db_pool_connections',
        help: 'Connections of the SQL pool of the process, by state.',
        type: 'gauge',
        samples: [
          { labels: { state: 'total' }, value: pool.totalCount },
          { labels: { state: 'idle' }, value: pool.idleCount },
          { labels: { state: 'waiting' }, value: pool.waitingCount },
        ],
      },
    ];
    let platform: MetricFamily[] = [];
    let up = 0;
    if (this.options.platform) {
      try {
        platform = platformFamilies(await this.options.platform.read());
        up = 1;
      } catch {
        this.platformErrors.inc();
      }
    }
    own.push({
      name: 'etare_platform_metrics_up',
      help: 'Whether the figures of the platform were read from the database (1) or not (0).',
      type: 'gauge',
      samples: [{ value: up }],
    });
    return renderFamilies(own) + this.registry.render() + renderFamilies(platform);
  }
}

/** Every metric name the API exposes (the alert rules are checked against this list). */
export const API_METRIC_NAMES: readonly string[] = [
  'etare_build_info',
  'etare_db_pool_connections',
  'etare_platform_metrics_up',
  'etare_http_requests_total',
  'etare_http_request_duration_seconds',
  'etare_platform_metrics_errors_total',
  ...PLATFORM_METRIC_NAMES,
];

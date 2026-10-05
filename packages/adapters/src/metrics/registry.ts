/**
 * Metrics in the Prometheus text exposition format (EXP-03, ADR-028), without a
 * dependency: counters and histograms kept by the process, gauges computed at
 * scrape time. Labels stay bounded (routes, job types, SIS slugs, statuses):
 * never a site, a person or an identifier.
 */

export type LabelValues = Readonly<Record<string, string>>;

export type MetricType = 'counter' | 'gauge' | 'histogram';

/** A family computed at scrape time (gauges and counters read elsewhere). */
export interface MetricFamily {
  readonly name: string;
  readonly help: string;
  readonly type: 'counter' | 'gauge';
  readonly samples: readonly { readonly labels?: LabelValues; readonly value: number }[];
}

const NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function formatLabels(labels: LabelValues | undefined): string {
  const entries = Object.entries(labels ?? {});
  if (entries.length === 0) return '';
  return `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',')}}`;
}

function formatValue(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return '+Inf';
  if (value === Number.NEGATIVE_INFINITY) return '-Inf';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

function header(name: string, help: string, type: MetricType): string {
  return `# HELP ${name} ${help.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}\n# TYPE ${name} ${type}\n`;
}

/** Renders families computed at scrape time. */
export function renderFamilies(families: readonly MetricFamily[]): string {
  return families
    .map(
      (family) =>
        header(family.name, family.help, family.type) +
        family.samples
          .map((sample) => `${family.name}${formatLabels(sample.labels)} ${formatValue(sample.value)}\n`)
          .join(''),
    )
    .join('');
}

const keyOf = (labelNames: readonly string[], labels: LabelValues) =>
  JSON.stringify(labelNames.map((name) => labels[name] ?? ''));

function checkLabels(name: string, labelNames: readonly string[], labels: LabelValues): void {
  for (const label of Object.keys(labels)) {
    if (!labelNames.includes(label)) throw new Error(`Metric ${name}: unknown label ${label}.`);
  }
}

export class Counter {
  private readonly values = new Map<string, { labels: LabelValues; value: number }>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[],
  ) {}

  inc(labels: LabelValues = {}, value = 1): void {
    checkLabels(this.name, this.labelNames, labels);
    const key = keyOf(this.labelNames, labels);
    const current = this.values.get(key);
    if (current) current.value += value;
    else this.values.set(key, { labels, value });
  }

  render(): string {
    return renderFamilies([{ name: this.name, help: this.help, type: 'counter', samples: [...this.values.values()] }]);
  }
}

export class Histogram {
  private readonly series = new Map<string, { labels: LabelValues; counts: number[]; sum: number; count: number }>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[],
    readonly buckets: readonly number[],
  ) {}

  observe(labels: LabelValues, value: number): void {
    checkLabels(this.name, this.labelNames, labels);
    const key = keyOf(this.labelNames, labels);
    let entry = this.series.get(key);
    if (!entry) {
      entry = { labels, counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.series.set(key, entry);
    }
    this.buckets.forEach((bound, index) => {
      if (value <= bound) entry.counts[index] = (entry.counts[index] ?? 0) + 1;
    });
    entry.sum += value;
    entry.count += 1;
  }

  render(): string {
    let text = header(this.name, this.help, 'histogram');
    for (const { labels, counts, sum, count } of this.series.values()) {
      this.buckets.forEach((bound, index) => {
        text += `${this.name}_bucket${formatLabels({ ...labels, le: formatValue(bound) })} ${counts[index] ?? 0}\n`;
      });
      text += `${this.name}_bucket${formatLabels({ ...labels, le: '+Inf' })} ${count}\n`;
      text += `${this.name}_sum${formatLabels(labels)} ${formatValue(sum)}\n`;
      text += `${this.name}_count${formatLabels(labels)} ${count}\n`;
    }
    return text;
  }
}

/** Metrics kept by a process; [render] concatenates them with families computed at scrape time. */
export class MetricsRegistry {
  private readonly metrics: (Counter | Histogram)[] = [];

  private register<M extends Counter | Histogram>(metric: M): M {
    if (!NAME_PATTERN.test(metric.name)) throw new Error(`Invalid metric name ${metric.name}.`);
    if (this.metrics.some((existing) => existing.name === metric.name)) {
      throw new Error(`Metric ${metric.name} registered twice.`);
    }
    this.metrics.push(metric);
    return metric;
  }

  counter(name: string, help: string, labelNames: readonly string[] = []): Counter {
    return this.register(new Counter(name, help, labelNames));
  }

  histogram(name: string, help: string, labelNames: readonly string[], buckets: readonly number[]): Histogram {
    return this.register(
      new Histogram(
        name,
        help,
        labelNames,
        [...buckets].sort((a, b) => a - b),
      ),
    );
  }

  render(): string {
    return this.metrics.map((metric) => metric.render()).join('');
  }
}

/** Content type of the text exposition format. */
export const METRICS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

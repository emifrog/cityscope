export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /authorization|cookie|password|secret|token|signed_?url|api_?key/i;

/** Masks values of sensitive keys, recursively (tokens, signed URLs, passwords never reach the logs). */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item, depth + 1)]),
  );
}

/** Structured JSON logs on stdout (one line per event), ready for any collector. */
export function createLogger(
  base: Record<string, unknown>,
  options: { level?: LogLevel; write?: (line: string) => void } = {},
): Logger {
  const minimum = ORDER[options.level ?? 'info'];
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const log = (level: LogLevel, message: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[level] < minimum) return;
    const entry = { time: new Date().toISOString(), level, msg: message, ...base, ...fields };
    write(JSON.stringify(redact(entry)));
  };
  return {
    debug: (message, fields) => log('debug', message, fields),
    info: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields),
    child: (fields) => createLogger({ ...base, ...fields }, options),
  };
}

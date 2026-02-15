type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const configuredLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const minLevel = LOG_LEVELS[configuredLevel] ?? 1;
const isProduction = process.env.NODE_ENV === 'production';

interface LogEntry {
  level: LogLevel;
  context: string;
  message: string;
  data?: Record<string, unknown>;
  durationMs?: number;
  error?: string;
  stack?: string;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= minLevel;
}

function formatLog(entry: LogEntry): string {
  if (isProduction) {
    // JSON format for Vercel log drain
    return JSON.stringify(entry);
  }

  // Human-readable for development
  const time = new Date().toISOString().split('T')[1].replace('Z', '');
  const prefix = `${time} [${entry.level.toUpperCase()}] ${entry.context}`;
  let msg = `${prefix}: ${entry.message}`;
  if (entry.durationMs !== undefined) {
    msg += ` (${entry.durationMs}ms)`;
  }
  if (entry.data && Object.keys(entry.data).length > 0) {
    msg += ` ${JSON.stringify(entry.data)}`;
  }
  if (entry.error) {
    msg += ` | Error: ${entry.error}`;
  }
  return msg;
}

function emit(entry: LogEntry) {
  const formatted = formatLog(entry);
  switch (entry.level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, error?: unknown, data?: Record<string, unknown>) => void;
  timed: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
}

export function createLogger(context: string): Logger {
  return {
    debug(message, data) {
      if (shouldLog('debug')) emit({ level: 'debug', context, message, data });
    },
    info(message, data) {
      if (shouldLog('info')) emit({ level: 'info', context, message, data });
    },
    warn(message, data) {
      if (shouldLog('warn')) emit({ level: 'warn', context, message, data });
    },
    error(message, err?, data?) {
      if (!shouldLog('error')) return;
      const errMsg = err instanceof Error ? err.message : err ? String(err) : undefined;
      const stack = err instanceof Error ? err.stack : undefined;
      emit({ level: 'error', context, message, error: errMsg, stack, data });
    },
    async timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = Date.now();
      try {
        const result = await fn();
        if (shouldLog('info')) {
          emit({ level: 'info', context, message: label, durationMs: Date.now() - start });
        }
        return result;
      } catch (err) {
        if (shouldLog('error')) {
          const errMsg = err instanceof Error ? err.message : String(err);
          emit({ level: 'error', context, message: `${label} failed`, durationMs: Date.now() - start, error: errMsg });
        }
        throw err;
      }
    },
  };
}

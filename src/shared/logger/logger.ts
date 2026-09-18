type LogLevel = "debug" | "info" | "warn" | "error";

const levelPrefixes: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

function log(scope: string, level: LogLevel, message: string, meta?: unknown): void {
  const timestamp = new Date().toISOString();
  const prefix = `${timestamp} [${levelPrefixes[level]}] [${scope}]`;

  if (meta !== undefined) {
    console[level === "debug" ? "log" : level](prefix, message, meta);
  } else {
    console[level === "debug" ? "log" : level](prefix, message);
  }
}

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, meta) => log(scope, "debug", message, meta),
    info: (message, meta) => log(scope, "info", message, meta),
    warn: (message, meta) => log(scope, "warn", message, meta),
    error: (message, meta) => log(scope, "error", message, meta),
  };
}

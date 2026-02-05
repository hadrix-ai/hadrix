import path from "node:path";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

export type AppLogger = Logger & {
  path: string;
  close: () => Promise<void>;
};

export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

type AppLoggerParams = {
  stateDir: string;
  label?: string;
};

export async function createAppLogger(params: AppLoggerParams): Promise<AppLogger> {
  const dir = path.join(params.stateDir, "logs");
  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const label = params.label ?? "app";
  const filePath = path.join(dir, `${label}-${timestamp}.jsonl`);
  const stream = createWriteStream(filePath, { flags: "a" });
  let closed = false;

  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (closed) return;
    const normalizedLevel = level === "warn" ? "warning" : level;
    const payload = {
      timestamp: new Date().toISOString(),
      level: normalizedLevel,
      message,
      meta: meta ?? undefined
    };
    try {
      stream.write(`${JSON.stringify(payload)}\n`);
    } catch {
      closed = true;
    }
  };

  stream.on("error", () => {
    closed = true;
  });

  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve) => stream.end(resolve));
  };

  return {
    path: filePath,
    close,
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta)
  };
}

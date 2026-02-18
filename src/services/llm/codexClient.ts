import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LLMProviderId } from "../../config/loadConfig.js";
import {
  ProviderApiResponseError,
  ProviderRequestFailedError
} from "../../errors/provider.errors.js";
import type { ChatMessage, LlmAdapterInput, LlmAdapterResult } from "./llm.js";

// Shared constants and types for the Codex CLI adapter.

export const CODEX_CLI_COMMAND = "codex";
const CODEX_JSON_FLAG = "--json";
const CODEX_OUTPUT_LAST_MESSAGE_FLAG = "--output-last-message";
const CODEX_EXEC_CONTEXT = "codex exec";
const CODEX_ERROR_DETAIL_LIMIT = 2000;
const CODEX_REASONING_CONFIG_FLAG = "-c";
const CODEX_REASONING_EFFORT = 'model_reasoning_effort="high"';
const CODEX_LOGIN_HINT = "Run `codex login` and retry.";
const CODEX_LOGIN_NON_INTERACTIVE_HINT =
  "Codex CLI is not authenticated. Run `codex login` in an interactive terminal, or `codex login --with-api-key` for non-interactive environments, then retry.";
const CODEX_NETWORK_HINT = "Check your network connection and retry.";
const CODEX_GENERIC_HINT = "Retry the request or run `codex login status` to verify authentication.";
const CODEX_OUTPUT_PREVIEW_LIMIT = 2000;

export type CodexJsonEvent = Record<string, unknown>;

export type CodexExecResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  lastMessage: string | null;
  jsonEvents: CodexJsonEvent[];
  jsonErrorEvents: CodexJsonEvent[];
  durationMs: number;
};

export type CodexExecOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
};

export type CodexAdapterOptions = Pick<CodexExecOptions, "cwd" | "env">;
type CodexExecRunner = (args: string[], options?: CodexExecOptions) => Promise<CodexExecResult>;

type OutputLastMessageTarget = {
  path: string;
  cleanup?: () => Promise<void>;
};

const CODEX_ROLE_LABELS: Record<ChatMessage["role"], string> = {
  system: "System",
  user: "User",
  assistant: "Assistant"
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeJsonEventType = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : null;
};

const parseJsonLine = (line: string): CodexJsonEvent | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as CodexJsonEvent;
  } catch {
    return null;
  }
};

const parseJsonLines = (payload: string): CodexJsonEvent[] => {
  if (!payload.trim()) return [];
  const events: CodexJsonEvent[] = [];
  for (const line of payload.split(/\r?\n/)) {
    const event = parseJsonLine(line);
    if (event) events.push(event);
  }
  return events;
};

const isErrorEvent = (event: CodexJsonEvent): boolean => {
  const typeValue = normalizeJsonEventType(
    event.type ?? event.event ?? event.level ?? event.severity ?? event.status
  );
  if (typeValue) {
    if (typeValue === "error" || typeValue === "fatal" || typeValue === "panic") {
      return true;
    }
    if (typeValue.includes("error") || typeValue.includes("fatal") || typeValue.includes("panic")) {
      return true;
    }
  }
  const errorPayload = event.error;
  if (typeof errorPayload === "string") return errorPayload.trim().length > 0;
  if (errorPayload && typeof errorPayload === "object") return true;
  return false;
};

const parseCodexJsonEvents = (
  stdout: string,
  stderr: string
): { events: CodexJsonEvent[]; errorEvents: CodexJsonEvent[] } => {
  const events = [...parseJsonLines(stdout), ...parseJsonLines(stderr)];
  return {
    events,
    errorEvents: events.filter(isErrorEvent)
  };
};

const normalizeErrorMessage = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= CODEX_ERROR_DETAIL_LIMIT) return trimmed;
  const clipped = trimmed.slice(0, Math.max(0, CODEX_ERROR_DETAIL_LIMIT - 3)).trimEnd();
  return `${clipped}...`;
};

const extractStringValue = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const extractErrorText = (value: unknown): string | null => {
  const direct = extractStringValue(value);
  if (direct) return direct;
  if (!isRecord(value)) return null;
  return (
    extractStringValue(value.message) ??
    extractStringValue(value.detail) ??
    extractStringValue(value.error) ??
    extractStringValue(value.reason) ??
    extractStringValue(value.title) ??
    extractStringValue(value.description) ??
    extractStringValue(value.summary) ??
    null
  );
};

const normalizeStatusCode = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    if (normalized >= 100 && normalized <= 599) return normalized;
    return null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{3}$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed >= 100 && parsed <= 599 ? parsed : null;
};

const extractStatusFromRecord = (value: Record<string, unknown>): number | null => {
  const candidates = [
    value.status,
    value.statusCode,
    value.status_code,
    value.httpStatus,
    value.http_status
  ];
  for (const candidate of candidates) {
    const normalized = normalizeStatusCode(candidate);
    if (normalized !== null) return normalized;
  }
  return null;
};

const extractCodeFromRecord = (value: Record<string, unknown>): string | null => {
  const candidates = [value.code, value.error_code, value.errno];
  for (const candidate of candidates) {
    const text = extractStringValue(candidate);
    if (text) return text;
  }
  return null;
};

const extractEventErrorText = (event: CodexJsonEvent): string | null => {
  const candidates = [
    event.message,
    event.error,
    event.detail,
    event.reason,
    event.title,
    event.description,
    event.summary
  ];
  for (const candidate of candidates) {
    const text = extractErrorText(candidate);
    if (text) return text;
  }
  return null;
};

const collectCodexRetryMetadata = (
  result: CodexExecResult
): { statusCode?: number; code?: string } => {
  let statusCode: number | undefined;
  let code: string | undefined;
  for (const event of result.jsonErrorEvents) {
    if (statusCode === undefined) {
      statusCode = extractStatusFromRecord(event) ?? undefined;
    }
    if (code === undefined) {
      code = extractCodeFromRecord(event) ?? undefined;
    }
    if (isRecord(event.error)) {
      if (statusCode === undefined) {
        statusCode = extractStatusFromRecord(event.error) ?? undefined;
      }
      if (code === undefined) {
        code = extractCodeFromRecord(event.error) ?? undefined;
      }
    }
    if (statusCode !== undefined && code !== undefined) break;
  }
  return { statusCode, code };
};

const attachCodexRetryMetadata = <T extends Error>(
  error: T,
  metadata: { statusCode?: number; code?: string }
): T => {
  const target = error as T & { status?: number; statusCode?: number; code?: string };
  if (
    metadata.statusCode !== undefined &&
    target.status === undefined &&
    target.statusCode === undefined
  ) {
    target.statusCode = metadata.statusCode;
  }
  if (metadata.code && target.code === undefined) {
    target.code = metadata.code;
  }
  return error;
};

const collectCodexErrorDetails = (result: CodexExecResult): string[] => {
  const details: string[] = [];
  const seen = new Set<string>();
  const addDetail = (value: string | null) => {
    if (!value) return;
    const normalized = normalizeErrorMessage(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    details.push(normalized);
  };
  for (const event of result.jsonErrorEvents) {
    addDetail(extractEventErrorText(event));
  }
  addDetail(result.stderr);
  if (details.length === 0) {
    addDetail(result.stdout);
  }
  return details;
};

const isCodexAuthErrorMessage = (message: string): boolean => {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("not logged in") ||
    lowered.includes("login") ||
    lowered.includes("log in") ||
    lowered.includes("unauthorized") ||
    lowered.includes("authentication") ||
    (lowered.includes("auth") && lowered.includes("required")) ||
    lowered.includes("access token") ||
    lowered.includes("api key")
  );
};

const isCodexNetworkErrorMessage = (message: string): boolean => {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("timeout") ||
    lowered.includes("timed out") ||
    lowered.includes("network") ||
    lowered.includes("connection") ||
    lowered.includes("socket") ||
    lowered.includes("econn") ||
    lowered.includes("enotfound") ||
    lowered.includes("dns")
  );
};

const buildCodexFailureHint = (message: string): string | null => {
  const lowered = message.toLowerCase();
  if (isCodexAuthErrorMessage(lowered)) {
    if (lowered.includes("codex login")) return null;
    return process.stdin?.isTTY ? CODEX_LOGIN_HINT : CODEX_LOGIN_NON_INTERACTIVE_HINT;
  }
  if (isCodexNetworkErrorMessage(lowered)) return CODEX_NETWORK_HINT;
  if (lowered.includes("login status")) return null;
  return CODEX_GENERIC_HINT;
};

const appendHint = (message: string, hint: string | null): string => {
  if (!hint) return message;
  const trimmed = message.trim();
  if (!trimmed) return hint;
  const normalizedHint = hint.trim();
  if (!normalizedHint) return trimmed;
  if (trimmed.toLowerCase().includes(normalizedHint.toLowerCase())) return trimmed;
  const separator = /[.!?]$/.test(trimmed) ? " " : ". ";
  return `${trimmed}${separator}${normalizedHint}`;
};

const buildCodexExitMessage = (result: CodexExecResult): string => {
  const details = collectCodexErrorDetails(result);
  const detailMessage = details.length ? normalizeErrorMessage(details.join(" | ")) : "";
  const context =
    result.signal
      ? `Codex CLI terminated with signal ${result.signal}.`
      : result.exitCode !== null
        ? `Codex CLI exited with code ${result.exitCode}.`
        : "Codex CLI exited with an unknown status.";
  const base = detailMessage ? `${context} ${detailMessage}` : context;
  return appendHint(base, buildCodexFailureHint(detailMessage || context));
};

const buildCodexSpawnMessage = (error: unknown): string => {
  const code = isRecord(error) ? error.code : null;
  if (code === "ENOENT") {
    return "Codex CLI not found on PATH. Install it and ensure `codex` is available.";
  }
  if (code === "EACCES") {
    return "Codex CLI is not executable. Check permissions for the `codex` binary.";
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = normalizeErrorMessage(message);
  if (normalized) return `Codex CLI failed to start: ${normalized}`;
  return "Codex CLI failed to start.";
};

const isCodexExecFailure = (result: CodexExecResult): boolean =>
  result.exitCode !== 0 || result.signal !== null;

const buildCodexPrompt = (messages: ChatMessage[]): string => {
  if (messages.length === 0) return "";
  const formatted = messages.map((message) => {
    const label = CODEX_ROLE_LABELS[message.role] ?? "User";
    return `${label}:\n${message.content}`;
  });
  const lastRole = messages[messages.length - 1]?.role;
  if (lastRole !== "assistant") {
    formatted.push("Assistant:");
  }
  return formatted.join("\n\n");
};

const buildCodexArgs = (input: LlmAdapterInput): string[] => [
  CODEX_REASONING_CONFIG_FLAG,
  CODEX_REASONING_EFFORT,
  "--model",
  input.model,
  "--ephemeral",
  "--skip-git-repo-check"
];

const buildCodexOutputPreview = (result: CodexExecResult): string => {
  const combined = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (!combined) return "";
  if (combined.length <= CODEX_OUTPUT_PREVIEW_LIMIT) return combined;
  return `${combined.slice(0, CODEX_OUTPUT_PREVIEW_LIMIT)}...`;
};

export const mapCodexExecFailure = (
  result: CodexExecResult
): ProviderApiResponseError | ProviderRequestFailedError => {
  const message = buildCodexExitMessage(result);
  const metadata = collectCodexRetryMetadata(result);
  if (result.exitCode === null || result.signal) {
    return attachCodexRetryMetadata(
      new ProviderRequestFailedError("LLM", LLMProviderId.Codex, CODEX_EXEC_CONTEXT, message),
      metadata
    );
  }
  return attachCodexRetryMetadata(new ProviderApiResponseError(message), metadata);
};

export const mapCodexExecSpawnFailure = (error: unknown): ProviderRequestFailedError => {
  const message = buildCodexSpawnMessage(error);
  return new ProviderRequestFailedError("LLM", LLMProviderId.Codex, CODEX_EXEC_CONTEXT, message);
};

const extractOutputLastMessagePath = (args: string[]): string | null => {
  const flagIndex = args.findIndex(
    (arg) => arg === CODEX_OUTPUT_LAST_MESSAGE_FLAG || arg.startsWith(`${CODEX_OUTPUT_LAST_MESSAGE_FLAG}=`)
  );
  if (flagIndex < 0) return null;
  const flagValue = args[flagIndex];
  if (flagValue.startsWith(`${CODEX_OUTPUT_LAST_MESSAGE_FLAG}=`)) {
    const [, value] = flagValue.split("=", 2);
    return value?.trim() ? value.trim() : null;
  }
  const nextValue = args[flagIndex + 1];
  if (!nextValue) return null;
  return nextValue.trim() ? nextValue.trim() : null;
};

const buildOutputLastMessageTarget = async (): Promise<OutputLastMessageTarget> => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "hadrix-codex-"));
  const filePath = path.join(tmpDir, "last-message.txt");
  return {
    path: filePath,
    cleanup: async () => {
      await rm(tmpDir, { recursive: true, force: true });
    }
  };
};

export async function runCodexExec(
  args: string[],
  options?: CodexExecOptions
): Promise<CodexExecResult> {
  const existingLastMessagePath = extractOutputLastMessagePath(args);
  const lastMessageTarget = existingLastMessagePath
    ? { path: existingLastMessagePath }
    : await buildOutputLastMessageTarget();
  const outputLastMessagePath = lastMessageTarget.path;
  const argsWithLastMessage = existingLastMessagePath
    ? args
    : [CODEX_OUTPUT_LAST_MESSAGE_FLAG, outputLastMessagePath, ...args];

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const stdin = options?.stdin;
    const shouldWriteStdin = typeof stdin === "string";
    const normalizedArgs = argsWithLastMessage.includes(CODEX_JSON_FLAG)
      ? argsWithLastMessage
      : [CODEX_JSON_FLAG, ...argsWithLastMessage];
    const cleanupLastMessage = async () => {
      if (!lastMessageTarget.cleanup) return;
      try {
        await lastMessageTarget.cleanup();
      } catch {
        return;
      }
    };
    let settled = false;
    const finalizeResolve = (result: CodexExecResult) => {
      if (settled) return;
      settled = true;
      void cleanupLastMessage().finally(() => resolve(result));
    };
    const finalizeReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      void cleanupLastMessage().finally(() => reject(error));
    };
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(CODEX_CLI_COMMAND, ["exec", ...normalizedArgs], {
        cwd: options?.cwd,
        env: options?.env,
        stdio: [shouldWriteStdin ? "pipe" : "ignore", "pipe", "pipe"]
      });
    } catch (error) {
      finalizeReject(error);
      return;
    }
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    if (shouldWriteStdin) {
      if (!proc.stdin) {
        finalizeReject(new Error("Codex exec stdin unavailable."));
        return;
      }
      proc.stdin.end(stdin);
    }
    proc.on("error", (err) => {
      finalizeReject(err);
    });
    proc.on("close", (code, signal) => {
      const { events, errorEvents } = parseCodexJsonEvents(stdout, stderr);
      const finalizeWithMessage = (lastMessage: string | null) => {
        finalizeResolve({
          exitCode: code,
          signal,
          stdout,
          stderr,
          lastMessage,
          jsonEvents: events,
          jsonErrorEvents: errorEvents,
          durationMs: Date.now() - start
        });
      };
      readFile(outputLastMessagePath, "utf-8")
        .then((lastMessage) => {
          finalizeWithMessage(lastMessage);
        })
        .catch(() => {
          finalizeWithMessage(null);
        });
    });
  });
}

export async function runCodexExecOrThrow(
  args: string[],
  options?: CodexExecOptions
): Promise<CodexExecResult> {
  try {
    const result = await runCodexExec(args, options);
    if (isCodexExecFailure(result)) {
      throw mapCodexExecFailure(result);
    }
    return result;
  } catch (error) {
    if (error instanceof ProviderApiResponseError || error instanceof ProviderRequestFailedError) {
      throw error;
    }
    throw mapCodexExecSpawnFailure(error);
  }
}

const runCodexAdapterWithExec = async (
  input: LlmAdapterInput,
  options: CodexAdapterOptions | undefined,
  execRunner: CodexExecRunner
): Promise<LlmAdapterResult> => {
  const prompt = buildCodexPrompt(input.messages);
  const result = await execRunner(buildCodexArgs(input), {
    cwd: options?.cwd,
    env: options?.env,
    stdin: prompt
  });
  const text = typeof result.lastMessage === "string" ? result.lastMessage : "";
  if (!text.trim()) {
    const preview = buildCodexOutputPreview(result);
    const suffix = preview ? ` Output preview: ${preview}` : "";
    throw new Error(`Codex response missing output text.${suffix}`);
  }
  return {
    text,
    raw: result
  };
};

export const __test__ = { runCodexAdapterWithExec };

export async function runCodexAdapter(
  input: LlmAdapterInput,
  options?: CodexAdapterOptions
): Promise<LlmAdapterResult> {
  return runCodexAdapterWithExec(input, options, runCodexExecOrThrow);
}

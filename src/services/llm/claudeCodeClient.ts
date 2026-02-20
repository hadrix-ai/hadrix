import { spawn } from "node:child_process";
import { LLMProviderId } from "../../config/loadConfig.js";
import {
  ProviderApiResponseError,
  ProviderRequestFailedError
} from "../../errors/provider.errors.js";
import type { ChatMessage, LlmAdapterInput, LlmAdapterResult } from "./llm.js";

export const CLAUDE_CODE_CLI_COMMAND = "claude";
export const CLAUDE_CODE_PROMPT_FLAG = "-p";
export const CLAUDE_CODE_INPUT_FORMAT_FLAG = "--input-format";
export const CLAUDE_CODE_INPUT_FORMAT_TEXT = "text";
export const CLAUDE_CODE_PROMPT_TERMINATOR = "--";
export const CLAUDE_CODE_OUTPUT_FORMAT_FLAG = "--output-format";
export const CLAUDE_CODE_JSON_OUTPUT = "json";

const CLAUDE_CODE_EXEC_CONTEXT = "claude -p";
const CLAUDE_CODE_ERROR_DETAIL_LIMIT = 2000;
const CLAUDE_CODE_OUTPUT_PREVIEW_LIMIT = 2000;
const CLAUDE_CODE_FORCE_KILL_GRACE_MS = 2000;
const CLAUDE_CODE_PROMPT_ARG_LIMIT_BYTES = 64 * 1024;
const CLAUDE_CODE_LOGIN_REQUIRED_MESSAGE =
  "Claude Code CLI is not authenticated. Run `claude` and use /login, or `claude setup-token` for non-interactive environments, then retry.";
const CLAUDE_CODE_LOGIN_REQUIRED_MARKERS = [
  "not logged in",
  "not signed in",
  "not authenticated",
  "unauthorized",
  "not authorized",
  "please run /login",
  "run /login",
  "login required",
  "authentication required",
  "login to continue",
  "log in",
  "please sign in",
  "sign in required",
  "sign in to continue",
  "sign-in",
  "signin"
];
const CLAUDE_CODE_LOGIN_HINT = "Run `claude` and use /login, then retry.";
const CLAUDE_CODE_LOGIN_NON_INTERACTIVE_HINT =
  "Claude Code CLI is not authenticated. Run `claude` and use /login in an interactive terminal, or `claude setup-token` for non-interactive environments, then retry.";
const CLAUDE_CODE_NETWORK_HINT = "Check your network connection and retry.";
const CLAUDE_CODE_GENERIC_HINT = "Retry the request or run `claude` to verify authentication.";

const CLAUDE_CODE_ROLE_LABELS: Record<ChatMessage["role"], string> = {
  system: "System",
  user: "User",
  assistant: "Assistant"
};

export type ClaudeCodeExecOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
};

export type ClaudeCodeExecResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  assistantText: string | null;
  jsonOutput: unknown | null;
  durationMs: number;
};

export type ClaudeCodeAdapterOptions = Pick<ClaudeCodeExecOptions, "cwd" | "env" | "timeoutMs">;

export type ClaudeCodePromptInput = {
  args: string[];
  stdin?: string;
};

export type ClaudeCodeJsonParseResult = {
  raw: unknown | null;
  text: string | null;
};

const containsNullByte = (value: string): boolean => value.includes("\u0000");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeTimeoutMs = (value: number | undefined): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
};

const isBooleanLikeTrue = (value: unknown): boolean => value === true || value === "true" || value === 1;

const extractStringValue = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return value.trim().length > 0 ? value : null;
};

const normalizeEventType = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

const isErrorTypeValue = (value: unknown): boolean => {
  const typeValue = normalizeEventType(value);
  if (!typeValue) return false;
  if (typeValue === "error" || typeValue === "fatal" || typeValue === "panic") {
    return true;
  }
  if (typeValue.includes("error") || typeValue.includes("fatal") || typeValue.includes("panic")) {
    return true;
  }
  return false;
};

const normalizeErrorMessage = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= CLAUDE_CODE_ERROR_DETAIL_LIMIT) return trimmed;
  const clipped = trimmed.slice(0, Math.max(0, CLAUDE_CODE_ERROR_DETAIL_LIMIT - 3)).trimEnd();
  return `${clipped}...`;
};

const isClaudeCodeLoginRequiredOutput = (stdout: string, stderr: string): boolean => {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  return CLAUDE_CODE_LOGIN_REQUIRED_MARKERS.some((marker) => combined.includes(marker));
};

const buildClaudeCodeAuthRequiredError = (): ProviderApiResponseError =>
  new ProviderApiResponseError(CLAUDE_CODE_LOGIN_REQUIRED_MESSAGE);

const extractErrorText = (value: unknown): string | null => {
  const direct = extractStringValue(value);
  if (direct) return direct;
  if (!isRecord(value)) return null;
  return (
    extractStringValue(value.message) ??
    extractStringValue(value.result) ??
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

const isErrorPayload = (value: Record<string, unknown>): boolean => {
  const typeCandidates = [value.type, value.event, value.level, value.severity, value.status, value.subtype];
  for (const candidate of typeCandidates) {
    if (isErrorTypeValue(candidate)) return true;
  }
  const errorFlag = value.is_error ?? value.isError;
  if (isBooleanLikeTrue(errorFlag)) return true;
  if (typeof value.error === "string" && value.error.trim().length > 0) return true;
  if (value.error && typeof value.error === "object") return true;
  return false;
};

const collectTextSegments = (value: unknown): string[] => {
  const direct = extractStringValue(value);
  if (direct) return [direct];
  if (Array.isArray(value)) {
    const segments: string[] = [];
    for (const entry of value) {
      segments.push(...collectTextSegments(entry));
    }
    return segments;
  }
  if (!isRecord(value)) return [];
  if (isErrorPayload(value)) return [];
  const contentSegments = collectTextSegments(value.content);
  if (contentSegments.length > 0) return contentSegments;
  const messageSegments = collectTextSegments(value.message);
  if (messageSegments.length > 0) return messageSegments;
  const candidates = [
    value.text,
    value.output_text,
    value.outputText,
    value.completion,
    value.response,
    value.output,
    value.result,
    value.data,
    value.delta
  ];
  const segments: string[] = [];
  for (const candidate of candidates) {
    segments.push(...collectTextSegments(candidate));
  }
  return segments;
};

const collectClaudeCodeErrorDetails = (result: ClaudeCodeExecResult): string[] => {
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
  const visit = (value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
      addDetail(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }
      return;
    }
    if (!isRecord(value)) return;
    if (isErrorPayload(value)) {
      addDetail(extractErrorText(value));
    }
    const candidates = [
      value.error,
      value.message,
      value.detail,
      value.reason,
      value.title,
      value.description,
      value.summary,
      value.cause
    ];
    for (const candidate of candidates) {
      visit(candidate);
    }
  };
  if (result.jsonOutput) {
    visit(result.jsonOutput);
  }
  addDetail(result.stderr);
  if (details.length === 0) {
    addDetail(result.stdout);
  }
  return details;
};

const collectClaudeCodeRetryMetadata = (
  result: ClaudeCodeExecResult
): { statusCode?: number; code?: string } => {
  let statusCode: number | undefined;
  let code: string | undefined;
  const visit = (value: unknown, inErrorContext: boolean) => {
    if (statusCode !== undefined && code !== undefined) return;
    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry, inErrorContext);
        if (statusCode !== undefined && code !== undefined) return;
      }
      return;
    }
    if (!isRecord(value)) return;
    const errorContext =
      inErrorContext || isErrorPayload(value) || Boolean(value.error) || Boolean(value.errors);
    if (errorContext) {
      if (statusCode === undefined) {
        statusCode = extractStatusFromRecord(value) ?? undefined;
      }
      if (code === undefined) {
        code = extractCodeFromRecord(value) ?? undefined;
      }
    }
    for (const candidate of Object.values(value)) {
      if (statusCode !== undefined && code !== undefined) return;
      visit(candidate, errorContext);
    }
  };
  if (result.jsonOutput) {
    visit(result.jsonOutput, false);
  }
  return { statusCode, code };
};

const collectClaudeCodeSpawnRetryMetadata = (error: unknown): { code?: string } => {
  if (!isRecord(error)) return {};
  const code = extractStringValue(error.code);
  return code ? { code } : {};
};

const attachClaudeCodeRetryMetadata = <T extends Error>(
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

const tryParseJson = (payload: string): unknown | undefined => {
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
};

const parseJsonLines = (payload: string): unknown[] => {
  if (!payload.trim()) return [];
  const events: unknown[] = [];
  for (const line of payload.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = tryParseJson(trimmed);
    if (parsed !== undefined) events.push(parsed);
  }
  return events;
};

const extractJsonSubstring = (payload: string): unknown | undefined => {
  const objectStart = payload.indexOf("{");
  const objectEnd = payload.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    const parsed = tryParseJson(payload.slice(objectStart, objectEnd + 1));
    if (parsed !== undefined) return parsed;
  }
  const arrayStart = payload.indexOf("[");
  const arrayEnd = payload.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    const parsed = tryParseJson(payload.slice(arrayStart, arrayEnd + 1));
    if (parsed !== undefined) return parsed;
  }
  return undefined;
};

const parseJsonPayload = (payload: string): unknown | null => {
  const trimmed = payload.trim();
  if (!trimmed) return null;
  const direct = tryParseJson(trimmed);
  if (direct !== undefined) return direct;
  const events = parseJsonLines(trimmed);
  if (events.length > 0) return events;
  const extracted = extractJsonSubstring(trimmed);
  return extracted === undefined ? null : extracted;
};

const hasClaudeCodeJsonError = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => hasClaudeCodeJsonError(entry));
  }
  if (!isRecord(value)) return false;
  if (isErrorPayload(value)) return true;
  return Object.values(value).some((entry) => hasClaudeCodeJsonError(entry));
};

const mergeTextSegments = (segments: string[]): string | null => {
  if (segments.length === 0) return null;
  return segments.join("");
};

const ensureJsonOutputArgs = (args: string[]): string[] => {
  const updated = [...args];
  const inlineIndex = updated.findIndex((arg) =>
    arg.startsWith(`${CLAUDE_CODE_OUTPUT_FORMAT_FLAG}=`)
  );
  if (inlineIndex !== -1) {
    updated[inlineIndex] = `${CLAUDE_CODE_OUTPUT_FORMAT_FLAG}=${CLAUDE_CODE_JSON_OUTPUT}`;
    return updated;
  }
  const flagIndex = updated.findIndex((arg) => arg === CLAUDE_CODE_OUTPUT_FORMAT_FLAG);
  if (flagIndex !== -1) {
    if (flagIndex + 1 < updated.length) {
      updated[flagIndex + 1] = CLAUDE_CODE_JSON_OUTPUT;
    } else {
      updated.push(CLAUDE_CODE_JSON_OUTPUT);
    }
    return updated;
  }
  return [...updated, CLAUDE_CODE_OUTPUT_FORMAT_FLAG, CLAUDE_CODE_JSON_OUTPUT];
};

const isJsonOutputRequested = (args: string[]): boolean => {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === CLAUDE_CODE_OUTPUT_FORMAT_FLAG) {
      return args[index + 1] === CLAUDE_CODE_JSON_OUTPUT;
    }
    if (arg.startsWith(`${CLAUDE_CODE_OUTPUT_FORMAT_FLAG}=`)) {
      return arg.split("=", 2)[1] === CLAUDE_CODE_JSON_OUTPUT;
    }
  }
  return false;
};

const isClaudeCodeExecFailure = (result: ClaudeCodeExecResult): boolean =>
  result.exitCode !== 0 || result.signal !== null;

export const isClaudeCodeJsonErrorResult = (result: ClaudeCodeExecResult): boolean =>
  Boolean(result.jsonOutput) && hasClaudeCodeJsonError(result.jsonOutput);

export const mapClaudeCodeJsonError = (result: ClaudeCodeExecResult): ProviderApiResponseError =>
  attachClaudeCodeRetryMetadata(
    new ProviderApiResponseError(buildClaudeCodeJsonErrorMessage(result)),
    collectClaudeCodeRetryMetadata(result)
  );

const isClaudeCodeAuthErrorMessage = (message: string): boolean => {
  const lowered = message.toLowerCase();
  return (
    CLAUDE_CODE_LOGIN_REQUIRED_MARKERS.some((marker) => lowered.includes(marker)) ||
    lowered.includes("unauthorized") ||
    lowered.includes("authentication") ||
    (lowered.includes("auth") && lowered.includes("required")) ||
    lowered.includes("access token") ||
    lowered.includes("api key")
  );
};

const isClaudeCodeNetworkErrorMessage = (message: string): boolean => {
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

const buildClaudeCodeFailureHint = (message: string): string | null => {
  if (isClaudeCodeAuthErrorMessage(message)) {
    const hint = process.stdin?.isTTY ? CLAUDE_CODE_LOGIN_HINT : CLAUDE_CODE_LOGIN_NON_INTERACTIVE_HINT;
    if (message.toLowerCase().includes("claude setup-token") || message.toLowerCase().includes("/login")) {
      return null;
    }
    return hint;
  }
  if (isClaudeCodeNetworkErrorMessage(message)) return CLAUDE_CODE_NETWORK_HINT;
  if (message.toLowerCase().includes("login status")) return null;
  return CLAUDE_CODE_GENERIC_HINT;
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

const buildClaudeCodeExitMessage = (result: ClaudeCodeExecResult): string => {
  if (isClaudeCodeLoginRequiredOutput(result.stdout, result.stderr)) {
    return CLAUDE_CODE_LOGIN_REQUIRED_MESSAGE;
  }
  const details = collectClaudeCodeErrorDetails(result);
  const detailMessage = details.length ? normalizeErrorMessage(details.join(" | ")) : "";
  const context =
    result.signal
      ? `Claude Code CLI terminated with signal ${result.signal}.`
      : result.exitCode !== null
        ? `Claude Code CLI exited with code ${result.exitCode}.`
        : "Claude Code CLI exited with an unknown status.";
  const base = detailMessage ? `${context} ${detailMessage}` : context;
  return appendHint(base, buildClaudeCodeFailureHint(detailMessage || context));
};

const buildClaudeCodeJsonErrorMessage = (result: ClaudeCodeExecResult): string => {
  if (isClaudeCodeLoginRequiredOutput(result.stdout, result.stderr)) {
    return CLAUDE_CODE_LOGIN_REQUIRED_MESSAGE;
  }
  const details = collectClaudeCodeErrorDetails(result);
  const detailMessage = details.length ? normalizeErrorMessage(details.join(" | ")) : "";
  const context = "Claude Code CLI returned an error response.";
  const base = detailMessage ? `${context} ${detailMessage}` : context;
  return appendHint(base, buildClaudeCodeFailureHint(detailMessage || context));
};

const buildClaudeCodeSpawnMessage = (error: unknown): string => {
  const code = isRecord(error) ? error.code : null;
  if (code === "ENOENT") {
    return "Claude Code CLI not found on PATH. Install it and ensure `claude` is available.";
  }
  if (code === "EACCES") {
    return "Claude Code CLI is not executable. Check permissions for the `claude` binary.";
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = normalizeErrorMessage(message);
  if (normalized) return `Claude Code CLI failed to start: ${normalized}`;
  return "Claude Code CLI failed to start.";
};

export const parseClaudeCodeJsonOutput = (payload: string): ClaudeCodeJsonParseResult => {
  const parsed = parseJsonPayload(payload);
  if (parsed === null) {
    return { raw: null, text: null };
  }
  const segments = collectTextSegments(parsed);
  return {
    raw: parsed,
    text: mergeTextSegments(segments)
  };
};

export const buildClaudeCodePromptInput = (prompt: string): ClaudeCodePromptInput => {
  const promptBytes = Buffer.byteLength(prompt, "utf8");
  const baseArgs = [
    CLAUDE_CODE_PROMPT_FLAG,
    CLAUDE_CODE_INPUT_FORMAT_FLAG,
    CLAUDE_CODE_INPUT_FORMAT_TEXT
  ];
  if (containsNullByte(prompt) || promptBytes > CLAUDE_CODE_PROMPT_ARG_LIMIT_BYTES) {
    return {
      args: baseArgs,
      stdin: prompt
    };
  }
  return {
    args: [...baseArgs, CLAUDE_CODE_PROMPT_TERMINATOR, prompt]
  };
};

const buildClaudeCodePrompt = (messages: ChatMessage[]): string => {
  if (messages.length === 0) return "";
  const formatted = messages.map((message) => {
    const label = CLAUDE_CODE_ROLE_LABELS[message.role] ?? "User";
    return `${label}:\n${message.content}`;
  });
  const lastRole = messages[messages.length - 1]?.role;
  if (lastRole !== "assistant") {
    formatted.push("Assistant:");
  }
  return formatted.join("\n\n");
};

const buildClaudeCodeOutputPreview = (result: ClaudeCodeExecResult): string => {
  const combined = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (!combined) return "";
  if (combined.length <= CLAUDE_CODE_OUTPUT_PREVIEW_LIMIT) return combined;
  return `${combined.slice(0, CLAUDE_CODE_OUTPUT_PREVIEW_LIMIT)}...`;
};

export async function runClaudeCodePrompt(
  prompt: string,
  args: string[] = [],
  options?: ClaudeCodeExecOptions
): Promise<ClaudeCodeExecResult> {
  const promptInput = buildClaudeCodePromptInput(prompt);
  const finalArgs = [...ensureJsonOutputArgs(args), ...promptInput.args];
  return runClaudeCodeExec(finalArgs, {
    cwd: options?.cwd,
    env: options?.env,
    stdin: promptInput.stdin,
    timeoutMs: options?.timeoutMs
  });
}

export async function runClaudeCodeAdapter(
  input: LlmAdapterInput,
  options?: ClaudeCodeAdapterOptions
): Promise<LlmAdapterResult> {
  const prompt = buildClaudeCodePrompt(input.messages);
  const result = await runClaudeCodePrompt(prompt, [], {
    cwd: options?.cwd,
    env: options?.env,
    timeoutMs: options?.timeoutMs
  });
  if (result.exitCode !== 0 || result.signal !== null) {
    throw mapClaudeCodeExecFailure(result);
  }
  if (isClaudeCodeJsonErrorResult(result)) {
    throw mapClaudeCodeJsonError(result);
  }
  const text = typeof result.assistantText === "string" ? result.assistantText : "";
  if (!text.trim()) {
    const preview = buildClaudeCodeOutputPreview(result);
    const suffix = preview ? ` Output preview: ${preview}` : "";
    throw new Error(`Claude Code response missing output text.${suffix}`);
  }
  return {
    text,
    raw: result
  };
}

export async function runClaudeCodeExec(
  args: string[],
  options?: ClaudeCodeExecOptions
): Promise<ClaudeCodeExecResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const stdin = options?.stdin;
    const shouldWriteStdin = typeof stdin === "string";
    const timeoutMs = normalizeTimeoutMs(options?.timeoutMs);
    let settled = false;
    let timedOut = false;
    let timeoutMessage: string | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let forceKillTimer: NodeJS.Timeout | null = null;
    const clearTimers = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = null;
      }
    };
    const finalizeResolve = (result: ClaudeCodeExecResult) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve(result);
    };
    const finalizeReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimers();
      reject(error);
    };
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(CLAUDE_CODE_CLI_COMMAND, args, {
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
    const markTimeout = () => {
      if (timeoutMs === null) return;
      if (timedOut) return;
      timedOut = true;
      timeoutMessage = `Claude Code CLI timed out after ${timeoutMs}ms.`;
      if (proc.exitCode === null && !proc.killed) {
        try {
          proc.kill("SIGTERM");
        } catch {
          return;
        }
      }
      forceKillTimer = setTimeout(() => {
        if (proc.exitCode === null && !proc.killed) {
          try {
            proc.kill("SIGKILL");
          } catch {
            return;
          }
        }
      }, CLAUDE_CODE_FORCE_KILL_GRACE_MS);
    };
    if (timeoutMs !== null) {
      timeoutTimer = setTimeout(markTimeout, timeoutMs);
    }
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    if (shouldWriteStdin) {
      if (!proc.stdin) {
        finalizeReject(new Error("Claude Code stdin unavailable."));
        return;
      }
      proc.stdin.end(stdin);
    }
    proc.on("error", (err) => {
      finalizeReject(err);
    });
    proc.on("close", (code, signal) => {
      if (timedOut && timeoutMessage) {
        const lowered = stderr.toLowerCase();
        if (!lowered.includes("timeout") && !lowered.includes("timed out")) {
          const prefix = stderr.trim() ? `${stderr.trim()}\n` : "";
          stderr = `${prefix}${timeoutMessage}`;
        }
      }
      if (isClaudeCodeLoginRequiredOutput(stdout, stderr)) {
        finalizeReject(buildClaudeCodeAuthRequiredError());
        return;
      }
      const jsonOutputRequested = isJsonOutputRequested(args);
      const parsed = jsonOutputRequested ? parseClaudeCodeJsonOutput(stdout) : null;
      finalizeResolve({
        exitCode: code,
        signal,
        stdout,
        stderr,
        assistantText: parsed?.text ?? null,
        jsonOutput: parsed?.raw ?? null,
        durationMs: Date.now() - start
      });
    });
  });
}

export const mapClaudeCodeExecFailure = (
  result: ClaudeCodeExecResult
): ProviderApiResponseError | ProviderRequestFailedError => {
  const message = buildClaudeCodeExitMessage(result);
  const metadata = collectClaudeCodeRetryMetadata(result);
  if (result.exitCode === null || result.signal) {
    return attachClaudeCodeRetryMetadata(
      new ProviderRequestFailedError("LLM", LLMProviderId.ClaudeCode, CLAUDE_CODE_EXEC_CONTEXT, message),
      metadata
    );
  }
  return attachClaudeCodeRetryMetadata(new ProviderApiResponseError(message), metadata);
};

export const mapClaudeCodeExecSpawnFailure = (error: unknown): ProviderRequestFailedError => {
  const message = buildClaudeCodeSpawnMessage(error);
  return attachClaudeCodeRetryMetadata(
    new ProviderRequestFailedError("LLM", LLMProviderId.ClaudeCode, CLAUDE_CODE_EXEC_CONTEXT, message),
    collectClaudeCodeSpawnRetryMetadata(error)
  );
};

export const __test__ = { isClaudeCodeLoginRequiredOutput };

export async function runClaudeCodeExecOrThrow(
  args: string[],
  options?: ClaudeCodeExecOptions
): Promise<ClaudeCodeExecResult> {
  try {
    const result = await runClaudeCodeExec(args, options);
    if (isClaudeCodeExecFailure(result)) {
      throw mapClaudeCodeExecFailure(result);
    }
    if (isClaudeCodeJsonErrorResult(result)) {
      throw mapClaudeCodeJsonError(result);
    }
    return result;
  } catch (error) {
    if (error instanceof ProviderApiResponseError || error instanceof ProviderRequestFailedError) {
      throw error;
    }
    throw mapClaudeCodeExecSpawnFailure(error);
  }
}

import type { RateLimitSnapshot } from "./rateLimitHelpers.js";

const OPENAI_HEADERS = {
  reqRemaining: "x-ratelimit-remaining-requests",
  reqReset: "x-ratelimit-reset-requests",
  tokRemaining: "x-ratelimit-remaining-tokens",
  tokReset: "x-ratelimit-reset-tokens"
} as const;

const parseNumberHeader = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.trunc(parsed));
};

const parseDurationMs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const direct = Number(trimmed);
  if (Number.isFinite(direct)) {
    return Math.max(0, Math.round(direct * 1000));
  }
  const regex = /(\d+(?:\.\d+)?)(ms|s|m|h|d)/g;
  let totalMs = 0;
  let matched = false;
  for (const match of trimmed.matchAll(regex)) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount)) continue;
    matched = true;
    switch (unit) {
      case "ms":
        totalMs += amount;
        break;
      case "s":
        totalMs += amount * 1000;
        break;
      case "m":
        totalMs += amount * 60 * 1000;
        break;
      case "h":
        totalMs += amount * 60 * 60 * 1000;
        break;
      case "d":
        totalMs += amount * 24 * 60 * 60 * 1000;
        break;
      default:
        break;
    }
  }
  if (!matched) return undefined;
  return Math.max(0, Math.round(totalMs));
};

export const parseOpenAiSnapshot = (
  headers: Headers,
  nowMs: number
): RateLimitSnapshot | null => {
  const reqRemaining = parseNumberHeader(headers.get(OPENAI_HEADERS.reqRemaining));
  const reqResetMs = parseDurationMs(headers.get(OPENAI_HEADERS.reqReset));
  const tokRemaining = parseNumberHeader(headers.get(OPENAI_HEADERS.tokRemaining));
  const tokResetMs = parseDurationMs(headers.get(OPENAI_HEADERS.tokReset));
  if (
    reqRemaining === undefined &&
    reqResetMs === undefined &&
    tokRemaining === undefined &&
    tokResetMs === undefined
  ) {
    return null;
  }
  return {
    ts: nowMs,
    reqRemaining,
    reqResetAtMs: reqResetMs !== undefined ? nowMs + reqResetMs : undefined,
    tokRemaining,
    tokResetAtMs: tokResetMs !== undefined ? nowMs + tokResetMs : undefined
  };
};

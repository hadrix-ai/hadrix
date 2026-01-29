import type { RateLimitSnapshot } from "./rateLimitHelpers.js";

const ANTHROPIC_HEADERS = {
  reqRemaining: "anthropic-ratelimit-requests-remaining",
  reqReset: "anthropic-ratelimit-requests-reset",
  tokRemaining: "anthropic-ratelimit-tokens-remaining",
  tokReset: "anthropic-ratelimit-tokens-reset"
} as const;

const parseNumberHeader = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.trunc(parsed));
};

const parseResetTimestampMs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
};

export const parseAnthropicSnapshot = (
  headers: Headers,
  nowMs: number
): RateLimitSnapshot | null => {
  const reqRemaining = parseNumberHeader(headers.get(ANTHROPIC_HEADERS.reqRemaining));
  const reqResetAtMs = parseResetTimestampMs(headers.get(ANTHROPIC_HEADERS.reqReset));
  const tokRemaining = parseNumberHeader(headers.get(ANTHROPIC_HEADERS.tokRemaining));
  const tokResetAtMs = parseResetTimestampMs(headers.get(ANTHROPIC_HEADERS.tokReset));
  if (
    reqRemaining === undefined &&
    reqResetAtMs === undefined &&
    tokRemaining === undefined &&
    tokResetAtMs === undefined
  ) {
    return null;
  }
  return {
    ts: nowMs,
    reqRemaining,
    reqResetAtMs,
    tokRemaining,
    tokResetAtMs
  };
};

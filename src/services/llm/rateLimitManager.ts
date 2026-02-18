import { LLMProviderId } from "../../config/loadConfig.js";
import type { LLMProvider } from "../../config/loadConfig.js";

type RateLimitSnapshot = {
  reqRemaining?: number;
  reqResetAtMs?: number;
  tokRemaining?: number;
  tokResetAtMs?: number;
};

const parseCount = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.trunc(parsed));
};

const parseDurationMs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  const unit = match[2]?.toLowerCase() ?? "s";
  const multiplier =
    unit === "ms" ? 1 :
    unit === "s" ? 1000 :
    unit === "m" ? 60_000 :
    unit === "h" ? 3_600_000 :
    1000;
  return Math.max(0, Math.round(amount * multiplier));
};

const parseRfc3339Ms = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
};

const parseOpenAiSnapshot = (headers: Headers, nowMs: number): RateLimitSnapshot | null => {
  const reqRemaining = parseCount(headers.get("x-ratelimit-remaining-requests"));
  const tokRemaining = parseCount(headers.get("x-ratelimit-remaining-tokens"));
  const reqResetAfterMs = parseDurationMs(headers.get("x-ratelimit-reset-requests"));
  const tokResetAfterMs = parseDurationMs(headers.get("x-ratelimit-reset-tokens"));
  const reqResetAtMs = reqResetAfterMs !== undefined ? nowMs + reqResetAfterMs : undefined;
  const tokResetAtMs = tokResetAfterMs !== undefined ? nowMs + tokResetAfterMs : undefined;
  if (
    reqRemaining === undefined &&
    tokRemaining === undefined &&
    reqResetAtMs === undefined &&
    tokResetAtMs === undefined
  ) {
    return null;
  }
  return {
    reqRemaining,
    tokRemaining,
    reqResetAtMs,
    tokResetAtMs
  };
};

const parseAnthropicSnapshot = (headers: Headers): RateLimitSnapshot | null => {
  const reqRemaining = parseCount(headers.get("anthropic-ratelimit-requests-remaining"));
  const tokRemaining = parseCount(headers.get("anthropic-ratelimit-tokens-remaining"));
  const reqResetAtMs = parseRfc3339Ms(headers.get("anthropic-ratelimit-requests-reset"));
  const tokResetAtMs = parseRfc3339Ms(headers.get("anthropic-ratelimit-tokens-reset"));
  if (
    reqRemaining === undefined &&
    tokRemaining === undefined &&
    reqResetAtMs === undefined &&
    tokResetAtMs === undefined
  ) {
    return null;
  }
  return {
    reqRemaining,
    tokRemaining,
    reqResetAtMs,
    tokResetAtMs
  };
};

const parseSnapshot = (
  provider: LLMProvider,
  headers: Headers,
  nowMs: number
): RateLimitSnapshot | null => {
  if (provider === LLMProviderId.OpenAI) {
    return parseOpenAiSnapshot(headers, nowMs);
  }
  if (provider === LLMProviderId.Anthropic) {
    return parseAnthropicSnapshot(headers);
  }
  return null;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class RateLimitManager {
  private readonly provider: LLMProvider;
  private snapshot: RateLimitSnapshot | null = null;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async beforeRequest(estimatedTokens: number): Promise<void> {
    if (!this.snapshot) return;
    const nowMs = Date.now();
    const reqWaitMs =
      this.snapshot.reqRemaining !== undefined &&
      this.snapshot.reqRemaining <= 0 &&
      this.snapshot.reqResetAtMs !== undefined
        ? Math.max(0, this.snapshot.reqResetAtMs - nowMs)
        : 0;
    const tokWaitMs =
      this.snapshot.tokRemaining !== undefined &&
      this.snapshot.tokRemaining < estimatedTokens &&
      this.snapshot.tokResetAtMs !== undefined
        ? Math.max(0, this.snapshot.tokResetAtMs - nowMs)
        : 0;
    const waitMs = Math.max(reqWaitMs, tokWaitMs);
    if (waitMs > 0) {
      await sleep(waitMs);
      this.snapshot = null;
      return;
    }
    if (this.snapshot.reqRemaining !== undefined) {
      this.snapshot.reqRemaining = Math.max(0, this.snapshot.reqRemaining - 1);
    }
    if (this.snapshot.tokRemaining !== undefined) {
      this.snapshot.tokRemaining = Math.max(0, this.snapshot.tokRemaining - estimatedTokens);
    }
  }

  updateFromResponse(response?: Response | null): void {
    if (!response) {
      this.snapshot = null;
      return;
    }
    const snapshot = parseSnapshot(this.provider, response.headers, Date.now());
    this.snapshot = snapshot;
  }
}

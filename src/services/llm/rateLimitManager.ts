import { LLMProviderId } from "../../config/loadConfig.js";
import type { LLMProvider } from "../../config/loadConfig.js";
import { parseAnthropicSnapshot } from "./anthropicRateLimits.js";
import { parseOpenAiSnapshot } from "./openAiRateLimits.js";
import {
  type RateLimitReservation,
  type RateLimitSnapshot,
  Semaphore,
  TokenBucket,
  normalizeUnits,
  sleep
} from "./rateLimitHelpers.js";

type RateLimitManagerOptions = {
  provider: LLMProvider;
  model: string;
  maxConcurrency?: number;
  logger?: (message: string) => void;
};

const parseRetryAfterMs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.round(parsed * 1000));
  }
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return Math.max(0, Math.round(timestamp - Date.now()));
  }
  return undefined;
};

const mergeSnapshot = (
  previous: RateLimitSnapshot | null,
  next: RateLimitSnapshot
): RateLimitSnapshot => {
  return {
    ts: next.ts,
    reqRemaining: next.reqRemaining ?? previous?.reqRemaining,
    reqResetAtMs: next.reqResetAtMs ?? previous?.reqResetAtMs,
    tokRemaining: next.tokRemaining ?? previous?.tokRemaining,
    tokResetAtMs: next.tokResetAtMs ?? previous?.tokResetAtMs
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
  return parseAnthropicSnapshot(headers, nowMs);
};

export class RateLimitManager {
  private readonly provider: LLMProvider;
  private readonly model: string;
  private readonly logger: (message: string) => void;
  private readonly requestBucket = new TokenBucket();
  private readonly tokenBucket = new TokenBucket();
  private readonly bootstrapSemaphore = new Semaphore(1);

  private semaphore: Semaphore | null;
  private snapshot: RateLimitSnapshot | null = null;
  private hasSnapshot = false;
  private cooldownUntilMs = 0;

  constructor(options: RateLimitManagerOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.logger = options.logger ?? (() => undefined);
    this.semaphore = options.maxConcurrency
      ? new Semaphore(Math.max(1, Math.trunc(options.maxConcurrency)))
      : null;
  }

  setMaxConcurrency(maxConcurrency?: number): void {
    if (!maxConcurrency || !Number.isFinite(maxConcurrency)) {
      this.semaphore = null;
      return;
    }
    const normalized = Math.max(1, Math.trunc(maxConcurrency));
    if (this.semaphore) {
      this.semaphore.setMax(normalized);
    } else {
      this.semaphore = new Semaphore(normalized);
    }
  }

  async acquire(estimatedTokens: number): Promise<RateLimitReservation> {
    const tokenUnits = Math.max(1, normalizeUnits(estimatedTokens, 1));
    await this.waitForCooldown();
    await this.requestBucket.reserve(1);
    await this.tokenBucket.reserve(tokenUnits);
    const releaseConfigured = this.semaphore ? await this.semaphore.acquire() : null;
    const releaseBootstrap =
      !this.semaphore && !this.hasSnapshot ? await this.bootstrapSemaphore.acquire() : null;

    return {
      requestUnits: 1,
      tokenUnits,
      releaseConcurrency: () => {
        releaseConfigured?.();
        releaseBootstrap?.();
      }
    };
  }

  finalizeSuccess(
    reservation: RateLimitReservation,
    response: Response,
    actualTokens?: number | null
  ): void {
    const nowMs = Date.now();
    const tokensUsed = normalizeUnits(actualTokens, reservation.tokenUnits);
    this.requestBucket.reconcile(reservation.requestUnits, reservation.requestUnits);
    this.tokenBucket.reconcile(reservation.tokenUnits, tokensUsed);
    const snapshot = parseSnapshot(this.provider, response.headers, nowMs);
    this.applySnapshot(snapshot, nowMs);
  }

  finalizeError(reservation: RateLimitReservation, response?: Response | null): void {
    const nowMs = Date.now();
    const snapshot = response ? parseSnapshot(this.provider, response.headers, nowMs) : null;
    const refundTokens = snapshot?.tokRemaining !== undefined ? 0 : reservation.tokenUnits;
    this.requestBucket.reconcile(reservation.requestUnits, reservation.requestUnits);
    this.tokenBucket.reconcile(reservation.tokenUnits, refundTokens);
    this.applySnapshot(snapshot, nowMs);
  }

  finalizeRateLimit(
    reservation: RateLimitReservation,
    response: Response,
    attempt: number
  ): number {
    const nowMs = Date.now();
    const snapshot = parseSnapshot(this.provider, response.headers, nowMs);
    const refundTokens = snapshot?.tokRemaining !== undefined ? 0 : reservation.tokenUnits;
    this.requestBucket.reconcile(reservation.requestUnits, reservation.requestUnits);
    this.tokenBucket.reconcile(reservation.tokenUnits, refundTokens);
    this.applySnapshot(snapshot, nowMs);
    const delayMs = this.computeRateLimitDelayMs(response, attempt, nowMs, snapshot);
    this.cooldownUntilMs = Math.max(this.cooldownUntilMs, nowMs + delayMs);
    this.requestBucket.scaleRefill(0.5);
    this.tokenBucket.scaleRefill(0.5);
    this.logInfo("rate_limit_429", {
      model: this.model,
      delayMs: Math.round(delayMs),
      attempt
    });
    return delayMs;
  }

  private applySnapshot(snapshot: RateLimitSnapshot | null, nowMs: number): void {
    if (!snapshot) return;
    this.snapshot = mergeSnapshot(this.snapshot, snapshot);
    this.hasSnapshot = true;
    const reqResetAfterMs =
      snapshot.reqResetAtMs !== undefined
        ? Math.max(0, snapshot.reqResetAtMs - nowMs)
        : null;
    const tokResetAfterMs =
      snapshot.tokResetAtMs !== undefined
        ? Math.max(0, snapshot.tokResetAtMs - nowMs)
        : null;
    this.requestBucket.updateFromSnapshot(snapshot.reqRemaining ?? null, reqResetAfterMs, nowMs);
    this.tokenBucket.updateFromSnapshot(snapshot.tokRemaining ?? null, tokResetAfterMs, nowMs);
  }

  private async waitForCooldown(): Promise<void> {
    while (true) {
      const nowMs = Date.now();
      if (this.cooldownUntilMs <= nowMs) return;
      await sleep(this.cooldownUntilMs - nowMs);
    }
  }

  private computeRateLimitDelayMs(
    response: Response,
    attempt: number,
    nowMs: number,
    snapshot: RateLimitSnapshot | null
  ): number {
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    if (retryAfterMs !== undefined) {
      return retryAfterMs + this.randomJitterMs(250);
    }
    const resetDelayMs = this.computeResetDelayMs(nowMs, snapshot);
    if (resetDelayMs !== null) {
      return resetDelayMs + this.randomJitterMs(250);
    }
    const base = 1000;
    const max = 30_000;
    const exp = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
    return exp + this.randomJitterMs(exp * 0.5);
  }

  private computeResetDelayMs(nowMs: number, snapshot: RateLimitSnapshot | null): number | null {
    const source = snapshot ? mergeSnapshot(this.snapshot, snapshot) : this.snapshot;
    if (!source) return null;
    const reqDelay =
      source.reqResetAtMs !== undefined ? source.reqResetAtMs - nowMs : undefined;
    const tokDelay =
      source.tokResetAtMs !== undefined ? source.tokResetAtMs - nowMs : undefined;
    const delays = [reqDelay, tokDelay].filter((value): value is number =>
      typeof value === "number" && Number.isFinite(value)
    );
    if (delays.length === 0) return null;
    return Math.max(0, Math.max(...delays));
  }

  private randomJitterMs(scale: number): number {
    const safeScale = Number.isFinite(scale) ? Math.max(0, scale) : 0;
    return Math.floor(Math.random() * safeScale);
  }

  private logInfo(event: string, payload: Record<string, unknown>): void {
    const message = JSON.stringify({ event: `llm_rate_limit_${event}`, ...payload });
    this.logger(message);
  }
}

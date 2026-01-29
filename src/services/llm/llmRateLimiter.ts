type RateLimitOptions = {
  maxConcurrency?: number | null;
  requestsPerMinute?: number | null;
  tokensPerMinute?: number | null;
  windowMs?: number | null;
};

type PendingRequest = {
  tokens: number;
  resolve: (release: () => void) => void;
};

type TokenEntry = {
  at: number;
  tokens: number;
};

const DEFAULT_WINDOW_MS = 60_000;

function normalizePositiveInt(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

function normalizeWindowMs(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_WINDOW_MS;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : DEFAULT_WINDOW_MS;
}

export class LlmRateLimiter {
  private maxConcurrency: number | null = null;
  private requestsPerMinute: number | null = null;
  private tokensPerMinute: number | null = null;
  private windowMs = DEFAULT_WINDOW_MS;

  private active = 0;
  private queue: PendingRequest[] = [];
  private requestLog: number[] = [];
  private tokenLog: TokenEntry[] = [];
  private cooldownUntil = 0;
  private processing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  configure(options: RateLimitOptions): void {
    this.maxConcurrency = normalizePositiveInt(options.maxConcurrency);
    this.requestsPerMinute = normalizePositiveInt(options.requestsPerMinute);
    this.tokensPerMinute = normalizePositiveInt(options.tokensPerMinute);
    this.windowMs = normalizeWindowMs(options.windowMs);
    if (!this.isEnabled()) {
      this.flushQueue();
    }
  }

  isEnabled(now: number = Date.now()): boolean {
    return Boolean(
      this.maxConcurrency ||
      this.requestsPerMinute ||
      this.tokensPerMinute ||
      this.cooldownUntil > now
    );
  }

  noteCooldown(delayMs: number | null | undefined): void {
    if (!delayMs || delayMs <= 0) return;
    const next = Date.now() + delayMs;
    if (next > this.cooldownUntil) {
      this.cooldownUntil = next;
      this.schedule(0);
    }
  }

  async acquire(tokens: number): Promise<() => void> {
    const now = Date.now();
    if (!this.isEnabled(now)) {
      return () => undefined;
    }
    return new Promise((resolve) => {
      this.queue.push({ tokens, resolve });
      this.process();
    });
  }

  private flushQueue(): void {
    if (this.queue.length === 0) return;
    const pending = [...this.queue];
    this.queue = [];
    for (const item of pending) {
      item.resolve(() => undefined);
    }
  }

  private process(): void {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const now = Date.now();
      this.prune(now);

      if (this.maxConcurrency && this.active >= this.maxConcurrency) {
        this.processing = false;
        return;
      }

      const next = this.queue[0];
      const waitMs = this.computeWaitMs(now, next.tokens);
      if (waitMs > 0) {
        this.processing = false;
        this.schedule(waitMs);
        return;
      }

      this.queue.shift();
      const effectiveTokens = this.effectiveTokens(next.tokens);
      this.record(now, effectiveTokens);
      this.active += 1;
      next.resolve(() => {
        this.active = Math.max(0, this.active - 1);
        this.process();
      });
    }
    this.processing = false;
  }

  private schedule(waitMs: number): void {
    const delay = Math.max(0, Math.ceil(waitMs));
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.process();
    }, delay);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.requestLog.length > 0 && this.requestLog[0] <= cutoff) {
      this.requestLog.shift();
    }
    while (this.tokenLog.length > 0 && this.tokenLog[0].at <= cutoff) {
      this.tokenLog.shift();
    }
  }

  private effectiveTokens(tokens: number): number {
    const safeTokens = Number.isFinite(tokens) ? Math.max(0, Math.trunc(tokens)) : 0;
    if (!this.tokensPerMinute) return safeTokens;
    return Math.min(safeTokens, this.tokensPerMinute);
  }

  private record(now: number, tokens: number): void {
    if (this.requestsPerMinute) {
      this.requestLog.push(now);
    }
    if (this.tokensPerMinute && tokens > 0) {
      this.tokenLog.push({ at: now, tokens });
    }
  }

  private computeWaitMs(now: number, tokens: number): number {
    let waitMs = 0;
    if (this.cooldownUntil > now) {
      waitMs = this.cooldownUntil - now;
    }

    if (this.requestsPerMinute) {
      if (this.requestLog.length >= this.requestsPerMinute) {
        const oldest = this.requestLog[0];
        waitMs = Math.max(waitMs, oldest + this.windowMs - now);
      }
    }

    if (this.tokensPerMinute) {
      const effectiveTokens = this.effectiveTokens(tokens);
      if (effectiveTokens > 0) {
        const currentTokens = this.tokenLog.reduce((sum, entry) => sum + entry.tokens, 0);
        if (currentTokens + effectiveTokens > this.tokensPerMinute) {
          const overage = currentTokens + effectiveTokens - this.tokensPerMinute;
          let released = 0;
          for (const entry of this.tokenLog) {
            released += entry.tokens;
            if (released >= overage) {
              waitMs = Math.max(waitMs, entry.at + this.windowMs - now);
              break;
            }
          }
        }
      }
    }

    return waitMs;
  }
}

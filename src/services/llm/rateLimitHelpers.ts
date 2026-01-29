export type RateLimitSnapshot = {
  ts: number;
  reqRemaining?: number;
  reqResetAtMs?: number;
  tokRemaining?: number;
  tokResetAtMs?: number;
};

export type RateLimitReservation = {
  requestUnits: number;
  tokenUnits: number;
  releaseConcurrency: () => void;
};

type PendingReservation = {
  units: number;
  resolve: () => void;
};

export const normalizeUnits = (value: number | null | undefined, fallback = 0): number => {
  if (value == null || !Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : fallback;
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class Semaphore {
  private max: number;
  private inFlight = 0;
  private queue: Array<(release: () => void) => void> = [];

  constructor(max: number) {
    this.max = Math.max(1, Math.trunc(max));
  }

  async acquire(): Promise<() => void> {
    if (this.inFlight < this.max) {
      this.inFlight += 1;
      return this.createRelease();
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  setMax(next: number): void {
    this.max = Math.max(1, Math.trunc(next));
    this.drain();
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.drain();
    };
  }

  private drain(): void {
    while (this.queue.length > 0 && this.inFlight < this.max) {
      const next = this.queue.shift();
      if (!next) break;
      this.inFlight += 1;
      next(this.createRelease());
    }
  }
}

export class TokenBucket {
  private level = Number.POSITIVE_INFINITY;
  private reserved = 0;
  private refillRate = 0;
  private maxLevel: number | null = null;
  private lastUpdatedMs = Date.now();
  private queue: PendingReservation[] = [];
  private processing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  async reserve(units: number): Promise<void> {
    const normalized = normalizeUnits(units);
    if (normalized <= 0) return;
    return new Promise((resolve) => {
      this.queue.push({ units: normalized, resolve });
      this.drain();
    });
  }

  reconcile(reservedUnits: number, actualUnits: number): void {
    const reserved = normalizeUnits(reservedUnits);
    const actual = normalizeUnits(actualUnits, reserved);
    if (reserved > 0) {
      this.reserved = Math.max(0, this.reserved - reserved);
    }
    const delta = reserved - actual;
    if (delta !== 0) {
      this.level += delta;
    }
    if (this.maxLevel !== null) {
      const maxAvailable = Math.max(0, this.maxLevel - this.reserved);
      if (this.level > maxAvailable) {
        this.level = maxAvailable;
      }
    }
    this.drain();
  }

  updateFromSnapshot(
    remaining: number | null | undefined,
    resetAfterMs: number | null | undefined,
    nowMs: number
  ): void {
    this.refill(nowMs);
    const hasRemaining = typeof remaining === "number" && Number.isFinite(remaining);
    const hasReset = typeof resetAfterMs === "number" && Number.isFinite(resetAfterMs);

    if (hasRemaining) {
      this.maxLevel = Math.max(0, remaining as number);
    }

    if (hasRemaining && hasReset) {
      const windowSec = Math.max(1, (resetAfterMs as number) / 1000);
      this.refillRate = (remaining as number) / windowSec;
    }

    if (hasRemaining && this.maxLevel !== null) {
      const maxAvailable = Math.max(0, this.maxLevel - this.reserved);
      this.level = maxAvailable;
    }
    this.lastUpdatedMs = nowMs;
    this.drain();
  }

  scaleRefill(factor: number): void {
    const safeFactor = Number.isFinite(factor) ? Math.max(0, factor) : 1;
    this.refillRate *= safeFactor;
    this.drain();
  }

  private refill(nowMs: number): void {
    if (this.maxLevel === null) {
      this.lastUpdatedMs = nowMs;
      return;
    }
    const elapsedMs = nowMs - this.lastUpdatedMs;
    if (elapsedMs <= 0) return;
    if (this.refillRate > 0) {
      const delta = (elapsedMs / 1000) * this.refillRate;
      const maxAvailable = Math.max(0, this.maxLevel - this.reserved);
      this.level = Math.min(maxAvailable, this.level + delta);
    }
    this.lastUpdatedMs = nowMs;
  }

  private drain(): void {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const nowMs = Date.now();
      this.refill(nowMs);
      const next = this.queue[0];
      if (!next) break;
      if (this.level >= next.units || !Number.isFinite(this.level)) {
        this.queue.shift();
        this.level -= next.units;
        this.reserved += next.units;
        next.resolve();
        continue;
      }
      const waitMs = this.computeWaitMs(next.units);
      this.processing = false;
      if (waitMs !== null) {
        this.schedule(waitMs);
      }
      return;
    }
    this.processing = false;
  }

  private computeWaitMs(units: number): number | null {
    if (this.refillRate <= 0) return null;
    const deficit = units - this.level;
    if (deficit <= 0) return 0;
    const waitSec = deficit / this.refillRate;
    if (!Number.isFinite(waitSec)) return null;
    return Math.max(0, Math.ceil(waitSec * 1000));
  }

  private schedule(waitMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    const delayMs = Math.max(0, Math.ceil(waitMs));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.drain();
    }, delayMs);
  }
}

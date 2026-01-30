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

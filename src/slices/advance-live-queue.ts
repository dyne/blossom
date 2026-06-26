import type { LogEvent } from '../domain/types';

/** FIFO queue that drains log events at a configurable rate. */
export class LiveQueue {
  #queue: LogEvent[] = [];
  #paused = false;

  /** Enqueue a log event for later processing. */
  enqueue(event: LogEvent): void {
    this.#queue.push(event);
  }

  /** Drain up to `maxPerTick` events, calling `apply` for each. */
  tick(maxPerTick: number, apply: (event: LogEvent) => void): void {
    if (this.#paused) return;
    let count = 0;
    while (this.#queue.length > 0 && count < maxPerTick) {
      const event = this.#queue.shift()!;
      apply(event);
      count++;
    }
  }

  /** Pause draining (events continue to enqueue). */
  pause(): void {
    this.#paused = true;
  }

  /** Resume draining. */
  resume(): void {
    this.#paused = false;
  }

  /** Clear all queued events and reset state. */
  reset(): void {
    this.#queue = [];
    this.#paused = false;
  }

  /** Number of events currently queued. */
  get size(): number {
    return this.#queue.length;
  }

  /** Whether draining is paused. */
  get paused(): boolean {
    return this.#paused;
  }
}

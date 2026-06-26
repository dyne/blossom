import type { LogEvent } from '../domain/types.ts';

/** FIFO queue that drains log events at a configurable rate. */
export class LiveQueue {
  /** Enqueue a log event for later processing. */
  enqueue(event: LogEvent): void {}
  /** Drain up to `maxPerTick` events, calling `apply` for each. */
  tick(maxPerTick: number, apply: (event: LogEvent) => void): void {}
  /** Pause draining (events continue to enqueue). */
  pause(): void {}
  /** Resume draining. */
  resume(): void {}
  /** Clear all queued events and reset state. */
  reset(): void {}
  /** Number of events currently queued. */
  get size(): number { return 0; }
  /** Whether draining is paused. */
  get paused(): boolean { return false; }
}

import type { LogEvent } from '../domain/types.ts';

/** Parse a raw log line into a validated log event. Returns null for invalid lines. */
export function ingestLogEvent(line: string, sequence: number): LogEvent | null {
  throw new Error('not implemented');
}

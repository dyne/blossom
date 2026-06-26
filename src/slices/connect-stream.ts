import type { LogEventSource } from '../domain/ports.ts';

/** Create and start a log event source for the given WebSocket URL. */
export function connectStream(url: string): LogEventSource {
  throw new Error('not implemented');
}

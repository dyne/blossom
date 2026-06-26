import type { AppStatus } from '../domain/types.ts';
import type { StatusSink } from '../domain/ports.ts';

/** Build an AppStatus record from current state. */
export function buildStatus(
  connection: AppStatus['connection'],
  queueSize: number,
  paused: boolean,
  eventCount: number,
): AppStatus {
  return { connection, queueSize, paused, eventCount };
}

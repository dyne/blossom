import type { LogEvent } from '../domain/types';
import { stripBom, parseLogLine } from '../domain/parser';

let firstLineSeen = false;

/** Parse a raw log line into a validated log event. Returns null for invalid lines. */
export function ingestLogEvent(line: string, sequence: number): LogEvent | null {
  const cleaned = stripBom(line, !firstLineSeen);
  firstLineSeen = true;
  return parseLogLine(cleaned, sequence);
}

/** Reset BOM tracking for a new connection. */
export function resetIngestion(): void {
  firstLineSeen = false;
}

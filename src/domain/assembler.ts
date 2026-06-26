import type { LogEvent } from './types.ts';
import { parseLogLine, stripBom } from './parser.ts';

/** Receives raw lines in order and emits one LogEvent per valid line. */
export class LogEventAssembler {
  #sequence = 0;
  #firstLine = true;

  /** Reset assembler for a new connection. */
  reset(): void {
    this.#sequence = 0;
    this.#firstLine = true;
  }

  /** Process one raw line. Returns a LogEvent or null for invalid/empty lines. */
  acceptLine(line: string): LogEvent | null {
    const cleaned = stripBom(line, this.#firstLine);
    this.#firstLine = false;

    this.#sequence++;
    return parseLogLine(cleaned, this.#sequence);
  }

  /** Process multiple lines at once. Returns only valid events in arrival order. */
  acceptLines(lines: string[]): LogEvent[] {
    const events: LogEvent[] = [];
    for (const line of lines) {
      const event = this.acceptLine(line);
      if (event) events.push(event);
    }
    return events;
  }

  /** Current sequence number (count of lines processed). */
  get sequence(): number {
    return this.#sequence;
  }
}

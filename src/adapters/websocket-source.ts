import type { LogEvent, ConnectionState } from '../domain/types';
import type { LogEventSource } from '../domain/ports';
import { LogEventAssembler } from '../domain/assembler';

/** Minimal WebSocket interface for dependency injection. */
export interface WebSocketLike {
  readonly url: string;
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(code?: number, reason?: string): void;
}

/** WebSocket readyState constants. */
export const WS = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 } as const;

/** Create a LogEventSource backed by a real or fake WebSocket. */
export function createWebSocketEventSource(
  url: string,
  createSocket: (url: string) => WebSocketLike,
): LogEventSource {
  const assembler = new LogEventAssembler();
  let socket: WebSocketLike | null = null;

  const eventListeners = new Set<(event: LogEvent) => void>();
  const stateListeners = new Set<(state: ConnectionState) => void>();

  let stopRequested = false;

  function setState(state: ConnectionState): void {
    for (const l of stateListeners) l(state);
  }

  function connect(): void {
    setState('connecting');

    try {
      socket = createSocket(url);
    } catch {
      setState('failed');
      return;
    }

    socket.onopen = () => {
      setState('open');
      assembler.reset();
    };

    socket.onmessage = (event) => {
      const text = typeof event.data === 'string' ? event.data : String(event.data);
      const lines = text.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        if (!line) continue;
        const logEvent = assembler.acceptLine(line);
        if (logEvent) {
          for (const l of eventListeners) l(logEvent);
        }
      }
    };

    socket.onclose = () => {
      setState('closed');
      socket = null;
    };

    socket.onerror = () => {
      if (socket && socket.readyState !== WS.OPEN) {
        setState('failed');
      }
    };
  }

  return {
    start() {
      if (!socket || (socket.readyState === WS.CLOSED || socket.readyState === WS.CLOSING)) {
        connect();
      }
    },
    stop() {
      stopRequested = true;
      if (socket) {
        socket.onclose = null;
        socket.close(1000, 'client');
        socket = null;
      }
      setState('closed');
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => { eventListeners.delete(listener); };
    },
    onState(listener) {
      stateListeners.add(listener);
      return () => { stateListeners.delete(listener); };
    },
  };
}

/** Create a LogEventSource using the browser WebSocket API. */
export function createBrowserWebSocketSource(url: string): LogEventSource {
  return createWebSocketEventSource(url, (u) => new WebSocket(u) as WebSocketLike);
}

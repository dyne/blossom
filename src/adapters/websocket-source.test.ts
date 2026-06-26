import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createWebSocketEventSource, WS, type WebSocketLike } from './websocket-source';
import type { LogEvent, ConnectionState } from '../domain/types';

type FakeSocket = Omit<WebSocketLike, 'readyState'> & { readyState: number };

function fakeSocket(): {
  ws: FakeSocket;
  open(): void;
  close(code?: number, reason?: string): void;
  fail(): void;
  message(data: string): void;
} {
  const ws: FakeSocket = {
    url: 'ws://test/stream',
    readyState: WS.CONNECTING,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    close(_code?: number, _reason?: string) {},
  };

  return {
    ws,
    open() {
      ws.readyState = WS.OPEN;
      ws.onopen?.(null);
    },
    close(code = 1000, reason = '') {
      ws.readyState = WS.CLOSED;
      ws.onclose?.({ code, reason });
    },
    fail() {
      ws.readyState = WS.CLOSED;
      ws.onerror?.(null);
    },
    message(data: string) {
      ws.readyState = WS.OPEN;
      ws.onmessage?.({ data });
    },
  };
}

describe('WebSocketLogEventSource', () => {
  it('processes one-line messages', () => {
    const { ws, open, message, close } = fakeSocket();
    const source = createWebSocketEventSource('ws://test', () => ws);
    const events: LogEvent[] = [];
    source.onEvent((e) => events.push(e));
    source.start();
    open();
    message('Ada|A|src/main.ts\n');

    expect(events).toHaveLength(1);
    expect(events[0]!.user).toBe('Ada');
    expect(events[0]!.action).toBe('A');
    expect(events[0]!.path).toBe('src/main.ts');
    source.stop();
    close();
  });

  it('processes multi-line messages', () => {
    const { ws, close, message, open } = fakeSocket();
    const source = createWebSocketEventSource('ws://test', () => ws);
    const events: LogEvent[] = [];
    source.onEvent((e) => events.push(e));
    source.start();
    open();
    message('Ada|A|src/main.ts\nBob|M|lib/util.ts\n');

    expect(events).toHaveLength(2);
    expect(events[0]!.user).toBe('Ada');
    expect(events[1]!.user).toBe('Bob');
    source.stop();
    close();
  });

  it('handles CRLF line endings', () => {
    const { ws, open, message, close } = fakeSocket();
    const source = createWebSocketEventSource('ws://test', () => ws);
    const events: LogEvent[] = [];
    source.onEvent((e) => events.push(e));
    source.start();
    open();
    message('Ada|A|src/main.ts\r\nBob|M|lib/util.ts\r\n');

    expect(events).toHaveLength(2);
    expect(events[0]!.path).toBe('src/main.ts');
    expect(events[1]!.path).toBe('lib/util.ts');
    source.stop();
    close();
  });

  it('ignores empty lines', () => {
    const { ws, open, message, close } = fakeSocket();
    const source = createWebSocketEventSource('ws://test', () => ws);
    const events: LogEvent[] = [];
    source.onEvent((e) => events.push(e));
    source.start();
    open();
    message('\nAda|A|src/main.ts\n\n\nBob|M|lib/util.ts\n\n');

    expect(events).toHaveLength(2);
    source.stop();
    close();
  });

  it('reports parse errors without crashing', () => {
    const { ws, open, message, close } = fakeSocket();
    const source = createWebSocketEventSource('ws://test', () => ws);
    const events: LogEvent[] = [];
    source.onEvent((e) => events.push(e));
    source.start();
    open();
    message('invalid-garbage\nAda|A|src/main.ts\nmore-garbage\nBob|M|lib/util.ts\n');

    expect(events).toHaveLength(2);
    expect(events[0]!.user).toBe('Ada');
    expect(events[1]!.user).toBe('Bob');
    source.stop();
    close();
  });

  it('reports connection states', () => {
    const { ws, open, close } = fakeSocket();
    const source = createWebSocketEventSource('ws://test', () => ws);
    const states: ConnectionState[] = [];
    source.onState((s) => states.push(s));
    source.start();
    open();
    close();

    expect(states).toContain('connecting');
    expect(states).toContain('open');
    expect(states).toContain('closed');
    source.stop();
  });

  it('reports failure state on connection error', () => {
    const { ws, fail } = fakeSocket();
    const source = createWebSocketEventSource('ws://test', () => ws);
    const states: ConnectionState[] = [];
    source.onState((s) => states.push(s));
    source.start();
    fail();

    expect(states).toContain('failed');
    source.stop();
  });

  it('unsubscribes listeners correctly', () => {
    const { ws, open, message, close } = fakeSocket();
    const source = createWebSocketEventSource('ws://test', () => ws);
    const events: LogEvent[] = [];
    const unsub = source.onEvent((e) => events.push(e));
    source.start();
    open();
    message('Ada|A|src/main.ts\n');
    expect(events).toHaveLength(1);

    unsub();
    message('Bob|M|lib/util.ts\n');
    expect(events).toHaveLength(1); // still 1, unsubscribed

    source.stop();
    close();
  });

  it('stop closes the socket and reports closed state', () => {
    const { ws, open, close } = fakeSocket();
    const source = createWebSocketEventSource('ws://test', () => ws);
    const states: ConnectionState[] = [];
    source.onState((s) => states.push(s));
    source.start();
    open();

    source.stop();
    expect(states).toContain('closed');
    close();
  });

  it('restart creates a fresh connection', () => {
    let callCount = 0;
    const { ws, open, message } = fakeSocket();
    const source = createWebSocketEventSource('ws://test', () => {
      callCount++;
      return ws;
    });
    const events: LogEvent[] = [];
    source.onEvent((e) => events.push(e));
    source.start();
    open();
    message('Ada|A|src/main.ts\n');
    expect(events).toHaveLength(1);
    expect(events[0]!.sequence).toBe(1);

    source.stop();
    source.start();
    open();
    message('Bob|M|lib/util.ts\n');
    expect(events).toHaveLength(2);
    expect(events[1]!.sequence).toBe(1); // reset
  });
});

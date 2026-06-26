import { describe, expect, it, beforeEach } from 'vitest';
import { LiveQueue } from './advance-live-queue';
import { createLogEvent } from '../domain/factories';

describe('LiveQueue', () => {
  let q: LiveQueue;

  beforeEach(() => {
    q = new LiveQueue();
  });

  it('enqueues and drains in FIFO order', () => {
    const e1 = createLogEvent(1, 'Ada', 'A', 'a.ts');
    const e2 = createLogEvent(2, 'Bob', 'A', 'b.ts');
    const e3 = createLogEvent(3, 'Ada', 'M', 'c.ts');
    q.enqueue(e1);
    q.enqueue(e2);
    q.enqueue(e3);
    expect(q.size).toBe(3);

    const results: string[] = [];
    q.tick(2, (e) => results.push(e.path));
    expect(results).toEqual(['a.ts', 'b.ts']);
    expect(q.size).toBe(1);

    q.tick(1, (e) => results.push(e.path));
    expect(results).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(q.size).toBe(0);
  });

  it('respects drain rate', () => {
    for (let i = 0; i < 10; i++) {
      q.enqueue(createLogEvent(i + 1, 'Ada', 'A', `f${i}.ts`));
    }
    const results: string[] = [];
    q.tick(3, (e) => results.push(e.path));
    expect(results).toHaveLength(3);
    expect(q.size).toBe(7);
  });

  it('pause stops draining', () => {
    q.enqueue(createLogEvent(1, 'Ada', 'A', 'a.ts'));
    q.pause();
    const results: string[] = [];
    q.tick(10, (e) => results.push(e.path));
    expect(results).toHaveLength(0);
    expect(q.size).toBe(1);
    expect(q.paused).toBe(true);
  });

  it('resume restarts draining', () => {
    q.enqueue(createLogEvent(1, 'Ada', 'A', 'a.ts'));
    q.pause();
    q.resume();
    const results: string[] = [];
    q.tick(10, (e) => results.push(e.path));
    expect(results).toHaveLength(1);
    expect(q.paused).toBe(false);
  });

  it('handles burst of events within rate limit', () => {
    const events = Array.from({ length: 100 }, (_, i) =>
      createLogEvent(i + 1, 'Ada', 'A', `f${i}.ts`),
    );
    for (const e of events) q.enqueue(e);
    expect(q.size).toBe(100);

    const results: string[] = [];
    q.tick(5, (e) => results.push(e.path));
    expect(results).toHaveLength(5);
    expect(q.size).toBe(95);
  });

  it('reset clears queue and unpauses', () => {
    q.enqueue(createLogEvent(1, 'Ada', 'A', 'a.ts'));
    q.enqueue(createLogEvent(2, 'Bob', 'A', 'b.ts'));
    q.pause();
    q.reset();
    expect(q.size).toBe(0);
    expect(q.paused).toBe(false);
  });

  it('tick with zero events works', () => {
    const results: string[] = [];
    q.tick(10, (e) => results.push(e.path));
    expect(results).toHaveLength(0);
  });
});

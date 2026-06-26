import { describe, expect, it } from 'vitest';
import { parseStartup } from './startup';

describe('parseStartup', () => {
  it('returns defaults when no params', () => {
    const r = parseStartup('');
    expect(r.wsUrl).toBe('ws://localhost:8080/stream');
    expect(r.speed).toBe(8);
    expect(r.autoplay).toBe(false);
    expect(r.demo).toBe(false);
    expect(r.isValid).toBe(true);
  });

  it('parses custom ws URL', () => {
    const r = parseStartup('?ws=wss://example.com/events');
    expect(r.wsUrl).toBe('wss://example.com/events');
    expect(r.isValid).toBe(true);
  });

  it('parses custom speed', () => {
    const r = parseStartup('?speed=10');
    expect(r.speed).toBe(10);
  });

  it('parses autoplay=1 as true', () => {
    const r = parseStartup('?autoplay=1');
    expect(r.autoplay).toBe(true);
  });

  it('parses autoplay=0 as false', () => {
    const r = parseStartup('?autoplay=0');
    expect(r.autoplay).toBe(false);
  });

  it('parses demo flag', () => {
    const r = parseStartup('?demo');
    expect(r.demo).toBe(true);
  });

  it('rejects invalid ws URL', () => {
    const r = parseStartup('?ws=not-a-url');
    expect(r.isValid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid speed', () => {
    const r = parseStartup('?speed=abc');
    expect(r.isValid).toBe(false);
  });

  it('rejects speed out of range', () => {
    expect(parseStartup('?speed=0').isValid).toBe(false);
    expect(parseStartup('?speed=101').isValid).toBe(false);
  });

  it('parses all params together', () => {
    const r = parseStartup('?ws=wss://prod.example/stream&speed=20&autoplay=0&demo');
    expect(r.wsUrl).toBe('wss://prod.example/stream');
    expect(r.speed).toBe(20);
    expect(r.autoplay).toBe(false);
    expect(r.demo).toBe(true);
    expect(r.isValid).toBe(true);
  });
});

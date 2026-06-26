import { describe, expect, it } from 'vitest';
import { createLogEvent, createUser, createUserAction, hashColor } from './factories';

describe('createLogEvent', () => {
  it('creates a valid add event', () => {
    const e = createLogEvent(1, 'Ada', 'A', 'src/main.ts');
    expect(e.sequence).toBe(1);
    expect(e.user).toBe('Ada');
    expect(e.action).toBe('A');
    expect(e.path).toBe('src/main.ts');
    expect(e.color).toBeUndefined();
  });

  it('creates a valid modify event with color', () => {
    const e = createLogEvent(2, 'Bob', 'M', 'lib/util.ts', { r: 1, g: 0, b: 0 });
    expect(e.action).toBe('M');
    expect(e.color).toEqual({ r: 1, g: 0, b: 0 });
  });

  it('creates a valid delete event', () => {
    const e = createLogEvent(3, 'Ada', 'D', 'old.ts');
    expect(e.action).toBe('D');
  });

  it('throws on invalid sequence', () => {
    expect(() => createLogEvent(0, 'Ada', 'A', 'x')).toThrow();
    expect(() => createLogEvent(-1, 'Ada', 'A', 'x')).toThrow();
    expect(() => createLogEvent(1.5, 'Ada', 'A', 'x')).toThrow();
  });

  it('throws on empty user', () => {
    expect(() => createLogEvent(1, '', 'A', 'x')).toThrow();
  });

  it('throws on invalid action', () => {
    expect(() => createLogEvent(1, 'Ada', 'X', 'x')).toThrow();
    expect(() => createLogEvent(1, 'Ada', '', 'x')).toThrow();
  });

  it('throws on empty path', () => {
    expect(() => createLogEvent(1, 'Ada', 'A', '')).toThrow();
  });

  it('throws on invalid color components', () => {
    expect(() => createLogEvent(1, 'Ada', 'A', 'x', { r: 2, g: 0, b: 0 })).toThrow();
    expect(() => createLogEvent(1, 'Ada', 'A', 'x', { r: 0, g: -0.1, b: 0 })).toThrow();
  });
});

describe('createUser', () => {
  it('creates a user with deterministic color', () => {
    const u1 = createUser('Ada', 100, 200);
    const u2 = createUser('Ada', 300, 400);
    expect(u1.name).toBe('Ada');
    expect(u1.x).toBe(100);
    expect(u1.y).toBe(200);
    expect(u1.actions).toEqual([]);
    expect(u1.color).toEqual(u2.color); // same name, same color
  });

  it('gives different users different colors', () => {
    const u1 = createUser('Ada', 0, 0);
    const u2 = createUser('Bob', 0, 0);
    expect(u1.color).not.toEqual(u2.color);
  });
});

describe('createUserAction', () => {
  it('creates a pending action', () => {
    const a = createUserAction('A', 'src/main.ts');
    expect(a.kind).toBe('A');
    expect(a.path).toBe('src/main.ts');
    expect(a.progress).toBe(0);
    expect(a.active).toBe(false);
  });
});

describe('hashColor', () => {
  it('returns valid RGB components', () => {
    const c = hashColor('test-user');
    expect(c.r).toBeGreaterThanOrEqual(0);
    expect(c.r).toBeLessThanOrEqual(1);
    expect(c.g).toBeGreaterThanOrEqual(0);
    expect(c.g).toBeLessThanOrEqual(1);
    expect(c.b).toBeGreaterThanOrEqual(0);
    expect(c.b).toBeLessThanOrEqual(1);
  });

  it('is deterministic', () => {
    expect(hashColor('hello')).toEqual(hashColor('hello'));
  });
});

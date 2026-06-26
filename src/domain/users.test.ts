import { describe, expect, it, beforeEach } from 'vitest';
import { UserManager } from './users';
import { createLogEvent } from './factories';

describe('UserManager', () => {
  let mgr: UserManager;

  beforeEach(() => {
    mgr = new UserManager();
  });

  it('creates user on first event', () => {
    const user = mgr.getOrCreate('Ada');
    expect(user.name).toBe('Ada');
    expect(user.actions).toEqual([]);
  });

  it('returns same user on repeated calls', () => {
    const u1 = mgr.getOrCreate('Ada');
    const u2 = mgr.getOrCreate('Ada');
    expect(u1).toBe(u2);
  });

  it('gives deterministic colors based on name', () => {
    const u1 = mgr.getOrCreate('Ada');
    mgr.reset();
    const u2 = mgr.getOrCreate('Ada');
    expect(u1.color).toEqual(u2.color);
  });

  it('enqueues actions from log events', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);
    const user = mgr.getOrCreate('Ada');
    expect(user.actions).toHaveLength(1);
    expect(user.actions[0]!.kind).toBe('A');
    expect(user.actions[0]!.path).toBe('main.ts');
    expect(user.actions[0]!.active).toBe(false);
    expect(user.actions[0]!.progress).toBe(0);
  });

  it('activates pending actions when lag exceeds maxFileLag', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);

    // Target far away, but lag exceeds 5s — force activation
    const getActionTargetPosition = () => ({ x: 1000, y: 1000 });
    mgr.tick(3.0, 6.0, getActionTargetPosition); // time 6s, lag 6s > 5s

    const user = mgr.getOrCreate('Ada');
    expect(user.actions).toHaveLength(0); // completed and removed (forced rate is fast)
  });

  it('activates pending action when user is near target (within beamDistance)', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);

    const user = mgr.getOrCreate('Ada');
    user.x = 100;
    user.y = 100;

    // Target is within beamDistance (100)
    const getActionTargetPosition = () => ({ x: 120, y: 100 });
    mgr.tick(0.1, 0.1, getActionTargetPosition);

    expect(user.actions[0]!.active).toBe(true);
  });

  it('keeps action pending when target is far and lag is short', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);

    const user = mgr.getOrCreate('Ada');
    user.x = 0;
    user.y = 0;

    // Target is far (> beamDistance)
    const getActionTargetPosition = () => ({ x: 500, y: 0 });
    mgr.tick(0.1, 0.1, getActionTargetPosition);

    expect(user.actions[0]!.active).toBe(false);
  });

  it('advances action progress once active', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);

    const user = mgr.getOrCreate('Ada');
    user.x = 0;
    user.y = 0;

    const getActionTargetPosition = () => ({ x: 0, y: 0 });
    mgr.tick(0.5, 0.5, getActionTargetPosition); // activate + advance
    expect(user.actions[0]!.active).toBe(true);
    // baseRate 0.5, dt 0.5 → progress 0.25
    expect(user.actions[0]!.progress).toBeCloseTo(0.25, 1);

    mgr.tick(0.1, 1.0, getActionTargetPosition);
    // additional 0.1 * 0.5 = 0.05 → total 0.30
    expect(user.actions[0]!.progress).toBeCloseTo(0.30, 1);
  });

  it('completes and removes actions when progress reaches 1', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);

    const user = mgr.getOrCreate('Ada');
    user.x = 0;
    user.y = 0;

    const getActionTargetPosition = () => ({ x: 0, y: 0 });
    mgr.tick(4.0, 4.0, getActionTargetPosition); // base rate 0.5, needs ~2s

    expect(user.actions).toHaveLength(0);
  });

  it('forces action rate when lag exceeds maxFileLag', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);

    const user = mgr.getOrCreate('Ada');
    user.x = 0;
    user.y = 0;

    // Lag > 5s, uses forcedActionRate 2
    const getActionTargetPosition = () => ({ x: 1000, y: 1000 });
    mgr.tick(1.0, 6.0, getActionTargetPosition); // lag 6s, rate 2, completes in 0.5s

    expect(user.actions).toHaveLength(0); // completed
  });

  it('resets all users and actions', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);
    expect(mgr.users).toHaveLength(1);

    mgr.reset();
    expect(mgr.users).toHaveLength(0);
  });

  it('handles multiple users', () => {
    mgr.enqueueAction(createLogEvent(1, 'Ada', 'A', 'a.ts'), 0);
    mgr.enqueueAction(createLogEvent(2, 'Bob', 'M', 'b.ts'), 0);
    mgr.enqueueAction(createLogEvent(3, 'Ada', 'D', 'c.ts'), 0);

    const adaUser = mgr.getOrCreate('Ada');
    const bobUser = mgr.getOrCreate('Bob');
    expect(adaUser.actions).toHaveLength(2);
    expect(bobUser.actions).toHaveLength(1);
  });

  it('delete action completes normally', () => {
    const event = createLogEvent(1, 'Ada', 'D', 'main.ts');
    mgr.enqueueAction(event, 0);

    const user = mgr.getOrCreate('Ada');
    user.x = 0;
    user.y = 0;

    const getActionTargetPosition = () => ({ x: 0, y: 0 });
    mgr.tick(4.0, 4.0, getActionTargetPosition);

    expect(user.actions).toHaveLength(0);
  });

  it('action progress is faster with pending backlog', () => {
    mgr.enqueueAction(createLogEvent(1, 'Ada', 'A', 'a.ts'), 0);
    mgr.enqueueAction(createLogEvent(2, 'Ada', 'A', 'b.ts'), 1);
    mgr.enqueueAction(createLogEvent(3, 'Ada', 'A', 'c.ts'), 2);

    const user = mgr.getOrCreate('Ada');
    user.x = 0;
    user.y = 0;

    const getActionTargetPosition = () => ({ x: 0, y: 0 });
    mgr.tick(0.5, 0.5, getActionTargetPosition);

    // 3 pending actions → effectiveRate = min(10, 0.5 * 3) = 1.5
    // progress 0.5 * 1.5 = 0.75
    expect(user.actions[0]!.active).toBe(true);
    expect(user.actions[0]!.progress).toBeGreaterThan(0.5); // faster than base 0.5
  });
});

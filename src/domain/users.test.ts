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

  it('activates pending actions when lag exceeds threshold', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);

    const getUserPos = () => ({ x: 1000, y: 1000 }); // far from user
    mgr.tick(3.0, 5.0, getUserPos); // large dt, time exceeds lag

    const user = mgr.getOrCreate('Ada');
    expect(user.actions).toHaveLength(0); // completed and removed
  });

  it('activates pending action when user is near target', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);

    const user = mgr.getOrCreate('Ada');
    user.x = 100;
    user.y = 100;

    // getUserPos returns position near the user
    const getUserPos = () => ({ x: 105, y: 100 });
    mgr.tick(0.1, 0.1, getUserPos);

    expect(user.actions[0]!.active).toBe(true);
  });

  it('advances action progress once active', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);

    const user = mgr.getOrCreate('Ada');
    user.x = 0;
    user.y = 0;

    const getUserPos = () => ({ x: 0, y: 0 });
    mgr.tick(0.5, 0.5, getUserPos); // activate + advance 0.5
    expect(user.actions[0]!.active).toBe(true);

    mgr.tick(0.1, 1.0, getUserPos); // advance another 0.1
    expect(user.actions[0]!.progress).toBeCloseTo(0.6, 1);
  });

  it('completes and removes actions when progress reaches 1', () => {
    const event = createLogEvent(1, 'Ada', 'A', 'main.ts');
    mgr.enqueueAction(event, 0);

    const user = mgr.getOrCreate('Ada');
    user.x = 0;
    user.y = 0;

    const getUserPos = () => ({ x: 0, y: 0 });
    mgr.tick(2.5, 2.5, getUserPos); // activate + enough progress

    expect(user.actions).toHaveLength(0);
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

    const getUserPos = () => ({ x: 0, y: 0 });
    mgr.tick(2.5, 2.5, getUserPos);

    expect(user.actions).toHaveLength(0);
  });
});

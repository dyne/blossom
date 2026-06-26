import type { ActionKind, LogEvent, User, UserAction } from './types';
import { hashColor } from './factories';
import { GOURCE } from './gource-visual-config';

/** Manages users and their actions. */
export class UserManager {
  #users = new Map<string, User>();

  get users(): User[] {
    return [...this.#users.values()];
  }

  /** Find or create a user from a log event. Position set separately by simulation. */
  getOrCreate(name: string): User {
    let user = this.#users.get(name);
    if (!user) {
      user = { name, color: hashColor(name), x: 0, y: 0, actions: [] };
      this.#users.set(name, user);
    }
    return user;
  }

  /** Enqueue an action for a user from a log event. */
  enqueueAction(event: LogEvent, time: number): void {
    const user = this.getOrCreate(event.user);
    user.lastAction = time;
    const action: UserAction = {
      kind: event.action,
      path: event.path,
      active: false,
      progress: 0,
      pendingSince: time,
      event,
    };
    user.actions.push(action);
  }

  /** Advance user actions: activate pending, advance progress, complete finished. */
  tick(
    dt: number,
    time: number,
    getActionTargetPosition: (path: string) => { x: number; y: number } | undefined,
  ): void {
    for (const user of this.#users.values()) {
      let activatedThisTick = false;

      // Iterate oldest-first so the first pending action activates first
      for (let i = 0; i < user.actions.length; i++) {
        const action = user.actions[i]!;

        if (!action.active) {
          if (activatedThisTick) continue;

          const target = getActionTargetPosition(action.path);
          const dist = target
            ? Math.hypot(target.x - user.x, target.y - user.y)
            : Infinity;
          const lag = time - (action.pendingSince ?? time);

          if (dist < GOURCE.beamDistance || lag > GOURCE.maxFileLag) {
            action.active = true;
            activatedThisTick = true;
          }
        }

        if (action.active) {
          const pendingCount = user.actions.length;
          const isForced = action.pendingSince !== undefined
            && (time - action.pendingSince) > GOURCE.maxFileLag;
          const effectiveRate = isForced
            ? GOURCE.forcedActionRate
            : Math.min(10, GOURCE.baseActionRate * Math.max(1, pendingCount));
          action.progress += dt * effectiveRate;

          if (action.progress >= 1.0) {
            action.progress = 1.0;
            user.actions.splice(i, 1);
            i--; // adjust index after removal
          }
        }
      }
    }
  }

  /** Reset all users and actions. */
  reset(): void {
    this.#users.clear();
  }
}

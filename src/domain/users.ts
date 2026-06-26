import type { ActionKind, LogEvent, User, UserAction } from './types';
import { hashColor } from './factories';

const MAX_ACTION_LAG = 2.0; // seconds before auto-activation

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
  tick(dt: number, time: number, getUserPos: (name: string) => { x: number; y: number }): void {
    for (const user of this.#users.values()) {
      for (let i = user.actions.length - 1; i >= 0; i--) {
        const action = user.actions[i]!;

        if (!action.active) {
          const pos = getUserPos(user.name);
          const dist = Math.hypot(pos.x - user.x, pos.y - user.y);
          const lag = time - (action.pendingSince ?? time);

          if (dist < 50 || lag > MAX_ACTION_LAG) {
            action.active = true;
          }
        }

        if (action.active) {
          action.progress += dt * 1.0; // 1 second to complete

          if (action.progress >= 1.0) {
            action.progress = 1.0;
            user.actions.splice(i, 1);
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

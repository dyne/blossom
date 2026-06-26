import type { ActionKind, Color, LogEvent, User, UserAction } from './types';

const VALID_ACTIONS = new Set<ActionKind>(['A', 'M', 'D']);

/** Create a validated LogEvent. Throws on invalid input. */
export function createLogEvent(
  sequence: number,
  user: string,
  action: string,
  path: string,
  color?: Color,
): LogEvent {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Invalid sequence: ${sequence}`);
  }
  if (!user) {
    throw new Error('User must not be empty');
  }
  if (!VALID_ACTIONS.has(action as ActionKind)) {
    throw new Error(`Invalid action: ${action}`);
  }
  if (!path) {
    throw new Error('Path must not be empty');
  }
  if (color !== undefined) {
    if (color.r < 0 || color.r > 1 || color.g < 0 || color.g > 1 || color.b < 0 || color.b > 1) {
      throw new Error('Color components must be in [0, 1]');
    }
  }
  return { sequence, user, action: action as ActionKind, path, color };
}

/** Create a User with a deterministic color hash from the name. */
export function createUser(name: string, x: number, y: number): User {
  const color = hashColor(name);
  return { name, color, x, y, actions: [] };
}

/** Create a pending user action. */
export function createUserAction(kind: ActionKind, path: string): UserAction {
  return { kind, path, progress: 0, active: false };
}

/** Generate a deterministic color from a string hash. */
export function hashColor(name: string): Color {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  h = Math.abs(h);
  const hue = (h % 360) / 360;
  return hslToRgb(hue, 0.65, 0.55);
}

function hslToRgb(h: number, s: number, l: number): Color {
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3),
    g: hue2rgb(p, q, h),
    b: hue2rgb(p, q, h - 1 / 3),
  };
}

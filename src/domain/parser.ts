import type { ActionKind, Color, LogEvent } from './types.ts';

const VALID_ACTIONS = new Set<string>(['A', 'M', 'D']);
const COLOR_HEX_RE = /^#?([0-9a-fA-F]{6})$/;

/** Parse a non-empty Blossom protocol line into a LogEvent. Returns null if invalid. */
export function parseLogLine(line: string, sequence: number): LogEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('|');
  if (parts.length < 3 || parts.length > 4) return null;

  const username = parts[0] === '' ? 'Unknown' : parts[0]!;
  const actionRaw = parts[1] === '' ? 'A' : parts[1]!;
  const path = parts[2]!;
  const colorRaw = parts.length === 4 ? parts[3] : undefined;

  if (!path) return null;
  if (!VALID_ACTIONS.has(actionRaw)) return null;

  let color: Color | undefined;
  if (colorRaw !== undefined && colorRaw !== '') {
    const parsed = parseColor(colorRaw);
    if (!parsed) return null;
    color = parsed;
  }

  return {
    sequence,
    user: username,
    action: actionRaw as ActionKind,
    path,
    color,
  };
}

/** Normalize a hex color string to RGB floats. Returns null if invalid. */
export function parseColor(raw: string): Color | null {
  const m = COLOR_HEX_RE.exec(raw);
  if (!m) return null;
  const hex = m[1]!;
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

/** Check and strip a UTF-8 BOM from the first line if present. */
export function stripBom(line: string, isFirstLine: boolean): string {
  if (isFirstLine && line.codePointAt(0) === 0xfeff) {
    return line.slice(1);
  }
  return line;
}

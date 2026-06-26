import { describe, expect, it } from 'vitest';
import { parseColor, parseLogLine, stripBom } from './parser.ts';

describe('parseLogLine', () => {
  it('parses a valid add line', () => {
    const e = parseLogLine('Ada|A|src/main.ts', 1);
    expect(e).toBeTruthy();
    expect(e!.sequence).toBe(1);
    expect(e!.user).toBe('Ada');
    expect(e!.action).toBe('A');
    expect(e!.path).toBe('src/main.ts');
    expect(e!.color).toBeUndefined();
  });

  it('parses a valid modify line', () => {
    const e = parseLogLine('Ada|M|src/main.ts', 2);
    expect(e).toBeTruthy();
    expect(e!.action).toBe('M');
  });

  it('parses a valid delete line', () => {
    const e = parseLogLine('Ada|D|src/main.ts', 3);
    expect(e).toBeTruthy();
    expect(e!.action).toBe('D');
  });

  it('parses a line with color', () => {
    const e = parseLogLine('Ada|M|src/main.ts|ffcc33', 4);
    expect(e).toBeTruthy();
    expect(e!.color).toEqual({ r: 1, g: 0.8, b: 0.2 });
  });

  it('parses a line with #-prefixed color', () => {
    const e = parseLogLine('Ada|A|src/main.ts|#ff0000', 5);
    expect(e).toBeTruthy();
    expect(e!.color).toEqual({ r: 1, g: 0, b: 0 });
  });

  it('defaults empty user to Unknown', () => {
    const e = parseLogLine('|A|src/main.ts', 6);
    expect(e).toBeTruthy();
    expect(e!.user).toBe('Unknown');
  });

  it('defaults empty action to A', () => {
    const e = parseLogLine('Ada||src/main.ts', 7);
    expect(e).toBeTruthy();
    expect(e!.action).toBe('A');
  });

  it('accepts path with spaces', () => {
    const e = parseLogLine('Ada|A|my projects/main.ts', 8);
    expect(e).toBeTruthy();
    expect(e!.path).toBe('my projects/main.ts');
  });

  it('rejects too few fields', () => {
    expect(parseLogLine('Ada|A', 9)).toBeNull();
    expect(parseLogLine('Ada', 10)).toBeNull();
  });

  it('rejects too many fields', () => {
    expect(parseLogLine('Ada|A|src/main.ts|ff0000|extra', 11)).toBeNull();
  });

  it('rejects empty path', () => {
    expect(parseLogLine('Ada|A|', 12)).toBeNull();
  });

  it('rejects invalid action', () => {
    expect(parseLogLine('Ada|X|src/main.ts', 13)).toBeNull();
    expect(parseLogLine('Ada|R|src/main.ts', 14)).toBeNull();
  });

  it('rejects invalid color', () => {
    expect(parseLogLine('Ada|A|src/main.ts|xyz', 15)).toBeNull();
    expect(parseLogLine('Ada|A|src/main.ts|ff', 16)).toBeNull();
    expect(parseLogLine('Ada|A|src/main.ts|ZZZZZZ', 17)).toBeNull();
  });

  it('rejects empty lines', () => {
    expect(parseLogLine('', 18)).toBeNull();
    expect(parseLogLine('   ', 19)).toBeNull();
  });

  it('handles color with empty color field (treated as no color)', () => {
    const e = parseLogLine('Ada|A|src/main.ts|', 20);
    expect(e).toBeTruthy();
    expect(e!.color).toBeUndefined();
  });
});

describe('parseColor', () => {
  it('parses RRGGBB', () => {
    expect(parseColor('ffcc33')).toEqual({ r: 1, g: 0.8, b: 0.2 });
  });

  it('parses #RRGGBB', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0 });
  });

  it('returns null for invalid', () => {
    expect(parseColor('xyz')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor('ff')).toBeNull();
  });
});

describe('stripBom', () => {
  it('strips BOM on first line', () => {
    expect(stripBom('\uFEFFAda|A|x', true)).toBe('Ada|A|x');
  });

  it('does not strip BOM on non-first line', () => {
    expect(stripBom('\uFEFFAda|A|x', false)).toBe('\uFEFFAda|A|x');
  });

  it('passes through line without BOM', () => {
    expect(stripBom('Ada|A|x', true)).toBe('Ada|A|x');
  });
});

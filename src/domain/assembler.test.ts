import { describe, expect, it, beforeEach } from 'vitest';
import { LogEventAssembler } from './assembler';

describe('LogEventAssembler', () => {
  let assembler: LogEventAssembler;

  beforeEach(() => {
    assembler = new LogEventAssembler();
  });

  it('emits events in order with increasing sequence numbers', () => {
    const e1 = assembler.acceptLine('Ada|A|src/main.ts');
    const e2 = assembler.acceptLine('Bob|M|lib/util.ts');
    const e3 = assembler.acceptLine('Ada|D|old.ts');

    expect(e1!.sequence).toBe(1);
    expect(e2!.sequence).toBe(2);
    expect(e3!.sequence).toBe(3);
    expect(e1!.user).toBe('Ada');
    expect(e2!.user).toBe('Bob');
    expect(e3!.user).toBe('Ada');
  });

  it('skips null for invalid lines but still increments sequence', () => {
    const e1 = assembler.acceptLine('Ada|A|src/main.ts');
    const e2 = assembler.acceptLine('invalid');
    const e3 = assembler.acceptLine('Bob|M|lib/util.ts');

    expect(e1).toBeTruthy();
    expect(e2).toBeNull();
    expect(e3).toBeTruthy();
    expect(e1!.sequence).toBe(1);
    expect(e3!.sequence).toBe(3);
    expect(assembler.sequence).toBe(3);
  });

  it('handles empty stream gracefully', () => {
    const events = assembler.acceptLines([]);
    expect(events).toEqual([]);
    expect(assembler.sequence).toBe(0);
  });

  it('handles batches of multiple lines', () => {
    const events = assembler.acceptLines([
      'Ada|A|src/main.ts',
      'invalid',
      'Bob|M|lib/util.ts',
      '',
      'Ada|D|old.ts',
    ]);
    expect(events).toHaveLength(3);
    expect(events[0]!.sequence).toBe(1);
    expect(events[1]!.sequence).toBe(3);
    expect(events[2]!.sequence).toBe(5);
    expect(assembler.sequence).toBe(5);
  });

  it('strips BOM on first line only', () => {
    const e1 = assembler.acceptLine('\uFEFFAda|A|src/main.ts');
    const e2 = assembler.acceptLine('\uFEFFBob|M|lib/util.ts');

    expect(e1).toBeTruthy();
    expect(e1!.user).toBe('Ada'); // BOM stripped
    // BOM on non-first line is kept but trimmed by parser (it's whitespace-like)
    expect(e2).toBeTruthy();
    expect(e2!.user).toBe('Bob');
  });

  it('resets state completely', () => {
    assembler.acceptLine('Ada|A|src/main.ts');
    assembler.acceptLine('Bob|M|lib/util.ts');
    expect(assembler.sequence).toBe(2);

    assembler.reset();
    expect(assembler.sequence).toBe(0);

    // After reset, BOM should be stripped again
    const e1 = assembler.acceptLine('\uFEFFAda|A|src/main.ts');
    expect(e1).toBeTruthy();
    expect(e1!.user).toBe('Ada');
    expect(e1!.sequence).toBe(1);
  });

  it('does not sort or group events', () => {
    // Events are strictly in arrival order
    const events = assembler.acceptLines([
      'Zee|M|z.ts',
      'Ada|A|a.ts',
      'Bob|D|b.ts',
    ]);
    expect(events).toHaveLength(3);
    expect(events[0]!.user).toBe('Zee');
    expect(events[1]!.user).toBe('Ada');
    expect(events[2]!.user).toBe('Bob');
  });
});

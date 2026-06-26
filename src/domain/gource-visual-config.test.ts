import { describe, expect, it } from 'vitest';
import { GOURCE } from './gource-visual-config';

describe('Gource visual config', () => {
  it('exports expected constants', () => {
    expect(GOURCE.fileDiameter).toBe(8);
    expect(GOURCE.fileRadius).toBe(4);
    expect(GOURCE.fileMoveSpeed).toBe(5);
    expect(GOURCE.dirPadding).toBe(1.5);
    expect(GOURCE.forceGravity).toBe(10);
    expect(GOURCE.minDirRadius).toBe(1);
    expect(GOURCE.userSize).toBe(20);
    expect(GOURCE.userShadowOffset).toBe(2);
    expect(GOURCE.beamDistance).toBe(100);
    expect(GOURCE.actionDistance).toBe(50);
    expect(GOURCE.personalSpaceDistance).toBe(100);
    expect(GOURCE.maxUserSpeed).toBe(500);
    expect(GOURCE.userFriction).toBe(1);
    expect(GOURCE.maxFileLag).toBe(5);
    expect(GOURCE.baseActionRate).toBe(0.5);
    expect(GOURCE.forcedActionRate).toBe(2);
    expect(GOURCE.userIdleTime).toBe(3);
    expect(GOURCE.fadeDuration).toBe(1);
    expect(GOURCE.fileNameTime).toBe(4);
    expect(GOURCE.cameraPadding).toBeCloseTo(1.1);
    expect(GOURCE.backgroundColor).toBe('#1a1a1a');
    expect(GOURCE.shadowOffset).toBe(2);
    expect(GOURCE.branchWidth).toBe(5);
  });

  it('is readonly at TS level', () => {
    expect(Object.isFrozen(GOURCE)).toBe(false); // as const makes values readonly but object not frozen
    expect(typeof GOURCE.fileDiameter).toBe('number');
  });
});

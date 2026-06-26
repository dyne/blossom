import { describe, expect, it, beforeEach } from 'vitest';
import { Camera } from './camera';

describe('Camera', () => {
  let cam: Camera;

  beforeEach(() => {
    cam = new Camera();
    cam.resize(800, 600);
  });

  it('starts with default state', () => {
    expect(cam.state.zoom).toBe(1);
    expect(cam.state.x).toBe(0);
    expect(cam.state.y).toBe(0);
  });

  it('pans correctly', () => {
    cam.pan(-100, -50);
    expect(cam.state.x).toBe(100);
    expect(cam.state.y).toBe(50);
  });

  it('pan respects zoom', () => {
    cam.state.zoom = 2;
    cam.pan(-100, 0);
    expect(cam.state.x).toBe(50); // half the delta at 2x zoom
  });

  it('zooms at center point', () => {
    cam.zoomAt(2, 400, 300); // zoom 2x at screen center
    expect(cam.state.zoom).toBe(2);
    // Center stays at origin since zoom was at screen center
    expect(cam.state.x).toBeCloseTo(0, 5);
    expect(cam.state.y).toBeCloseTo(0, 5);
  });

  it('zooms at corner point', () => {
    cam.zoomAt(2, 0, 0); // zoom 2x at top-left corner
    expect(cam.state.zoom).toBe(2);
    // World point under top-left moves
    expect(cam.state.x).not.toBe(0);
  });

  it('clamps zoom to bounds', () => {
    cam.zoomAt(0.001, 400, 300);
    expect(cam.state.zoom).toBe(0.1); // min

    cam.zoomAt(100, 400, 300);
    expect(cam.state.zoom).toBe(10); // max
  });

  it('zooms in and out by step', () => {
    expect(cam.state.zoom).toBe(1);
    cam.zoomIn(400, 300);
    expect(cam.state.zoom).toBeCloseTo(1.1, 1);
    cam.zoomOut(400, 300);
    expect(cam.state.zoom).toBeCloseTo(1, 1);
  });

  it('fits bounds into view', () => {
    cam.fitToView({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
    expect(cam.state.zoom).toBeGreaterThan(0);
    expect(cam.state.x).toBeCloseTo(0, 5);
    expect(cam.state.y).toBeCloseTo(0, 5);
  });

  it('fitToView handles zero-size viewport', () => {
    cam.resize(0, 0);
    cam.fitToView({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    // Should not change state when viewport is zero
    expect(cam.state.zoom).toBe(1);
  });

  it('worldToScreen converts correctly', () => {
    cam.state.x = 0;
    cam.state.y = 0;
    cam.state.zoom = 1;
    const [sx, sy] = cam.worldToScreen(0, 0);
    expect(sx).toBe(400);
    expect(sy).toBe(300);
  });

  it('screenToWorld converts correctly', () => {
    cam.state.x = 0;
    cam.state.y = 0;
    cam.state.zoom = 1;
    const [wx, wy] = cam.screenToWorld(400, 300);
    expect(wx).toBe(0);
    expect(wy).toBe(0);
  });

  it('worldToScreen and screenToWorld are inverses', () => {
    cam.state.x = 100;
    cam.state.y = -50;
    cam.state.zoom = 1.5;
    const [sx, sy] = cam.worldToScreen(200, 100);
    const [wx, wy] = cam.screenToWorld(sx, sy);
    expect(wx).toBeCloseTo(200, 5);
    expect(wy).toBeCloseTo(100, 5);
  });

  it('resize updates dimensions', () => {
    cam.resize(1024, 768);
    expect(cam.state.width).toBe(1024);
    expect(cam.state.height).toBe(768);
  });

  it('computeDirBounds computes bounds from nodes with radii', () => {
    const bounds = cam.computeDirBounds([
      { x: 0, y: 0, radius: 50 },
      { x: 100, y: 100, radius: 25 },
    ]);
    expect(bounds).toBeDefined();
    expect(bounds!.minX).toBeCloseTo(-50);
    expect(bounds!.maxX).toBeCloseTo(125);
    expect(bounds!.minY).toBeCloseTo(-50);
    expect(bounds!.maxY).toBeCloseTo(125);
  });

  it('computeDirBounds returns undefined for empty array', () => {
    expect(cam.computeDirBounds([])).toBeUndefined();
  });

  it('computeUserBounds computes bounds from user positions', () => {
    const bounds = cam.computeUserBounds([
      { x: -10, y: -20 },
      { x: 30, y: 40 },
    ]);
    expect(bounds).toBeDefined();
    expect(bounds!.minX).toBe(-10);
    expect(bounds!.maxX).toBe(30);
  });

  it('pan sets manualCamera flag', () => {
    expect(cam.manualCamera).toBe(false);
    cam.pan(-50, -25);
    expect(cam.manualCamera).toBe(true);
  });

  it('zoomAt sets manualZoom flag', () => {
    expect(cam.manualZoom).toBe(false);
    cam.zoomAt(2, 400, 300);
    expect(cam.manualZoom).toBe(true);
  });

  it('fitToView clears manual flags', () => {
    cam.pan(-50, -25);
    cam.zoomAt(2, 400, 300);
    expect(cam.manualCamera).toBe(true);
    expect(cam.manualZoom).toBe(true);
    cam.fitToView({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
    expect(cam.manualCamera).toBe(false);
    expect(cam.manualZoom).toBe(false);
  });

  it('tickMomentum eases toward destination', () => {
    cam.adjust({ minX: 0, minY: 0, maxX: 200, maxY: 200 });
    const initialX = cam.state.x;
    cam.tickMomentum(1 / 60);
    // Should have moved toward the center of bounds
    expect(cam.state.x).not.toBe(initialX);
  });

  it('tickMomentum converges to destination without overshoot', () => {
    cam.adjust({ minX: 0, minY: 0, maxX: 200, maxY: 200 });
    const target = { x: 100, y: 100 }; // center of bounds

    for (let i = 0; i < 300; i++) {
      cam.tickMomentum(1 / 60);
    }

    expect(cam.state.x).toBeCloseTo(target.x, 0);
    expect(cam.state.y).toBeCloseTo(target.y, 0);
  });

  it('adjust uses cameraPadding from Gource config', () => {
    cam.adjust({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    // zoom should account for padding
    expect(cam.state.zoom).toBeGreaterThan(0);
  });

  it('setFollowTarget does not override manualCamera', () => {
    cam.pan(-50, -25);
    expect(cam.manualCamera).toBe(true);
    const beforeX = cam.state.x;
    cam.setFollowTarget({ x: 999, y: 999 });
    cam.tickMomentum(1 / 60);
    // Should not move toward follow target when manual
    expect(cam.state.x).not.toBe(999);
  });
});

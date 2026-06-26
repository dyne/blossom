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
});

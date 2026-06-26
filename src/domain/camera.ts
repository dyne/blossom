import type { CameraState } from './types';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 0.1;

/** Camera model: pan, zoom, fit-to-view, coordinate transforms. */
export class Camera {
  state: CameraState = {
    x: 0, y: 0, zoom: 1, width: 800, height: 600,
    vx: 0, vy: 0,
  };

  /** Pan by screen-space delta (drag amount). */
  pan(dx: number, dy: number): void {
    this.state.x -= dx / this.state.zoom;
    this.state.y -= dy / this.state.zoom;
  }

  /** Zoom by factor centered at screen point (cx, cy). */
  zoomAt(factor: number, cx: number, cy: number): void {
    const oldZoom = this.state.zoom;
    this.state.zoom = this.#clampZoom(this.state.zoom * factor);

    // Adjust center so the point under (cx, cy) stays fixed
    const ratio = 1 / oldZoom - 1 / this.state.zoom;
    this.state.x += (cx - this.state.width / 2) * ratio;
    this.state.y += (cy - this.state.height / 2) * ratio;
  }

  /** Fit the given world bounds into view with padding. */
  fitToView(bounds: { minX: number; minY: number; maxX: number; maxY: number }, padding = 0.1): void {
    const w = this.state.width;
    const h = this.state.height;
    if (w === 0 || h === 0) return;

    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;

    const padW = Math.max(worldW * padding * 2, 100);
    const padH = Math.max(worldH * padding * 2, 100);

    const zoomX = w / (worldW + padW);
    const zoomY = h / (worldH + padH);
    this.state.zoom = this.#clampZoom(Math.min(zoomX, zoomY));

    this.state.x = (bounds.minX + bounds.maxX) / 2;
    this.state.y = (bounds.minY + bounds.maxY) / 2;
  }

  /** Convert world coordinates to screen coordinates. */
  worldToScreen(wx: number, wy: number): [number, number] {
    const { x, y, zoom, width, height } = this.state;
    return [
      (wx - x) * zoom + width / 2,
      (wy - y) * zoom + height / 2,
    ];
  }

  /** Convert screen coordinates to world coordinates. */
  screenToWorld(sx: number, sy: number): [number, number] {
    const { x, y, zoom, width, height } = this.state;
    return [
      (sx - width / 2) / zoom + x,
      (sy - height / 2) / zoom + y,
    ];
  }

  /** Update viewport dimensions. */
  resize(w: number, h: number): void {
    this.state.width = w;
    this.state.height = h;
  }

  /** Zoom in by a step. */
  zoomIn(cx: number, cy: number): void {
    this.zoomAt(1 + ZOOM_STEP, cx, cy);
  }

  /** Zoom out by a step. */
  zoomOut(cx: number, cy: number): void {
    this.zoomAt(1 / (1 + ZOOM_STEP), cx, cy);
  }

  /** Set a world-space point for the camera to drift toward. */
  setFollowTarget(target: { x: number; y: number } | undefined): void {
    this.state.followTarget = target;
  }

  /** Apply momentum and follow easing. Call each frame. */
  tickMomentum(dt: number): void {
    const s = this.state;

    // Follow target with easing
    if (s.followTarget) {
      s.vx += (s.followTarget.x - s.x) * 0.02 * dt * 60;
      s.vy += (s.followTarget.y - s.y) * 0.02 * dt * 60;
    }

    // Apply velocity with damping
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 0.92;
    s.vy *= 0.92;
  }

  #clampZoom(z: number): number {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  }
}

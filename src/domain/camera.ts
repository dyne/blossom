import type { CameraState } from './types';
import { GOURCE } from './gource-visual-config';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 0.1;
const CAMERA_SPEED = 3.0;

/** Camera model: destination-based easing like Gource ZoomCamera. */
export class Camera {
  state: CameraState = {
    x: 0, y: 0, zoom: 1, width: 800, height: 600,
    vx: 0, vy: 0, rotation: 0,
  };

  #destX = 0;
  #destY = 0;
  #destZoom = 1;
  #targetRotation = 0;
  #autoRotateEnabled = true;

  manualCamera = false;
  manualZoom = false;

  /** Set destination from world bounds. */
  adjust(bounds: { minX: number; minY: number; maxX: number; maxY: number }, adjustZoom = true): void {
    if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) return;

    const w = this.state.width;
    const h = this.state.height;
    if (w === 0 || h === 0) return;

    this.#destX = (bounds.minX + bounds.maxX) / 2;
    this.#destY = (bounds.minY + bounds.maxY) / 2;

    if (adjustZoom) {
      const worldW = bounds.maxX - bounds.minX;
      const worldH = bounds.maxY - bounds.minY;
      const zoomX = w / Math.max(1, worldW * GOURCE.cameraPadding);
      const zoomY = h / Math.max(1, worldH * GOURCE.cameraPadding);
      this.#destZoom = Math.min(zoomX, zoomY);
    }
  }

  /** Pan by screen-space delta (drag amount). Sets manual camera. */
  pan(dx: number, dy: number): void {
    this.state.x -= dx / this.state.zoom;
    this.state.y -= dy / this.state.zoom;
    this.#destX = this.state.x;
    this.#destY = this.state.y;
    this.manualCamera = true;
  }

  /** Zoom by factor centered at screen point (cx, cy). Sets manual zoom. */
  zoomAt(factor: number, cx: number, cy: number): void {
    const oldZoom = this.state.zoom;
    this.state.zoom = this.#clampZoom(this.state.zoom * factor);
    this.#destZoom = this.state.zoom;

    const ratio = 1 / oldZoom - 1 / this.state.zoom;
    this.state.x += (cx - this.state.width / 2) * ratio;
    this.state.y += (cy - this.state.height / 2) * ratio;
    this.#destX = this.state.x;
    this.#destY = this.state.y;
    this.manualZoom = true;
  }

  /** Fit the given world bounds into view with padding. Clears manual flags. */
  fitToView(bounds: { minX: number; minY: number; maxX: number; maxY: number }, padding = 0.1): void {
    const w = this.state.width;
    const h = this.state.height;
    if (w === 0 || h === 0) return;

    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;

    const pad = Math.max(1, 1 + padding * 2);
    const zoomX = w / Math.max(1, worldW * pad);
    const zoomY = h / Math.max(1, worldH * pad);
    this.state.zoom = this.#clampZoom(Math.min(zoomX, zoomY));
    this.#destZoom = this.state.zoom;

    this.state.x = (bounds.minX + bounds.maxX) / 2;
    this.state.y = (bounds.minY + bounds.maxY) / 2;
    this.#destX = this.state.x;
    this.#destY = this.state.y;

    this.manualCamera = false;
    this.manualZoom = false;
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

  /** Set a world-space point as the follow target for auto-camera. */
  setFollowTarget(target: { x: number; y: number } | undefined): void {
    if (target && !this.manualCamera) {
      this.#destX = target.x;
      this.#destY = target.y;
    }
  }

  /** Set target rotation angle for auto-rotation. */
  setTargetRotation(radians: number): void {
    if (!this.manualCamera && !this.manualZoom) {
      this.#targetRotation = radians;
      this.#autoRotateEnabled = true;
    }
  }

  /** Disable auto-rotation (called on manual interaction). */
  disableAutoRotation(): void {
    this.#autoRotateEnabled = false;
    this.#targetRotation = 0;
  }

  /** Apply destination-based easing toward dest. Call each frame. */
  tickMomentum(dt: number): void {
    const s = this.state;

    // Ease current toward destination (ZoomCamera-style)
    const cdx = this.#destX - s.x;
    const cdy = this.#destY - s.y;
    const cdz = this.#destZoom - s.zoom;

    const stepX = cdx * Math.min(1, dt * CAMERA_SPEED);
    const stepY = cdy * Math.min(1, dt * CAMERA_SPEED);
    const stepZ = cdz * Math.min(1, dt * CAMERA_SPEED);

    // Clamp steps to avoid overshoot
    if (Math.abs(stepX) > Math.abs(cdx)) s.x = this.#destX;
    else s.x += stepX;

    if (Math.abs(stepY) > Math.abs(cdy)) s.y = this.#destY;
    else s.y += stepY;

    if (Math.abs(stepZ) > Math.abs(cdz)) s.zoom = this.#destZoom;
    else s.zoom += stepZ;

    s.zoom = this.#clampZoom(s.zoom);

    // Ease rotation toward target
    if (this.#autoRotateEnabled && s.rotation !== undefined) {
      const rotDelta = this.#targetRotation - s.rotation;
      const rotStep = rotDelta * Math.min(1, dt * CAMERA_SPEED * 0.5);
      if (Math.abs(rotStep) > Math.abs(rotDelta)) {
        s.rotation = this.#targetRotation;
      } else {
        s.rotation += rotStep;
      }
    }

    // Damping for momentum
    s.vx *= 0.92;
    s.vy *= 0.92;
  }

  /** Compute bounds from directory/file positions with radii. */
  computeDirBounds(nodes: { x: number; y: number; radius: number }[]): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
    if (nodes.length === 0) return undefined;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }
    return { minX, minY, maxX, maxY };
  }

  /** Compute bounds from user positions. */
  computeUserBounds(users: { x: number; y: number }[]): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
    if (users.length === 0) return undefined;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const u of users) {
      minX = Math.min(minX, u.x);
      minY = Math.min(minY, u.y);
      maxX = Math.max(maxX, u.x);
      maxY = Math.max(maxY, u.y);
    }
    return { minX, minY, maxX, maxY };
  }

  #clampZoom(z: number): number {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  }
}

import type { CameraState } from '../domain/types';

/** Camera model: pan, zoom, fit-to-view. */
export class Camera {
  state: CameraState = { x: 0, y: 0, zoom: 1, width: 0, height: 0 };
  pan(dx: number, dy: number): void {}
  zoomAt(factor: number, cx: number, cy: number): void {}
  fitToView(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {}
  worldToScreen(wx: number, wy: number): [number, number] { return [wx, wy]; }
  screenToWorld(sx: number, sy: number): [number, number] { return [sx, sy]; }
  resize(w: number, h: number): void {}
}

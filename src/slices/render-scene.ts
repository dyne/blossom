import type { SceneRenderer } from '../domain/ports';
import { createPixiRenderer } from '../adapters/pixi-renderer';

export async function createSceneRenderer(canvas: HTMLCanvasElement): Promise<SceneRenderer> {
  return createPixiRenderer(canvas);
}

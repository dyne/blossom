import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { SceneRenderer } from '../domain/ports';
import type { SceneState } from '../domain/types';
import type { LayoutNode } from '../domain/layout';

interface DisplayCache {
  dirs: Map<string, Graphics>;
  files: Map<string, Graphics>;
  users: Map<string, Graphics>;
  beams: Map<string, Graphics>;
  labels: Map<string, Text>;
}

/** Create a PixiJS-based SceneRenderer with scene layers and object reuse. */
export async function createPixiRenderer(canvas: HTMLCanvasElement): Promise<SceneRenderer> {
  const app = new Application();

  await app.init({
    canvas,
    background: '#0d0d1a',
    resizeTo: canvas.parentElement ?? undefined,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  app.ticker.maxFPS = 60;

  // Scene layers
  const worldLayer = new Container();
  const bgLayer = new Container();
  const edgeLayer = new Container();
  const fileLayer = new Container();
  const beamLayer = new Container();
  const userLayer = new Container();
  const worldLabelLayer = new Container();

  worldLayer.addChild(bgLayer, edgeLayer, fileLayer, beamLayer, userLayer, worldLabelLayer);
  app.stage.addChild(worldLayer);

  // HUD layer (screen space)
  const hudLayer = new Container();
  app.stage.addChild(hudLayer);

  // Display object cache
  const cache: DisplayCache = {
    dirs: new Map(),
    files: new Map(),
    users: new Map(),
    beams: new Map(),
    labels: new Map(),
  };

  const labelStyle = new TextStyle({
    fontSize: 11,
    fill: '#cccccc',
    fontFamily: 'monospace',
  });

  function clearCache(map: Map<string, { destroy: () => void }>, parent: Container): void {
    for (const obj of map.values()) {
      obj.destroy();
    }
    map.clear();
    while (parent.children.length > 0) {
      parent.removeChildAt(0);
    }
  }

  let currentScene: SceneState | null = null;
  let layoutNodes: LayoutNode[] = [];

  const renderer: SceneRenderer = {
    render(scene: SceneState) {
      currentScene = scene;
      applyCamera(scene, worldLayer);
      drawDirs(scene, cache, edgeLayer, fileLayer);
      drawUsers(scene, cache, userLayer, beamLayer);
      updateHud(scene, hudLayer, labelStyle);
    },
    destroy() {
      clearCache(cache.dirs, edgeLayer);
      clearCache(cache.files, fileLayer);
      clearCache(cache.users, userLayer);
      clearCache(cache.beams, beamLayer);
      clearCache(cache.labels, worldLabelLayer);
      app.destroy(true);
    },
  };

  return renderer;
}

function applyCamera(scene: SceneState, worldLayer: Container): void {
  const { camera } = scene;
  worldLayer.x = -camera.x * camera.zoom + camera.width / 2;
  worldLayer.y = -camera.y * camera.zoom + camera.height / 2;
  worldLayer.scale.set(camera.zoom);
}

function drawDirs(
  scene: SceneState,
  cache: DisplayCache,
  edgeLayer: Container,
  fileLayer: Container,
): void {
  const seen = new Set<string>();

  function draw(dir: import('../domain/types').DirectoryNode): void {
    const id = `dir:${dir.path}`;
    seen.add(id);

    let g = cache.dirs.get(id);
    if (!g) {
      g = new Graphics();
      cache.dirs.set(id, g);
      edgeLayer.addChild(g);
    }

    g.clear();
    // Draw directory as a circle
    const radius = 30 + dir.files.length * 5;
    g.circle(0, 0, radius);
    g.fill({ color: 0x222244, alpha: 0.4 });
    g.circle(0, 0, radius);
    g.stroke({ color: 0x4444aa, width: 1, alpha: 0.6 });

    // Position from scene (default to hash-based position)
    g.x = 0;
    g.y = 0;

    // Draw files
    for (const file of dir.files) {
      const fid = `file:${file.path}`;
      seen.add(fid);

      let fg = cache.files.get(fid);
      if (!fg) {
        fg = new Graphics();
        cache.files.set(fid, fg);
        fileLayer.addChild(fg);
      }

      const color = file.color
        ? (Math.round(file.color.r * 255) << 16 | Math.round(file.color.g * 255) << 8 | Math.round(file.color.b * 255))
        : 0x44cc44;

      fg.clear();
      if (file.markedForRemoval) {
        fg.rect(-3, -3, 6, 6);
        fg.stroke({ color, width: 1, alpha: 0.3 });
      } else {
        fg.rect(-3, -3, 6, 6);
        fg.fill({ color, alpha: 0.9 });
      }
      fg.x = g.x;
      fg.y = g.y;
    }

    for (const sub of dir.dirs) {
      draw(sub);
    }
  }

  for (const dir of scene.dirs) {
    draw(dir);
  }

  // Remove unseen objects
  for (const [id, obj] of cache.dirs) {
    if (!seen.has(id)) {
      obj.destroy();
      cache.dirs.delete(id);
    }
  }
  for (const [id, obj] of cache.files) {
    if (!seen.has(id)) {
      obj.destroy();
      cache.files.delete(id);
    }
  }
}

function drawUsers(
  scene: SceneState,
  cache: DisplayCache,
  userLayer: Container,
  beamLayer: Container,
): void {
  const seen = new Set<string>();

  for (const user of scene.users) {
    const uid = `user:${user.name}`;
    seen.add(uid);

    let g = cache.users.get(uid);
    if (!g) {
      g = new Graphics();
      cache.users.set(uid, g);
      userLayer.addChild(g);
    }

    const color = Math.round(user.color.r * 255) << 16 |
      Math.round(user.color.g * 255) << 8 |
      Math.round(user.color.b * 255);

    g.clear();
    g.circle(0, 0, 6);
    g.fill({ color, alpha: 1 });
    g.x = user.x;
    g.y = user.y;

    // Action beams
    for (const action of user.actions) {
      if (!action.active) continue;
      const aid = `beam:${user.name}:${action.path}`;
      seen.add(aid);

      let bg = cache.beams.get(aid);
      if (!bg) {
        bg = new Graphics();
        cache.beams.set(aid, bg);
        beamLayer.addChild(bg);
      }

      bg.clear();
      const beamColor = action.kind === 'A' ? 0x44ff44 :
        action.kind === 'M' ? 0xffff44 : 0xff4444;
      bg.moveTo(user.x, user.y);
      bg.lineTo(user.x + 50, user.y); // simplified beam
      bg.stroke({ color: beamColor, width: 1, alpha: 0.5 });
    }
  }

  for (const [id, obj] of cache.users) {
    if (!seen.has(id)) {
      obj.destroy();
      cache.users.delete(id);
    }
  }
  for (const [id, obj] of cache.beams) {
    if (!seen.has(id)) {
      obj.destroy();
      cache.beams.delete(id);
    }
  }
}

function updateHud(
  scene: SceneState,
  hudLayer: Container,
  style: TextStyle,
): void {
  hudLayer.removeChildren();

  const status = scene.status;
  const lines = [
    `${status.connection} | ${status.paused ? 'PAUSED' : 'active'} | events: ${status.eventCount} | queue: ${status.queueSize}`,
  ];

  for (let i = 0; i < lines.length; i++) {
    const text = new Text({ text: lines[i]!, style });
    text.x = 8;
    text.y = 8 + i * 16;
    hudLayer.addChild(text);
  }
}

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { SceneRenderer } from '../domain/ports';
import type { SceneState } from '../domain/types';
import type { LayoutNode } from '../domain/layout';
import { pathHashPosition } from '../domain/layout';

interface DisplayCache {
  dirs: Map<string, Graphics>;
  files: Map<string, Graphics>;
  edges: Map<string, Graphics>;
  users: Map<string, Graphics>;
  beams: Map<string, Graphics>;
  userLabels: Map<string, Text>;
  fileLabels: Map<string, Text>;
  hudTexts: Text[];
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

  const worldLayer = new Container();
  const bgLayer = new Container();
  const edgeLayer = new Container();
  const fileLayer = new Container();
  const beamLayer = new Container();
  const userLayer = new Container();
  const worldLabelLayer = new Container();

  worldLayer.addChild(bgLayer, edgeLayer, fileLayer, beamLayer, userLayer, worldLabelLayer);
  app.stage.addChild(worldLayer);

  const hudLayer = new Container();
  app.stage.addChild(hudLayer);

  const labelStyle = new TextStyle({
    fontSize: 11,
    fill: '#cccccc',
    fontFamily: 'monospace',
  });

  const hudStyle = new TextStyle({
    fontSize: 10,
    fill: '#888888',
    fontFamily: 'monospace',
  });

  const cache: DisplayCache = {
    dirs: new Map(),
    files: new Map(),
    edges: new Map(),
    users: new Map(),
    beams: new Map(),
    userLabels: new Map(),
    fileLabels: new Map(),
    hudTexts: [],
  };

  let lastHudUpdate = 0;
  const hudThrottleMs = 500;

  setupVisibilityObserver(app);

  const renderer: SceneRenderer = {
    render(scene: SceneState) {
      applyCamera(scene, worldLayer);

      const layoutNodes = scene.layoutNodes;
      if (layoutNodes && layoutNodes.length > 0) {
        drawFromLayout(layoutNodes, cache, edgeLayer, fileLayer);
      } else {
        drawDirs(scene, cache, edgeLayer, fileLayer);
      }

      drawUsers(scene, cache, userLayer, beamLayer, worldLabelLayer, labelStyle);
      updateHud(scene, cache, hudLayer, hudStyle, lastHudUpdate, hudThrottleMs);
      lastHudUpdate = Date.now();
    },
    destroy() {
      clearAllCache(cache, edgeLayer, fileLayer, userLayer, beamLayer, worldLabelLayer, hudLayer);
      app.destroy(true);
    },
  };

  return renderer;
}

function setupVisibilityObserver(app: Application): void {
  if (typeof IntersectionObserver === 'undefined') return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          app.ticker.start();
        } else {
          app.ticker.stop();
        }
      }
    },
    { threshold: 0 },
  );
  observer.observe(app.canvas);
}

function clearAllCache(
  cache: DisplayCache,
  ...parents: Container[]
): void {
  for (const map of [cache.dirs, cache.files, cache.edges, cache.users, cache.beams, cache.userLabels, cache.fileLabels]) {
    for (const obj of map.values()) {
      obj.destroy();
    }
    map.clear();
  }
  for (const t of cache.hudTexts) {
    t.destroy();
  }
  cache.hudTexts = [];
  for (const p of parents) {
    p.removeChildren();
  }
}

function applyCamera(scene: SceneState, worldLayer: Container): void {
  const { camera } = scene;
  worldLayer.x = -camera.x * camera.zoom + camera.width / 2;
  worldLayer.y = -camera.y * camera.zoom + camera.height / 2;
  worldLayer.scale.set(camera.zoom);
}

function drawFromLayout(
  layoutNodes: LayoutNode[],
  cache: DisplayCache,
  edgeLayer: Container,
  fileLayer: Container,
): void {
  const seenDirs = new Set<string>();
  const seenFiles = new Set<string>();
  const seenEdges = new Set<string>();
  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));

  for (const node of layoutNodes) {
    if (node.kind === 'dir') {
      seenDirs.add(node.id);
      let g = cache.dirs.get(node.id);
      if (!g) {
        g = new Graphics();
        cache.dirs.set(node.id, g);
        edgeLayer.addChild(g);
      }
      g.clear();
      const r = node.radius;
      g.circle(0, 0, r);
      g.fill({ color: 0x222244, alpha: 0.3 });
      g.circle(0, 0, r);
      g.stroke({ color: 0x4444aa, width: 1, alpha: 0.5 });
      g.x = node.x;
      g.y = node.y;
    } else if (node.kind === 'file') {
      seenFiles.add(node.id);
      let fg = cache.files.get(node.id);
      if (!fg) {
        fg = new Graphics();
        cache.files.set(node.id, fg);
        fileLayer.addChild(fg);
      }
      const file = node.ref as import('../domain/types').FileNode | undefined;
      const color = file?.color
        ? (Math.round(file.color.r * 255) << 16 | Math.round(file.color.g * 255) << 8 | Math.round(file.color.b * 255))
        : 0x44cc44;
      fg.clear();
      const size = 4;
      if (file?.markedForRemoval) {
        fg.rect(-size, -size, size * 2, size * 2);
        fg.stroke({ color, width: 1, alpha: 0.2 });
      } else {
        fg.rect(-size, -size, size * 2, size * 2);
        fg.fill({ color, alpha: 0.85 });
      }
      fg.x = node.x;
      fg.y = node.y;

      // Draw edge from parent dir to file
      if (node.parent) {
        const parentNode = nodeMap.get(node.parent);
        if (parentNode) {
          const eid = `edge:${node.parent}->${node.id}`;
          seenEdges.add(eid);
          drawEdge(cache, edgeLayer, eid, parentNode.x, parentNode.y, node.x, node.y);
        }
      }
    }
  }

  // Draw directory parent-child edges
  for (const node of layoutNodes) {
    if (node.kind === 'dir' && node.parent) {
      const parentNode = nodeMap.get(node.parent);
      if (parentNode) {
        const eid = `edge:${node.parent}->${node.id}`;
        seenEdges.add(eid);
        drawEdge(cache, edgeLayer, eid, parentNode.x, parentNode.y, node.x, node.y);
      }
    }
  }

  // Cleanup unseen
  for (const [id, obj] of cache.dirs) {
    if (!seenDirs.has(id)) { obj.destroy(); cache.dirs.delete(id); }
  }
  for (const [id, obj] of cache.files) {
    if (!seenFiles.has(id)) { obj.destroy(); cache.files.delete(id); }
  }
  for (const [id, obj] of cache.edges) {
    if (!seenEdges.has(id)) { obj.destroy(); cache.edges.delete(id); }
  }
}

function drawDirs(
  scene: SceneState,
  cache: DisplayCache,
  edgeLayer: Container,
  fileLayer: Container,
): void {
  const seenDirs = new Set<string>();
  const seenFiles = new Set<string>();
  const seenEdges = new Set<string>();

  function draw(dir: import('../domain/types').DirectoryNode, px: number, py: number): void {
    const id = `dir:${dir.path}`;
    seenDirs.add(id);

    let g = cache.dirs.get(id);
    if (!g) {
      g = new Graphics();
      cache.dirs.set(id, g);
      edgeLayer.addChild(g);
    }

    g.clear();
    const radius = Math.min(200, Math.max(30, 40 + countAllFiles(dir) * 6));
    g.circle(0, 0, radius);
    g.fill({ color: 0x222244, alpha: 0.3 });
    g.circle(0, 0, radius);
    g.stroke({ color: 0x4444aa, width: 1, alpha: 0.5 });
    g.x = px;
    g.y = py;

    const fileCount = dir.files.length;
    for (let i = 0; i < dir.files.length; i++) {
      const file = dir.files[i]!;
      const fid = `file:${file.path}`;
      seenFiles.add(fid);

      const angle = (i / Math.max(fileCount, 1)) * Math.PI * 2 + Math.PI * 0.25;
      const fx = px + Math.cos(angle) * radius * 0.7;
      const fy = py + Math.sin(angle) * radius * 0.7;

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
      const size = 4;
      if (file.markedForRemoval) {
        fg.rect(-size, -size, size * 2, size * 2);
        fg.stroke({ color, width: 1, alpha: 0.2 });
      } else {
        fg.rect(-size, -size, size * 2, size * 2);
        fg.fill({ color, alpha: 0.85 });
      }
      fg.x = fx;
      fg.y = fy;
    }

    const subCount = dir.dirs.length;
    for (let i = 0; i < dir.dirs.length; i++) {
      const sub = dir.dirs[i]!;
      const angle = (i / Math.max(subCount, 1)) * Math.PI * 2;
      const sx = px + Math.cos(angle) * radius * 1.8;
      const sy = py + Math.sin(angle) * radius * 1.8;

      const eid = `edge:dir:${dir.path}->dir:${sub.path}`;
      seenEdges.add(eid);
      drawEdge(cache, edgeLayer, eid, px, py, sx, sy);
      draw(sub, sx, sy);
    }
  }

  const placed = new Map<string, { x: number; y: number }>();

  function placeDir(dir: import('../domain/types').DirectoryNode, parentPos?: { x: number; y: number }): { x: number; y: number } {
    const pos = pathHashPosition(dir.path);
    const x = parentPos ? parentPos.x + pos.x * 0.3 : pos.x;
    const y = parentPos ? parentPos.y + pos.y * 0.3 : pos.y;
    placed.set(dir.path, { x, y });
    for (const sub of dir.dirs) {
      placeDir(sub, { x, y });
    }
    return { x, y };
  }

  for (const dir of scene.dirs) {
    placeDir(dir);
  }

  for (const dir of scene.dirs) {
    const pos = placed.get(dir.path) ?? { x: 0, y: 0 };
    draw(dir, pos.x, pos.y);
  }

  for (const [id, obj] of cache.dirs) {
    if (!seenDirs.has(id)) { obj.destroy(); cache.dirs.delete(id); }
  }
  for (const [id, obj] of cache.files) {
    if (!seenFiles.has(id)) { obj.destroy(); cache.files.delete(id); }
  }
  for (const [id, obj] of cache.edges) {
    if (!seenEdges.has(id)) { obj.destroy(); cache.edges.delete(id); }
  }
}

function countAllFiles(dir: import('../domain/types').DirectoryNode): number {
  let count = dir.files.length;
  for (const sub of dir.dirs) count += countAllFiles(sub);
  return count;
}

function drawEdge(
  cache: DisplayCache,
  layer: Container,
  edgeId: string,
  x1: number, y1: number, x2: number, y2: number,
): void {
  let g = cache.edges.get(edgeId);
  if (!g) {
    g = new Graphics();
    cache.edges.set(edgeId, g);
    layer.addChild(g);
  }
  g.clear();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke({ color: 0x333366, width: 0.5, alpha: 0.4 });
}

function drawUsers(
  scene: SceneState,
  cache: DisplayCache,
  userLayer: Container,
  beamLayer: Container,
  worldLabelLayer: Container,
  labelStyle: TextStyle,
): void {
  const seenUsers = new Set<string>();
  const seenBeams = new Set<string>();
  const seenLabels = new Set<string>();

  for (const user of scene.users) {
    const uid = `user:${user.name}`;
    seenUsers.add(uid);

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
    g.circle(0, 0, 5);
    g.fill({ color, alpha: 1 });
    g.x = user.x;
    g.y = user.y;

    let label = cache.userLabels.get(uid);
    if (!label) {
      label = new Text({ text: user.name, style: labelStyle });
      cache.userLabels.set(uid, label);
      worldLabelLayer.addChild(label);
    }
    seenLabels.add(uid);
    label.text = user.name;
    label.x = user.x + 8;
    label.y = user.y - 6;

    for (const action of user.actions) {
      if (!action.active) continue;
      const aid = `beam:${user.name}:${action.path}`;
      seenBeams.add(aid);

      let bg = cache.beams.get(aid);
      if (!bg) {
        bg = new Graphics();
        cache.beams.set(aid, bg);
        beamLayer.addChild(bg);
      }

      bg.clear();
      const beamColor = action.kind === 'A' ? 0x44ff44 :
        action.kind === 'M' ? 0xffff44 : 0xff4444;
      const beamLen = 30 + Math.sin(action.progress * Math.PI) * 20;
      bg.moveTo(user.x, user.y);
      bg.lineTo(user.x + beamLen, user.y);
      bg.stroke({ color: beamColor, width: 1.5, alpha: 0.6 });
    }
  }

  for (const [id, obj] of cache.users) {
    if (!seenUsers.has(id)) { obj.destroy(); cache.users.delete(id); }
  }
  for (const [id, obj] of cache.beams) {
    if (!seenBeams.has(id)) { obj.destroy(); cache.beams.delete(id); }
  }
  for (const [id, obj] of cache.userLabels) {
    if (!seenLabels.has(id)) { obj.destroy(); cache.userLabels.delete(id); }
  }
}

function updateHud(
  scene: SceneState,
  cache: DisplayCache,
  hudLayer: Container,
  style: TextStyle,
  lastUpdate: number,
  throttleMs: number,
): void {
  const now = Date.now();
  if (throttleMs > 0 && (now - lastUpdate) < throttleMs) return;

  for (const t of cache.hudTexts) t.destroy();
  cache.hudTexts = [];

  const status = scene.status;
  const stateStr = status.paused ? 'PAUSED' : 'active';
  const line = `[${status.connection}] ${stateStr} | events: ${status.eventCount} | queue: ${status.queueSize}`;

  const text = new Text({ text: line, style });
  text.x = 8;
  text.y = 8;
  cache.hudTexts.push(text);
  hudLayer.addChild(text);
}

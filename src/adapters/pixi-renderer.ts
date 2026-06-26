import { Application, Container, Graphics, Text, TextStyle, BlurFilter } from 'pixi.js';
import type { SceneRenderer } from '../domain/ports';
import type { SceneState, FileNode } from '../domain/types';
import type { LayoutNode } from '../domain/layout';

interface DisplayCache {
  dirs: Map<string, Graphics>;
  files: Map<string, Graphics>;
  edges: Map<string, Graphics>;
  users: Map<string, Graphics>;
  beams: Map<string, Graphics>;
  glowObjects: Map<string, Graphics>;
  userLabels: Map<string, Text>;
  dirLabels: Map<string, Text>;
  hudTexts: Text[];
  fileCreateTimes: Map<string, number>;
}

const MAX_PARTICLES = 200;

function now(): number { return Date.now(); }

const DELETE_FADE_MS = 1000;
const FLASH_MS = 500;
const TRANSITION_MS = 250;

class ParticleSystem {
  particles: { g: Graphics; x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number }[] = [];
  #pool: Graphics[] = [];
  #layer: Container;

  constructor(layer: Container) {
    this.#layer = layer;
  }

  emit(x: number, y: number, color: number): void {
    if (this.particles.length >= MAX_PARTICLES) {
      const old = this.particles.shift();
      if (old) { old.g.clear(); this.#release(old.g); }
    }
    this.particles.push({
      g: this.#acquire(),
      x, y,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      life: Math.random() * 0.5 + 0.3,
      maxLife: Math.random() * 0.5 + 0.3,
      color,
    });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.g.clear();
        this.#release(p.g);
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      const alpha = (p.life / p.maxLife) * 0.6;
      p.g.clear();
      p.g.circle(p.x, p.y, 1.5);
      p.g.fill({ color: p.color, alpha });
    }
  }

  destroy(): void {
    for (const p of this.particles) p.g.destroy();
    this.particles.length = 0;
    for (const g of this.#pool) g.destroy();
    this.#pool.length = 0;
  }

  #acquire(): Graphics {
    const g = this.#pool.pop() ?? new Graphics();
    this.#layer.addChild(g);
    return g;
  }

  #release(g: Graphics): void {
    g.clear();
    this.#layer.removeChild(g);
    this.#pool.push(g);
  }
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

  const glowLayer = new Container();
  const blurFilter = new BlurFilter({ strength: 14, quality: 6 });
  glowLayer.filters = [blurFilter];
  glowLayer.blendMode = 'add';
  app.stage.addChild(glowLayer);

  const hudLayer = new Container();
  app.stage.addChild(hudLayer);

  const labelStyle = new TextStyle({ fontSize: 11, fill: '#cccccc', fontFamily: 'monospace' });
  const dirLabelStyle = new TextStyle({ fontSize: 10, fill: '#8888aa', fontFamily: 'monospace', align: 'center' });
  const hudStyle = new TextStyle({ fontSize: 10, fill: '#888888', fontFamily: 'monospace' });

  const cache: DisplayCache = {
    dirs: new Map(), files: new Map(), edges: new Map(),
    users: new Map(), beams: new Map(), glowObjects: new Map(),
    userLabels: new Map(), dirLabels: new Map(),
    hudTexts: [],
    fileCreateTimes: new Map(),
  };

  let lastHudUpdate = 0;
  const hudThrottleMs = 500;

  const particleSystem = new ParticleSystem(glowLayer);

  const stars: { x: number; y: number; r: number; a: number; phase: number }[] = [];
  const starGraphics = new Graphics();
  bgLayer.addChild(starGraphics);
  for (let i = 0; i < 120; i++) {
    stars.push({
      x: (Math.random() - 0.5) * 4000,
      y: (Math.random() - 0.5) * 4000,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * 0.3 + 0.05,
      phase: Math.random() * Math.PI * 2,
    });
  }

  setupVisibilityObserver(app);

  // FPS profiling
  let frames = 0;
  let fpsLast = now();
  let currentFps = 60;

  const renderer: SceneRenderer = {
    render(scene: SceneState) {
      applyCamera(scene, worldLayer, glowLayer);
      drawStarfield(stars, starGraphics);

      const layoutNodes = scene.layoutNodes ?? [];
      drawFromLayout(layoutNodes, cache, edgeLayer, fileLayer, worldLabelLayer, dirLabelStyle, particleSystem);
      drawGlow(layoutNodes, scene, cache, glowLayer, particleSystem);
      drawUsers(scene, cache, userLayer, beamLayer, worldLabelLayer, labelStyle, layoutNodes);
      updateHud(scene, cache, hudLayer, hudStyle, lastHudUpdate, hudThrottleMs, currentFps);
      lastHudUpdate = now();

      frames++;
      const elapsed = now() - fpsLast;
      if (elapsed >= 1000) {
        currentFps = Math.round(frames / (elapsed / 1000));
        frames = 0;
        fpsLast = now();
      }
    },
    destroy() {
      clearAllCache(cache, edgeLayer, fileLayer, userLayer, beamLayer, worldLabelLayer, hudLayer, glowLayer);
      particleSystem.destroy();
      app.destroy(true);
    },
  };

  return renderer;
}

function setupVisibilityObserver(app: Application): void {
  if (typeof IntersectionObserver === 'undefined') return;
  const observer = new IntersectionObserver(
    (entries) => { for (const e of entries) { if (e.isIntersecting) app.ticker.start(); else app.ticker.stop(); } },
    { threshold: 0 },
  );
  observer.observe(app.canvas);
}

function clearAllCache(cache: DisplayCache, ...parents: Container[]): void {
  for (const map of [cache.dirs, cache.files, cache.edges, cache.users, cache.beams, cache.glowObjects, cache.userLabels, cache.dirLabels]) {
    for (const obj of map.values()) obj.destroy();
    map.clear();
  }
  for (const t of cache.hudTexts) t.destroy();
  cache.hudTexts = [];
  cache.fileCreateTimes.clear();
  for (const p of parents) p.removeChildren();
}

function applyCamera(scene: SceneState, worldLayer: Container, glowLayer?: Container): void {
  const { camera } = scene;
  worldLayer.x = -camera.x * camera.zoom + camera.width / 2;
  worldLayer.y = -camera.y * camera.zoom + camera.height / 2;
  worldLayer.scale.set(camera.zoom);
  worldLayer.rotation = camera.rotation ?? 0;
  if (glowLayer) {
    glowLayer.x = worldLayer.x;
    glowLayer.y = worldLayer.y;
    glowLayer.scale.set(camera.zoom);
    glowLayer.rotation = camera.rotation ?? 0;
  }
}

function ensureCreationTime(cache: DisplayCache, id: string): number {
  let t = cache.fileCreateTimes.get(id);
  if (t === undefined) { t = now(); cache.fileCreateTimes.set(id, t); }
  return t;
}

function computeTransitions(id: string, cache: DisplayCache): { alpha: number; scale: number } {
  const ct = ensureCreationTime(cache, id);
  const elapsed = now() - ct;
  const t = Math.min(1, elapsed / TRANSITION_MS);
  const eased = 1 - (1 - t) * (1 - t);
  return { alpha: eased, scale: 0.5 + eased * 0.5 };
}

function drawStarfield(stars: { x: number; y: number; r: number; a: number; phase: number }[], g: Graphics): void {
  g.clear();
  const t = now() * 0.001;
  for (const s of stars) {
    const alpha = s.a * (0.5 + 0.5 * Math.sin(t * 0.5 + s.phase));
    g.circle(s.x, s.y, s.r);
    g.fill({ color: 0xffffff, alpha });
  }
}

function drawFromLayout(
  layoutNodes: LayoutNode[],
  cache: DisplayCache,
  edgeLayer: Container, fileLayer: Container,
  worldLabelLayer: Container, dirLabelStyle: TextStyle,
  particleSystem: ParticleSystem,
): void {
  const seenDirs = new Set<string>();
  const seenFiles = new Set<string>();
  const seenEdges = new Set<string>();
  const seenDirLabels = new Set<string>();
  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));
  const n = now();

  for (const node of layoutNodes) {
    if (node.kind === 'dir') {
      seenDirs.add(node.id);
      let g = cache.dirs.get(node.id);
      if (!g) { g = new Graphics(); cache.dirs.set(node.id, g); edgeLayer.addChild(g); }
      const trans = computeTransitions(node.id, cache);
      g.clear();
      const r = node.radius;
      g.circle(0, 0, r);
      g.fill({ color: 0x1a1a3a, alpha: 0.5 * trans.alpha });
      g.circle(0, 0, r);
      g.stroke({ color: 0x5555cc, width: 1.5, alpha: 0.6 * trans.alpha });
      g.circle(0, 0, r * 0.6);
      g.stroke({ color: 0x4444aa, width: 0.5, alpha: 0.3 * trans.alpha });
      g.x = node.x; g.y = node.y;
      g.scale.set(trans.scale);

      const dir = node.ref as { name: string } | undefined;
      if (dir && node.radius > 40) {
        const dlid = `dirlabel:${node.id}`;
        seenDirLabels.add(dlid);
        let dl = cache.dirLabels.get(dlid);
        if (!dl) { dl = new Text({ text: dir.name, style: dirLabelStyle }); cache.dirLabels.set(dlid, dl); worldLabelLayer.addChild(dl); }
        dl.x = node.x - dl.width / 2;
        dl.y = node.y - node.radius - 14;
        dl.alpha = trans.alpha * 0.7;
      }
    } else if (node.kind === 'file') {
      seenFiles.add(node.id);
      let fg = cache.files.get(node.id);
      if (!fg) { fg = new Graphics(); cache.files.set(node.id, fg); fileLayer.addChild(fg); }
      const file = node.ref as FileNode | undefined;
      fg.clear();

      let fileAlpha = 0.85;
      if (file?.deletedAt) fileAlpha = Math.max(0, 1 - (n - file.deletedAt) / DELETE_FADE_MS);

      let colorHex = file?.color !== undefined
        ? (Math.round(file.color.r * 255) << 16 | Math.round(file.color.g * 255) << 8 | Math.round(file.color.b * 255))
        : 0x44cc44;
      if (file?.flashUntil && n < file.flashUntil) {
        const bright = Math.round(0x44 + (0xff - 0x44) * ((file.flashUntil - n) / FLASH_MS));
        colorHex = bright << 16 | bright << 8 | bright;
      }

      const trans = computeTransitions(node.id, cache);
      const size = 3;
      if (file?.markedForRemoval) {
        fg.circle(0, 0, size);
        fg.stroke({ color: colorHex, width: 1.5, alpha: fileAlpha * 0.4 * trans.alpha });
        fg.circle(0, 0, size * 0.5);
        fg.stroke({ color: colorHex, width: 0.5, alpha: fileAlpha * 0.2 * trans.alpha });
      } else {
        fg.circle(0, 0, size);
        fg.fill({ color: colorHex, alpha: fileAlpha * trans.alpha });
        fg.circle(0, 0, size * 1.8);
        fg.stroke({ color: colorHex, width: 0.5, alpha: fileAlpha * 0.25 * trans.alpha });
      }
      fg.x = node.x; fg.y = node.y;
      fg.scale.set(trans.scale);

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

  for (const [id, obj] of cache.dirs) { if (!seenDirs.has(id)) { obj.destroy(); cache.dirs.delete(id); cache.fileCreateTimes.delete(id); } }
  for (const [id, obj] of cache.files) { if (!seenFiles.has(id)) { obj.destroy(); cache.files.delete(id); cache.fileCreateTimes.delete(id); } }
  for (const [id, obj] of cache.edges) { if (!seenEdges.has(id)) { obj.destroy(); cache.edges.delete(id); } }
  for (const [id, obj] of cache.dirLabels) { if (!seenDirLabels.has(id)) { obj.destroy(); cache.dirLabels.delete(id); } }
}

function drawGlow(
  layoutNodes: LayoutNode[], scene: SceneState,
  cache: DisplayCache, glowLayer: Container,
  particleSystem: ParticleSystem,
): void {
  const seen = new Set<string>();
  const n = now();
  const fileNodeMap = new Map(layoutNodes.filter((nd) => nd.kind === 'file').map((nd) => [nd.id, nd]));

  for (const node of layoutNodes) {
    if (node.kind !== 'file') continue;
    const file = node.ref as FileNode | undefined;
    if (!file?.flashUntil || n >= file.flashUntil) continue;

    const gid = `glow:file:${node.id}`;
    seen.add(gid);
    let gg = cache.glowObjects.get(gid);
    if (!gg) { gg = new Graphics(); cache.glowObjects.set(gid, gg); glowLayer.addChild(gg); }

    const color = file.color
      ? (Math.round(file.color.r * 255) << 16 | Math.round(file.color.g * 255) << 8 | Math.round(file.color.b * 255))
      : 0x44cc44;
    gg.clear();
    gg.circle(0, 0, 14);
    gg.fill({ color, alpha: 0.5 });
    gg.x = node.x; gg.y = node.y;
  }

  for (const user of scene.users) {
    for (const action of user.actions) {
      if (!action.active) continue;
      const gid = `glow:beam:${user.name}:${action.path}`;
      seen.add(gid);
      let gg = cache.glowObjects.get(gid);
      if (!gg) { gg = new Graphics(); cache.glowObjects.set(gid, gg); glowLayer.addChild(gg); }

      const targetFile = fileNodeMap.get(`file:${action.path}`);
      const beamColor = action.kind === 'A' ? 0x44ff44 : action.kind === 'M' ? 0xffff44 : 0xff4444;
      gg.clear();
      gg.moveTo(user.x, user.y);
      if (targetFile) {
        const dx = targetFile.x - user.x;
        const dy = targetFile.y - user.y;
        gg.lineTo(user.x + dx * action.progress, user.y + dy * action.progress);
      } else {
        gg.lineTo(user.x + 30, user.y);
      }
      gg.stroke({ color: beamColor, width: 4, alpha: 0.35 });
    }
  }

  for (const [id, obj] of cache.glowObjects) {
    if (!seen.has(id)) { obj.destroy(); cache.glowObjects.delete(id); }
  }

  // Emit particles along active beams
  for (const user of scene.users) {
    for (const action of user.actions) {
      if (!action.active) continue;
      if (Math.random() > 0.3) continue;
      const color = action.kind === 'A' ? 0x44ff44 : action.kind === 'M' ? 0xffff44 : 0xff4444;
      particleSystem.emit(user.x, user.y, color);
    }
  }
  particleSystem.update(1 / 60);
}

function drawEdge(
  cache: DisplayCache, layer: Container, edgeId: string,
  x1: number, y1: number, x2: number, y2: number,
): void {
  let g = cache.edges.get(edgeId);
  if (!g) { g = new Graphics(); cache.edges.set(edgeId, g); layer.addChild(g); }
  g.clear();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke({ color: 0x333366, width: 0.5, alpha: 0.4 });
}

function drawUsers(
  scene: SceneState, cache: DisplayCache,
  userLayer: Container, beamLayer: Container,
  worldLabelLayer: Container, labelStyle: TextStyle,
  layoutNodes: LayoutNode[],
): void {
  const seenUsers = new Set<string>();
  const seenBeams = new Set<string>();
  const seenLabels = new Set<string>();
  const fileNodeMap = new Map(layoutNodes.filter((n) => n.kind === 'file').map((n) => [n.id, n]));

  for (const user of scene.users) {
    const uid = `user:${user.name}`; seenUsers.add(uid);

    let g = cache.users.get(uid);
    if (!g) { g = new Graphics(); cache.users.set(uid, g); userLayer.addChild(g); }
    const ucolor = Math.round(user.color.r * 255) << 16 | Math.round(user.color.g * 255) << 8 | Math.round(user.color.b * 255);
    g.clear();
    g.circle(0, 0, 7);
    g.fill({ color: ucolor, alpha: 0.9 });
    g.circle(0, 0, 3);
    g.fill({ color: 0xffffff, alpha: 0.35 });
    g.x = user.x; g.y = user.y;

    let label = cache.userLabels.get(uid);
    if (!label) { label = new Text({ text: user.name, style: labelStyle }); cache.userLabels.set(uid, label); worldLabelLayer.addChild(label); }
    seenLabels.add(uid);
    label.text = user.name;
    label.x = user.x + 8; label.y = user.y - 6;

    for (const action of user.actions) {
      if (!action.active) continue;
      const aid = `beam:${user.name}:${action.path}`; seenBeams.add(aid);

      let bg = cache.beams.get(aid);
      if (!bg) { bg = new Graphics(); cache.beams.set(aid, bg); beamLayer.addChild(bg); }

      const targetFile = fileNodeMap.get(`file:${action.path}`);
      const beamColor = action.kind === 'A' ? 0x44ff44 : action.kind === 'M' ? 0xffff44 : 0xff4444;

      bg.clear();
      if (targetFile) {
        const dx = targetFile.x - user.x;
        const dy = targetFile.y - user.y;
        bg.moveTo(user.x, user.y);
        bg.lineTo(user.x + dx * action.progress, user.y + dy * action.progress);
      } else {
        const beamLen = 30 + Math.sin(action.progress * Math.PI) * 20;
        bg.moveTo(user.x, user.y);
        bg.lineTo(user.x + beamLen, user.y);
      }
      bg.stroke({ color: beamColor, width: 1.5, alpha: 0.6 });
    }
  }

  for (const [id, obj] of cache.users) { if (!seenUsers.has(id)) { obj.destroy(); cache.users.delete(id); } }
  for (const [id, obj] of cache.beams) { if (!seenBeams.has(id)) { obj.destroy(); cache.beams.delete(id); } }
  for (const [id, obj] of cache.userLabels) { if (!seenLabels.has(id)) { obj.destroy(); cache.userLabels.delete(id); } }
}

function updateHud(
  scene: SceneState, cache: DisplayCache, hudLayer: Container,
  style: TextStyle, lastUpdate: number, throttleMs: number,
  currentFps?: number,
): void {
  const n = now();
  if (throttleMs > 0 && (n - lastUpdate) < throttleMs) return;

  for (const t of cache.hudTexts) t.destroy();
  cache.hudTexts = [];

  const s = scene.status;
  let line = `[${s.connection}] ${s.paused ? 'PAUSED' : 'active'} | e:${s.eventCount} | q:${s.queueSize}`;
  if (currentFps !== undefined) line += ` | fps:${currentFps}`;

  const text = new Text({ text: line, style });
  text.x = 8; text.y = 8;
  cache.hudTexts.push(text);
  hudLayer.addChild(text);
}

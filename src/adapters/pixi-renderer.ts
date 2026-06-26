import { Application, Container, Graphics, Text, TextStyle, BlurFilter } from 'pixi.js';
import type { SceneRenderer } from '../domain/ports';
import type { SceneState, FileNode } from '../domain/types';
import type { LayoutNode } from '../domain/layout';
import { pathHashPosition } from '../domain/layout';

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

interface Particle {
  g: Graphics;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: number;
}

const MAX_PARTICLES = 200;
let _gRelease: ((g: Graphics) => void) | null = null;

function now(): number { return Date.now(); }

const DELETE_FADE_MS = 1000;
const FLASH_MS = 500;
const TRANSITION_MS = 250;

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

  // Glow layer with bloom effect
  const glowLayer = new Container();
  const blurFilter = new BlurFilter({ strength: 8, quality: 4 });
  glowLayer.filters = [blurFilter];
  glowLayer.blendMode = 'add';
  app.stage.addChild(glowLayer);

  const hudLayer = new Container();
  app.stage.addChild(hudLayer);

  const labelStyle = new TextStyle({
    fontSize: 11, fill: '#cccccc', fontFamily: 'monospace',
  });
  const dirLabelStyle = new TextStyle({
    fontSize: 10, fill: '#8888aa', fontFamily: 'monospace', align: 'center',
  });
  const hudStyle = new TextStyle({
    fontSize: 10, fill: '#888888', fontFamily: 'monospace',
  });

  const cache: DisplayCache = {
    dirs: new Map(), files: new Map(), edges: new Map(),
    users: new Map(), beams: new Map(), glowObjects: new Map(),
    userLabels: new Map(), dirLabels: new Map(),
    hudTexts: [],
    fileCreateTimes: new Map(),
  };

  let lastHudUpdate = 0;
  const hudThrottleMs = 500;

  // Particle pool
  const particles: Particle[] = [];
  const particlePool: Graphics[] = [];

  function getParticle(): Graphics {
    const g = particlePool.pop() ?? new Graphics();
    glowLayer.addChild(g);
    return g;
  }

  function releaseParticle(g: Graphics): void {
    g.clear();
    glowLayer.removeChild(g);
    particlePool.push(g);
  }
  _gRelease = releaseParticle;

  // Starfield
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

  const renderer: SceneRenderer = {
    render(scene: SceneState) {
      applyCamera(scene, worldLayer, glowLayer);

      drawStarfield(stars, starGraphics);

      const layoutNodes = scene.layoutNodes;
      if (layoutNodes && layoutNodes.length > 0) {
        drawFromLayout(layoutNodes, cache, edgeLayer, fileLayer, worldLabelLayer, dirLabelStyle);
        drawGlow(layoutNodes, scene, cache, glowLayer);
        emitParticles(layoutNodes, scene, particles, getParticle);
        updateParticles(particles, releaseParticle);
      } else {
        drawDirs(scene, cache, edgeLayer, fileLayer);
      }

      drawUsers(scene, cache, userLayer, beamLayer, worldLabelLayer, labelStyle, layoutNodes ?? []);
      updateHud(scene, cache, hudLayer, hudStyle, lastHudUpdate, hudThrottleMs);
      lastHudUpdate = now();
    },
    destroy() {
      clearAllCache(cache, edgeLayer, fileLayer, userLayer, beamLayer, worldLabelLayer, hudLayer, glowLayer);
      for (const p of particles) { p.g.destroy(); }
      particles.length = 0;
      for (const g of particlePool) { g.destroy(); }
      particlePool.length = 0;
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
        if (entry.isIntersecting) app.ticker.start();
        else app.ticker.stop();
      }
    },
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
  if (glowLayer) {
    glowLayer.x = worldLayer.x;
    glowLayer.y = worldLayer.y;
    glowLayer.scale.set(camera.zoom);
  }
}

function ensureCreationTime(cache: DisplayCache, id: string): number {
  let t = cache.fileCreateTimes.get(id);
  if (t === undefined) {
    t = now();
    cache.fileCreateTimes.set(id, t);
  }
  return t;
}

function computeTransitions(id: string, cache: DisplayCache): { alpha: number; scale: number } {
  const ct = ensureCreationTime(cache, id);
  const elapsed = now() - ct;
  const t = Math.min(1, elapsed / TRANSITION_MS);
  // ease-out
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

function drawGlow(
  layoutNodes: LayoutNode[], scene: SceneState,
  cache: DisplayCache, glowLayer: Container,
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
    gg.circle(0, 0, 8);
    gg.fill({ color, alpha: 0.4 });
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
      gg.stroke({ color: beamColor, width: 3, alpha: 0.25 });
    }
  }

  for (const [id, obj] of cache.glowObjects) {
    if (!seen.has(id)) { obj.destroy(); cache.glowObjects.delete(id); }
  }
}

function emitParticles(
  layoutNodes: LayoutNode[], scene: SceneState,
  particles: Particle[], getParticle: () => Graphics,
): void {
  const fileNodeMap = new Map(layoutNodes.filter((nd) => nd.kind === 'file').map((nd) => [nd.id, nd]));

  for (const user of scene.users) {
    for (const action of user.actions) {
      if (!action.active) continue;
      if (Math.random() > 0.3) continue;

      const targetFile = fileNodeMap.get(`file:${action.path}`);
      const color = action.kind === 'A' ? 0x44ff44 : action.kind === 'M' ? 0xffff44 : 0xff4444;
      const tx = targetFile ? user.x + (targetFile.x - user.x) * action.progress : user.x + 30;
      const ty = targetFile ? user.y + (targetFile.y - user.y) * action.progress : user.y;

      if (particles.length >= MAX_PARTICLES) {
        const old = particles.shift();
        if (old) { old.g.clear(); _gRelease?.(old.g); }
      }

      particles.push({
        g: getParticle(),
        x: user.x, y: user.y,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        life: Math.random() * 0.5 + 0.3,
        maxLife: Math.random() * 0.5 + 0.3,
        color,
      });
    }
  }
}

function updateParticles(particles: Particle[], release: (g: Graphics) => void): void {
  _gRelease = release;
  const dt = 1 / 60;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.life -= dt;
    if (p.life <= 0) {
      p.g.clear();
      release(p.g);
      particles.splice(i, 1);
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

function drawFromLayout(
  layoutNodes: LayoutNode[],
  cache: DisplayCache,
  edgeLayer: Container,
  fileLayer: Container,
  worldLabelLayer: Container,
  dirLabelStyle: TextStyle,
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
      if (!g) {
        g = new Graphics();
        cache.dirs.set(node.id, g);
        edgeLayer.addChild(g);
      }
      const t = ensureCreationTime(cache, node.id);
      const trans = computeTransitions(node.id, cache);
      g.clear();
      const r = node.radius;
      g.circle(0, 0, r);
      g.fill({ color: 0x222244, alpha: 0.3 * trans.alpha });
      g.circle(0, 0, r);
      g.stroke({ color: 0x4444aa, width: 1, alpha: 0.5 * trans.alpha });
      g.x = node.x;
      g.y = node.y;
      g.scale.set(trans.scale);

      // Directory label
      const dir = node.ref as { name: string } | undefined;
      if (dir && node.radius > 40) {
        const dlid = `dirlabel:${node.id}`;
        seenDirLabels.add(dlid);
        let dl = cache.dirLabels.get(dlid);
        if (!dl) {
          dl = new Text({ text: dir.name, style: dirLabelStyle });
          cache.dirLabels.set(dlid, dl);
          worldLabelLayer.addChild(dl);
        }
        dl.x = node.x - dl.width / 2;
        dl.y = node.y - node.radius - 14;
        dl.alpha = trans.alpha * 0.7;
      }
    } else if (node.kind === 'file') {
      seenFiles.add(node.id);
      let fg = cache.files.get(node.id);
      if (!fg) {
        fg = new Graphics();
        cache.files.set(node.id, fg);
        fileLayer.addChild(fg);
      }
      const file = node.ref as FileNode | undefined;
      fg.clear();

      // Compute alpha from delete fade
      let fileAlpha = 0.85;
      if (file?.deletedAt) {
        const fadeElapsed = n - file.deletedAt;
        fileAlpha = Math.max(0, 1 - fadeElapsed / DELETE_FADE_MS);
      }

      // Compute color with flash
      let colorHex = file?.color !== undefined
        ? (Math.round(file.color.r * 255) << 16 | Math.round(file.color.g * 255) << 8 | Math.round(file.color.b * 255))
        : 0x44cc44;
      if (file?.flashUntil && n < file.flashUntil) {
        // Brighten by blending toward white
        const bright = Math.round(0x44 + (0xff - 0x44) * ((file.flashUntil - n) / FLASH_MS));
        colorHex = Math.round(bright) << 16 | Math.round(bright) << 8 | Math.round(bright);
      }

      const trans = computeTransitions(node.id, cache);
      const size = 4;
      if (file?.markedForRemoval) {
        fg.rect(-size, -size, size * 2, size * 2);
        fg.stroke({ color: colorHex, width: 1, alpha: fileAlpha * 0.5 * trans.alpha });
      } else {
        fg.rect(-size, -size, size * 2, size * 2);
        fg.fill({ color: colorHex, alpha: fileAlpha * trans.alpha });
      }
      fg.x = node.x;
      fg.y = node.y;
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

function drawDirs(
  scene: SceneState,
  cache: DisplayCache,
  edgeLayer: Container,
  fileLayer: Container,
): void {
  const seenDirs = new Set<string>();
  const seenFiles = new Set<string>();
  const seenEdges = new Set<string>();
  const n = now();

  function draw(dir: import('../domain/types').DirectoryNode, px: number, py: number): void {
    const id = `dir:${dir.path}`;
    seenDirs.add(id);
    let g = cache.dirs.get(id);
    if (!g) { g = new Graphics(); cache.dirs.set(id, g); edgeLayer.addChild(g); }
    g.clear();
    const radius = Math.min(200, Math.max(30, 40 + countAllFiles(dir) * 6));
    g.circle(0, 0, radius);
    g.fill({ color: 0x222244, alpha: 0.3 });
    g.circle(0, 0, radius);
    g.stroke({ color: 0x4444aa, width: 1, alpha: 0.5 });
    g.x = px; g.y = py;

    for (let i = 0; i < dir.files.length; i++) {
      const file = dir.files[i]!;
      const fid = `file:${file.path}`;
      seenFiles.add(fid);
      const angle = (i / Math.max(dir.files.length, 1)) * Math.PI * 2 + Math.PI * 0.25;
      const fx = px + Math.cos(angle) * radius * 0.7;
      const fy = py + Math.sin(angle) * radius * 0.7;
      let fg = cache.files.get(fid);
      if (!fg) { fg = new Graphics(); cache.files.set(fid, fg); fileLayer.addChild(fg); }

      let fileAlpha = 0.85;
      if (file.deletedAt) fileAlpha = Math.max(0, 1 - (n - file.deletedAt) / DELETE_FADE_MS);

      let colorHex = file.color !== undefined
        ? (Math.round(file.color.r * 255) << 16 | Math.round(file.color.g * 255) << 8 | Math.round(file.color.b * 255))
        : 0x44cc44;
      if (file.flashUntil && n < file.flashUntil) {
        const bright = Math.round(0x44 + (0xff - 0x44) * ((file.flashUntil - n) / FLASH_MS));
        colorHex = bright << 16 | bright << 8 | bright;
      }

      fg.clear();
      const size = 4;
      if (file.markedForRemoval) {
        fg.rect(-size, -size, size * 2, size * 2);
        fg.stroke({ color: colorHex, width: 1, alpha: fileAlpha * 0.5 });
      } else {
        fg.rect(-size, -size, size * 2, size * 2);
        fg.fill({ color: colorHex, alpha: fileAlpha });
      }
      fg.x = fx; fg.y = fy;
    }

    for (let i = 0; i < dir.dirs.length; i++) {
      const sub = dir.dirs[i]!;
      const angle = (i / Math.max(dir.dirs.length, 1)) * Math.PI * 2;
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
    for (const sub of dir.dirs) placeDir(sub, { x, y });
    return { x, y };
  }
  for (const dir of scene.dirs) placeDir(dir);
  for (const dir of scene.dirs) {
    const pos = placed.get(dir.path) ?? { x: 0, y: 0 };
    draw(dir, pos.x, pos.y);
  }

  for (const [id, obj] of cache.dirs) { if (!seenDirs.has(id)) { obj.destroy(); cache.dirs.delete(id); } }
  for (const [id, obj] of cache.files) { if (!seenFiles.has(id)) { obj.destroy(); cache.files.delete(id); } }
  for (const [id, obj] of cache.edges) { if (!seenEdges.has(id)) { obj.destroy(); cache.edges.delete(id); } }
}

function countAllFiles(dir: import('../domain/types').DirectoryNode): number {
  let count = dir.files.length;
  for (const sub of dir.dirs) count += countAllFiles(sub);
  return count;
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
  scene: SceneState,
  cache: DisplayCache,
  userLayer: Container,
  beamLayer: Container,
  worldLabelLayer: Container,
  labelStyle: TextStyle,
  layoutNodes: LayoutNode[],
): void {
  const seenUsers = new Set<string>();
  const seenBeams = new Set<string>();
  const seenLabels = new Set<string>();
  const fileNodeMap = new Map(layoutNodes.filter((n) => n.kind === 'file').map((n) => [n.id, n]));

  for (const user of scene.users) {
    const uid = `user:${user.name}`;
    seenUsers.add(uid);

    let g = cache.users.get(uid);
    if (!g) { g = new Graphics(); cache.users.set(uid, g); userLayer.addChild(g); }
    const ucolor = Math.round(user.color.r * 255) << 16 | Math.round(user.color.g * 255) << 8 | Math.round(user.color.b * 255);
    g.clear();
    g.circle(0, 0, 5);
    g.fill({ color: ucolor, alpha: 1 });
    g.x = user.x;
    g.y = user.y;

    let label = cache.userLabels.get(uid);
    if (!label) { label = new Text({ text: user.name, style: labelStyle }); cache.userLabels.set(uid, label); worldLabelLayer.addChild(label); }
    seenLabels.add(uid);
    label.text = user.name;
    label.x = user.x + 8;
    label.y = user.y - 6;

    for (const action of user.actions) {
      if (!action.active) continue;
      const aid = `beam:${user.name}:${action.path}`;
      seenBeams.add(aid);

      let bg = cache.beams.get(aid);
      if (!bg) { bg = new Graphics(); cache.beams.set(aid, bg); beamLayer.addChild(bg); }

      // Find target file position
      const targetFile = fileNodeMap.get(`file:${action.path}`);
      const beamColor = action.kind === 'A' ? 0x44ff44 : action.kind === 'M' ? 0xffff44 : 0xff4444;

      bg.clear();
      if (targetFile) {
        // Beam from user toward target file, length scaled by progress
        const dx = targetFile.x - user.x;
        const dy = targetFile.y - user.y;
        const tx = user.x + dx * action.progress;
        const ty = user.y + dy * action.progress;
        bg.moveTo(user.x, user.y);
        bg.lineTo(tx, ty);
      } else {
        // Fallback: beam grows horizontally
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
): void {
  const n = now();
  if (throttleMs > 0 && (n - lastUpdate) < throttleMs) return;

  for (const t of cache.hudTexts) t.destroy();
  cache.hudTexts = [];

  const s = scene.status;
  const line = `[${s.connection}] ${s.paused ? 'PAUSED' : 'active'} | e:${s.eventCount} | q:${s.queueSize}`;

  const text = new Text({ text: line, style });
  text.x = 8; text.y = 8;
  cache.hudTexts.push(text);
  hudLayer.addChild(text);
}

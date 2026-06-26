import { Application, Container, Graphics, Text, TextStyle, BlurFilter } from 'pixi.js';
import type { SceneRenderer } from '../domain/ports';
import type { SceneState, FileNode } from '../domain/types';
import type { LayoutNode } from '../domain/layout';
import { GOURCE } from '../domain/gource-visual-config';

interface DisplayCache {
  dirs: Map<string, Graphics>;
  files: Map<string, Graphics>;
  branches: Map<string, Graphics>;
  users: Map<string, Graphics>;
  beams: Map<string, Graphics>;
  glowObjects: Map<string, Graphics>;
  userLabels: Map<string, Text>;
  dirLabels: Map<string, Text>;
  hudTexts: Text[];
  fileCreateTimes: Map<string, number>;
}

const DELETE_FADE_MS = 1000;
const FLASH_MS = 500;
const TRANSITION_MS = 250;

function now(): number { return Date.now(); }

/** Create a PixiJS-based SceneRenderer with scene layers and object reuse. */
export async function createPixiRenderer(canvas: HTMLCanvasElement): Promise<SceneRenderer> {
  const app = new Application();

  await app.init({
    canvas,
    background: GOURCE.backgroundColor,
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
    dirs: new Map(), files: new Map(), branches: new Map(),
    users: new Map(), beams: new Map(), glowObjects: new Map(),
    userLabels: new Map(), dirLabels: new Map(),
    hudTexts: [],
    fileCreateTimes: new Map(),
  };

  let lastHudUpdate = 0;
  const hudThrottleMs = 500;

  setupVisibilityObserver(app);

  // FPS profiling
  let frames = 0;
  let fpsLast = now();
  let currentFps = 60;

  const renderer: SceneRenderer = {
    render(scene: SceneState) {
      applyCamera(scene, worldLayer, glowLayer);

      const layoutNodes = scene.layoutNodes ?? [];
      drawFromLayout(layoutNodes, cache, edgeLayer, fileLayer, worldLabelLayer, dirLabelStyle);
      drawGlow(layoutNodes, scene, cache, glowLayer);
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
  for (const map of [cache.dirs, cache.files, cache.branches, cache.users, cache.beams, cache.glowObjects, cache.userLabels, cache.dirLabels]) {
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
  // removed – Gource uses plain dark background
}

function drawFromLayout(
  layoutNodes: LayoutNode[],
  cache: DisplayCache,
  edgeLayer: Container, fileLayer: Container,
  worldLabelLayer: Container, dirLabelStyle: TextStyle,
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
      const fd = GOURCE.fileDiameter;
      const so = GOURCE.shadowOffset;

      if (file?.markedForRemoval) {
        // Outline only for removed files
        fg.rect(-fd * 0.25, -fd * 0.33, fd * 0.5, fd * 0.66);
        fg.stroke({ color: colorHex, width: 1.5, alpha: fileAlpha * 0.4 * trans.alpha });
      } else {
        // Shadow
        fg.rect(-fd * 0.25 + so, -fd * 0.33 + so, fd * 0.5, fd * 0.66);
        fg.fill({ color: 0x000000, alpha: 0.3 * trans.alpha });
        // Document body
        fg.rect(-fd * 0.25, -fd * 0.33, fd * 0.5, fd * 0.66);
        fg.fill({ color: colorHex, alpha: fileAlpha * trans.alpha });
        // Folded corner
        fg.moveTo(fd * 0.15, -fd * 0.33);
        fg.lineTo(fd * 0.25, -fd * 0.23);
        fg.lineTo(fd * 0.25, -fd * 0.33);
        fg.fill({ color: 0x000000, alpha: 0.15 * trans.alpha });
      }
      fg.x = node.x; fg.y = node.y;
      fg.scale.set(trans.scale);

      if (node.parent) {
        const parentNode = nodeMap.get(node.parent);
        if (parentNode) {
          const eid = `edge:${node.parent}->${node.id}`;
          seenEdges.add(eid);
          drawBranchSpline(cache, edgeLayer, eid, node.x, node.y, parentNode.x, parentNode.y);
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
        drawBranchSpline(cache, edgeLayer, eid, node.x, node.y, parentNode.x, parentNode.y, node.splinePoint);
      }
    }
  }

  for (const [id, obj] of cache.dirs) { if (!seenDirs.has(id)) { obj.destroy(); cache.dirs.delete(id); cache.fileCreateTimes.delete(id); } }
  for (const [id, obj] of cache.files) { if (!seenFiles.has(id)) { obj.destroy(); cache.files.delete(id); cache.fileCreateTimes.delete(id); } }
  for (const [id, obj] of cache.branches) { if (!seenEdges.has(id)) { obj.destroy(); cache.branches.delete(id); } }
  for (const [id, obj] of cache.dirLabels) { if (!seenDirLabels.has(id)) { obj.destroy(); cache.dirLabels.delete(id); } }
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
}

function drawBranchSpline(
  cache: DisplayCache, layer: Container,
  branchId: string,
  childX: number, childY: number,
  parentX: number, parentY: number,
  splinePoint?: { x: number; y: number },
): void {
  let g = cache.branches.get(branchId);
  if (!g) { g = new Graphics(); cache.branches.set(branchId, g); layer.addChild(g); }

  g.clear();

  // Control point for quadratic Bezier
  const cpx = splinePoint ? splinePoint.x : childX + (parentX - childX) * 0.3;
  const cpy = splinePoint ? splinePoint.y : childY + (parentY - childY) * 0.3;

  // Sample segments along the curve
  const segments = 10;
  const pts: { x: number; y: number }[] = [];
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const u = 1 - t;
    pts.push({
      x: u * u * childX + 2 * u * t * cpx + t * t * parentX,
      y: u * u * childY + 2 * u * t * cpy + t * t * parentY,
    });
  }

  const so = GOURCE.shadowOffset;
  const bw = GOURCE.branchWidth;

  // Shadow strip
  const shadowColor = 0x000000;
  for (let s = 1; s < pts.length; s++) {
    const from = pts[s - 1]!;
    const to = pts[s]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const perpLen = Math.hypot(dx, dy) || 1;
    const nx = -dy / perpLen;
    const ny = dx / perpLen;

    const alpha = 1 - (s / segments) * 0.7;

    g.moveTo(from.x + nx * bw * 0.5 + so, from.y + ny * bw * 0.5 + so);
    g.lineTo(from.x - nx * bw * 0.5 + so, from.y - ny * bw * 0.5 + so);
    g.lineTo(to.x - nx * bw * 0.5 + so, to.y - ny * bw * 0.5 + so);
    g.lineTo(to.x + nx * bw * 0.5 + so, to.y + ny * bw * 0.5 + so);
    g.fill({ color: shadowColor, alpha: alpha * 0.3 });
  }

  // Main branch strip with fading alpha
  for (let s = 1; s < pts.length; s++) {
    const from = pts[s - 1]!;
    const to = pts[s]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const perpLen = Math.hypot(dx, dy) || 1;
    const nx = -dy / perpLen;
    const ny = dx / perpLen;

    const alpha = 1 - (s / segments) * 0.7;

    g.moveTo(from.x + nx * bw * 0.5, from.y + ny * bw * 0.5);
    g.lineTo(from.x - nx * bw * 0.5, from.y - ny * bw * 0.5);
    g.lineTo(to.x - nx * bw * 0.5, to.y - ny * bw * 0.5);
    g.lineTo(to.x + nx * bw * 0.5, to.y + ny * bw * 0.5);
    g.fill({ color: 0x334466, alpha: alpha * 0.7 });
  }
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

    // User idle fade
    const idleSeconds = user.lastAction ? (now() / 1000 - user.lastAction) : 0;
    const idleFade = idleSeconds > GOURCE.userIdleTime
      ? Math.max(0, 1 - (idleSeconds - GOURCE.userIdleTime) / GOURCE.fadeDuration)
      : 1;

    const us = GOURCE.userSize;
    const so = GOURCE.shadowOffset;
    g.clear();
    // Shadow
    g.circle(so, so, us * 0.5);
    g.fill({ color: 0x000000, alpha: 0.3 * idleFade });
    // Body
    g.circle(0, 0, us * 0.5);
    g.fill({ color: ucolor, alpha: 0.9 * idleFade });
    // Highlight
    g.circle(-us * 0.15, -us * 0.15, us * 0.25);
    g.fill({ color: 0xffffff, alpha: 0.4 * idleFade });
    g.x = user.x; g.y = user.y;

    let label = cache.userLabels.get(uid);
    if (!label) { label = new Text({ text: user.name, style: labelStyle }); cache.userLabels.set(uid, label); worldLabelLayer.addChild(label); }
    seenLabels.add(uid);
    label.text = user.name;
    label.x = user.x + 8; label.y = user.y - 6;
    label.alpha = idleFade;

    for (const action of user.actions) {
      if (!action.active) continue;
      const aid = `beam:${user.name}:${action.path}`; seenBeams.add(aid);

      let bg = cache.beams.get(aid);
      if (!bg) { bg = new Graphics(); cache.beams.set(aid, bg); beamLayer.addChild(bg); }

      const targetFile = fileNodeMap.get(`file:${action.path}`);
      const beamColor = action.kind === 'A' ? 0x44ff44 : action.kind === 'M' ? 0xffaa00 : 0xff4444;

      bg.clear();
      if (targetFile) {
        const dx = targetFile.x - user.x;
        const dy = targetFile.y - user.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = -dy / dist;
        const ny = dx / dist;

        const endX = user.x + dx * action.progress;
        const endY = user.y + dy * action.progress;

        // Tapered quad: wide at file end, dim at user end
        const sourceWidth = GOURCE.fileDiameter * 0.3;
        const targetWidth = GOURCE.fileDiameter;

        const srcAlpha = 0.1;
        const destAlpha = (1 - action.progress) * 0.8;

        bg.moveTo(user.x + nx * sourceWidth, user.y + ny * sourceWidth);
        bg.lineTo(user.x - nx * sourceWidth, user.y - ny * sourceWidth);
        bg.lineTo(endX - nx * targetWidth, endY - ny * targetWidth);
        bg.lineTo(endX + nx * targetWidth, endY + ny * targetWidth);
        bg.fill({ color: beamColor, alpha: destAlpha });

        // Source end glow
        bg.moveTo(user.x + nx * sourceWidth, user.y + ny * sourceWidth);
        bg.lineTo(user.x - nx * sourceWidth, user.y - ny * sourceWidth);
        bg.lineTo(user.x - nx * sourceWidth * 0.5, user.y - ny * sourceWidth * 0.5);
        bg.lineTo(user.x + nx * sourceWidth * 0.5, user.y + ny * sourceWidth * 0.5);
        bg.fill({ color: beamColor, alpha: srcAlpha });
      } else {
        // Fallback horizontal beam
        const beamLen = 30 + Math.sin(action.progress * Math.PI) * 20;
        bg.moveTo(user.x, user.y - 1);
        bg.lineTo(user.x, user.y + 1);
        bg.lineTo(user.x + beamLen, user.y + 3);
        bg.lineTo(user.x + beamLen, user.y - 3);
        bg.fill({ color: beamColor, alpha: 0.6 });
      }
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

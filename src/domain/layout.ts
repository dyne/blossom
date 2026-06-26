import type { DirectoryNode, FileNode, User } from './types';
import { GOURCE } from './gource-visual-config';

/** 2D vector. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Positioned entity in the layout. */
export interface LayoutNode {
  id: string;
  kind: 'dir' | 'file' | 'user';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  parent?: string;
  ref?: DirectoryNode | FileNode | User;

  // Directory-specific fields
  parentRadius?: number;
  area?: number;
  visibleFileCount?: number;
  splinePoint?: Vec2;
  positionInitialized?: boolean;
  changeTimer?: number;

  // File-specific fields
  directoryId?: string;
  localX?: number;
  localY?: number;
  destX?: number;
  destY?: number;
  distance?: number;
  size?: number;

  // User-specific fields
  accelX?: number;
  accelY?: number;
  lastAction?: number;
}

/** Physics configuration. */
export interface PhysicsConfig {
  dt: number; // fixed timestep, typically 1/60
  parentAttraction: number;
  siblingRepulsion: number;
  userRepulsion: number;
  userAttraction: number;
  damping: number;
  minRadius: number;
  maxRadius: number;
  radiusPerFile: number;
  dirRadius: number;
}

const DEFAULT_CONFIG: PhysicsConfig = {
  dt: 1 / 60,
  parentAttraction: 0.01,
  siblingRepulsion: 500,
  userRepulsion: 200,
  userAttraction: 0.5,
  damping: 0.90,
  minRadius: 30,
  maxRadius: 200,
  radiusPerFile: 8,
  dirRadius: 60,
};

/** Deterministic hash of a string to a 2D position in [-range, range]. */
export function pathHashPosition(path: string, range = 200): Vec2 {
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    h1 = ((h1 << 5) - h1 + c) | 0;
    h2 = ((h2 << 7) - h2 + c * 3) | 0;
  }
  return {
    x: ((Math.abs(h1) % (range * 2)) - range) / range * range,
    y: ((Math.abs(h2) % (range * 2)) - range) / range * range,
  };
}

/** Compute the area of a directory using Gource area model. */
function computeDirArea(dir: DirectoryNode): number {
  const fileArea = GOURCE.fileRadius * GOURCE.fileRadius * Math.PI;
  const directVisibleFiles = dir.files.filter((f) => !f.markedForRemoval).length;
  const directFileArea = fileArea * directVisibleFiles;
  const childArea = dir.dirs.reduce((sum, child) => sum + computeDirArea(child), 0);
  return directFileArea + childArea;
}

/** Gource area-based directory radius. */
function computeDirRadius(dir: DirectoryNode, area: number): number {
  const directVisibleFiles = dir.files.filter((f) => !f.markedForRemoval).length;
  const fileArea = GOURCE.fileRadius * GOURCE.fileRadius * Math.PI;
  const directFileArea = fileArea * directVisibleFiles;
  const parentRadius = Math.max(GOURCE.minDirRadius, Math.sqrt(directFileArea) * GOURCE.dirPadding);
  const radius = Math.max(GOURCE.minDirRadius, Math.sqrt(area) * GOURCE.dirPadding);
  // Return both; store parentRadius for later use
  return { radius, parentRadius };
}

/** Build layout nodes from the repository graph and users. */
export function buildLayout(
  dirs: DirectoryNode[],
  users: User[],
  config: PhysicsConfig = DEFAULT_CONFIG,
): LayoutNode[] {
  const nodes: LayoutNode[] = [];

  for (const dir of dirs) {
    addDirNode(dir, null, nodes, config);
  }

  for (const user of users) {
    nodes.push({
      id: `user:${user.name}`,
      kind: 'user',
      x: user.x,
      y: user.y,
      vx: 0,
      vy: 0,
      radius: 10,
      ref: user,
    });
  }

  return nodes;
}

function addDirNode(
  dir: DirectoryNode,
  parent: LayoutNode | null,
  nodes: LayoutNode[],
  config: PhysicsConfig,
): void {
  const pos = pathHashPosition(dir.path);
  const area = computeDirArea(dir);
  const { radius, parentRadius } = computeDirRadius(dir, area);
  const directVisibleFiles = dir.files.filter((f) => !f.markedForRemoval).length;

  const nodeX = parent ? parent.x + pos.x * 0.1 : pos.x;
  const nodeY = parent ? parent.y + pos.y * 0.1 : pos.y;

  const node: LayoutNode = {
    id: `dir:${dir.path}`,
    kind: 'dir',
    x: nodeX,
    y: nodeY,
    vx: 0,
    vy: 0,
    radius,
    parent: parent?.id,
    ref: dir,
    parentRadius,
    area,
    visibleFileCount: directVisibleFiles,
    positionInitialized: true,
    changeTimer: Date.now(),
    splinePoint: parent
      ? { x: nodeX + (nodeX - parent.x) * 0.5, y: nodeY + (nodeY - parent.y) * 0.5 }
      : undefined,
  };
  nodes.push(node);

  // Gource file ring placement
  const visibleFiles = dir.files.filter((f) => !f.markedForRemoval);
  let maxFiles = 1;
  let diameter = 1;
  let fileNo = 0;
  let distance = 0;
  let remaining = visibleFiles.length;

  for (const file of visibleFiles) {
    const arc = 1 / maxFiles;
    const frac = arc * 0.5 + arc * fileNo;
    const destX = Math.sin(frac * Math.PI * 2);
    const destY = Math.cos(frac * Math.PI * 2);

    nodes.push({
      id: `file:${file.path}`,
      kind: 'file',
      x: node.x,
      y: node.y,
      vx: 0,
      vy: 0,
      radius: GOURCE.fileRadius,
      size: GOURCE.fileDiameter,
      parent: node.id,
      ref: file,
      directoryId: node.id,
      localX: 0,
      localY: 0,
      destX,
      destY,
      distance,
    });

    fileNo++;
    remaining--;

    if (fileNo >= maxFiles && remaining > 0) {
      diameter++;
      distance += GOURCE.fileDiameter;
      maxFiles = Math.max(1, Math.floor(diameter * Math.PI));
      maxFiles = Math.min(maxFiles, remaining);
      fileNo = 0;
    }
  }

  for (const subDir of dir.dirs) {
    addDirNode(subDir, node, nodes, config);
  }
}

/** Gource-style directory forces: parent gravity, separation, overlap repulsion, grandparent bias, sibling spacing. */
function applyDirForces(
  nodes: LayoutNode[],
  fx: Float64Array,
  fy: Float64Array,
): void {
  const nodeMap = new Map(nodes.map((nd) => [nd.id, nd]));
  // Map dir node id to global index
  const dirIndexMap = new Map<string, number>();
  const dirs: LayoutNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i]!.kind === 'dir') {
      dirIndexMap.set(nodes[i]!.id, i);
      dirs.push(nodes[i]!);
    }
  }
  const n = dirs.length;

  for (let i = 0; i < n; i++) {
    const a = dirs[i]!;
    const globalI = dirIndexMap.get(a.id)!;
    const parent = a.parent ? nodeMap.get(a.parent) : undefined;
    const grandparent = parent?.parent ? nodeMap.get(parent.parent) : undefined;

    // Initialize position if not yet set
    if (!a.positionInitialized && parent) {
      a.positionInitialized = true;
      const gpDir = grandparent
        ? { x: parent.x - grandparent.x, y: parent.y - grandparent.y }
        : { x: 1, y: 0 };
      const len = Math.hypot(gpDir.x, gpDir.y) || 1;
      a.x = parent.x + (gpDir.x / len) * 2;
      a.y = parent.y + (gpDir.y / len) * 2;
    }

    // Parent gravity: attract toward parent
    if (parent) {
      const dx = parent.x - a.x;
      const dy = parent.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        const force = GOURCE.forceGravity * dist;
        fx[globalI] += force * (dx / dist);
        fy[globalI] += force * (dy / dist);
      }

      // Parent separation: push child outside parent radius
      if (dist < parent.radius + (a.parentRadius ?? 0) && dist > 0.001) {
        const pushForce = (parent.radius + (a.parentRadius ?? 0) - dist) * 10;
        fx[globalI] -= pushForce * (dx / dist);
        fy[globalI] -= pushForce * (dy / dist);
      }
    }

    // Grandparent bias: push outward along grandparent->parent direction
    if (grandparent && parent) {
      const dx = parent.x - grandparent.x;
      const dy = parent.y - grandparent.y;
      const len = Math.hypot(dx, dy) || 1;
      fx[globalI] += (dx / len) * GOURCE.forceGravity * 0.5;
      fy[globalI] += (dy / len) * GOURCE.forceGravity * 0.5;
    }
  }

  // Overlap repulsion
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = dirs[i]!;
      const b = dirs[j]!;
      const gi = dirIndexMap.get(a.id)!;
      const gj = dirIndexMap.get(b.id)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) continue;

      const minDist = a.radius + b.radius;
      if (dist < minDist) {
        const force = (minDist - dist) * 5 / dist;
        fx[gi] -= force * dx;
        fy[gi] -= force * dy;
        fx[gj] += force * dx;
        fy[gj] += force * dy;
      }
    }
  }

  // Sibling spacing
  const siblingsByParent = new Map<string, LayoutNode[]>();
  for (const d of dirs) {
    const pid = d.parent ?? '';
    let list = siblingsByParent.get(pid);
    if (!list) { list = []; siblingsByParent.set(pid, list); }
    list.push(d);
  }
  for (const [, siblings] of siblingsByParent) {
    if (siblings.length < 2) continue;
    const parent = siblings[0]?.parent ? nodeMap.get(siblings[0].parent) : undefined;
    const scale = parent ? (parent.radius * Math.PI) / (siblings.length + 1) : 50;
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i]!;
        const b = siblings[j]!;
        const gi = dirIndexMap.get(a.id)!;
        const gj = dirIndexMap.get(b.id)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.001) continue;
        const force = scale / dist;
        fx[gi] -= force * (dx / dist);
        fy[gi] -= force * (dy / dist);
        fx[gj] += force * (dx / dist);
        fy[gj] += force * (dy / dist);
      }
    }
  }
}

/** Step the physics simulation forward by the fixed dt. */
export function tickPhysics(
  nodes: LayoutNode[],
  config: PhysicsConfig = DEFAULT_CONFIG,
  userTargets?: Map<string, Vec2>,
): void {
  const dt = config.dt;
  const n = nodes.length;

  const fx = new Float64Array(n);
  const fy = new Float64Array(n);

  // Gource-style directory forces
  applyDirForces(nodes, fx, fy);

  // User-user repulsion + user-target attraction
  for (let i = 0; i < n; i++) {
    const a = nodes[i]!;
    if (a.kind !== 'user') continue;
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j]!;
      if (b.kind !== 'user') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) continue;
      const force = config.userRepulsion / (dist * dist);
      fx[i]! -= force * (dx / dist);
      fy[i]! -= force * (dy / dist);
      fx[j]! += force * (dx / dist);
      fy[j]! += force * (dy / dist);
    }

    if (userTargets) {
      const target = userTargets.get(a.id);
      if (target) {
        const dx = target.x - a.x;
        const dy = target.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) {
          fx[i]! += config.userAttraction * dx;
          fy[i]! += config.userAttraction * dy;
        }
      }
    }
  }

  // Integrate (skip file nodes — they move in local coords)
  for (let i = 0; i < n; i++) {
    const node = nodes[i]!;
    if (node.kind === 'file') continue; // files move via updateFilePositions
    node.vx += fx[i]! * dt;
    node.vy += fy[i]! * dt;
    node.vx *= config.damping;
    node.vy *= config.damping;
    node.x += node.vx * dt;
    node.y += node.vy * dt;

    const maxCoord = 10000;
    node.x = Math.max(-maxCoord, Math.min(maxCoord, node.x));
    node.y = Math.max(-maxCoord, Math.min(maxCoord, node.y));
  }
}

/** Update spline control points for directory edges toward their midpoints. */
export function updateSplinePoints(nodes: LayoutNode[], dt: number): void {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const node of nodes) {
    if (node.kind !== 'dir' || !node.parent || !node.splinePoint) continue;
    const parent = nodeMap.get(node.parent);
    if (!parent) continue;

    const midX = node.x + (parent.x - node.x) * 0.5;
    const midY = node.y + (parent.y - node.y) * 0.5;
    let dx = midX - node.splinePoint.x;
    let dy = midY - node.splinePoint.y;

    const dist = Math.hypot(parent.x - node.x, parent.y - node.y);
    const maxDist = dist * 0.5;
    const deltaLen = Math.hypot(dx, dy);
    if (deltaLen > maxDist) {
      dx = dx / deltaLen * maxDist;
      dy = dy / deltaLen * maxDist;
    }

    const t = Math.min(1, dt * 2);
    node.splinePoint.x += dx * t;
    node.splinePoint.y += dy * t;
  }
}

/** Move file nodes toward their ring destinations in local directory coordinates. */
export function updateFilePositions(nodes: LayoutNode[], dt: number): void {
  const dirLookup = new Map(nodes.filter((n) => n.kind === 'dir').map((n) => [n.id, n]));

  for (const node of nodes) {
    if (node.kind !== 'file' || !node.directoryId) continue;
    const dir = dirLookup.get(node.directoryId);
    if (!dir) continue;

    const dist = node.distance ?? 0;
    const targetLocalX = (node.destX ?? 0) * dist;
    const targetLocalY = (node.destY ?? 0) * dist;

    let dx = targetLocalX - (node.localX ?? 0);
    let dy = targetLocalY - (node.localY ?? 0);

    const speed = GOURCE.fileMoveSpeed;
    let stepX = dx * speed * dt;
    let stepY = dy * speed * dt;
    const stepLen = Math.hypot(stepX, stepY);
    const deltaLen = Math.hypot(dx, dy);

    if (stepLen > deltaLen) {
      stepX = dx;
      stepY = dy;
    }

    node.localX = (node.localX ?? 0) + stepX;
    node.localY = (node.localY ?? 0) + stepY;
    node.x = dir.x + (node.localX ?? 0);
    node.y = dir.y + (node.localY ?? 0);
  }
}

/** Build user-to-target mappings from pending/active actions, using file positions from layout nodes. */
export function buildUserTargets(
  users: User[],
  layoutNodes: LayoutNode[],
): Map<string, Vec2> {
  const targets = new Map<string, Vec2>();

  for (const user of users) {
    for (const action of user.actions) {
      if (!action.active && action.progress === 0) continue;
      // Find the file node for this action's path
      const fileNode = layoutNodes.find(
        (n) => n.kind === 'file' && n.id === `file:${action.path}`,
      );
      if (fileNode) {
        targets.set(`user:${user.name}`, { x: fileNode.x, y: fileNode.y });
        break; // Use first matching action target
      }
    }
  }

  return targets;
}

/** Run one physics step: build layout from graph+users, tick, write user positions back. */
export function stepSimulation(
  dirs: DirectoryNode[],
  users: User[],
  config?: PhysicsConfig,
): LayoutNode[] {
  const nodes = buildLayout(dirs, users, config);
  const targets = buildUserTargets(users, nodes);
  const cfg = config ?? DEFAULT_CONFIG;
  tickPhysics(nodes, cfg, targets);
  updateFilePositions(nodes, cfg.dt);

  for (const node of nodes) {
    if (node.kind === 'user' && node.ref) {
      const user = node.ref as User;
      user.x = node.x;
      user.y = node.y;
    }
  }

  return nodes;
}

import type { DirectoryNode, FileNode, User } from './types';

/** 2D vector. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Positioned entity in the layout. */
export interface LayoutNode {
  id: string; // unique key: 'dir:path' or 'file:path'
  kind: 'dir' | 'file' | 'user';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  parent?: string; // parent directory id
  // reference to domain object
  ref?: DirectoryNode | FileNode | User;
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
export function pathHashPosition(path: string, range = 500): Vec2 {
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
  const fileCount = countFiles(dir);
  const radius = Math.min(
    config.maxRadius,
    Math.max(config.minRadius, config.dirRadius + fileCount * config.radiusPerFile),
  );

  const node: LayoutNode = {
    id: `dir:${dir.path}`,
    kind: 'dir',
    x: parent ? parent.x + pos.x * 0.1 : pos.x,
    y: parent ? parent.y + pos.y * 0.1 : pos.y,
    vx: 0,
    vy: 0,
    radius,
    parent: parent?.id,
    ref: dir,
  };
  nodes.push(node);

  // Radial file placement
  for (let i = 0; i < dir.files.length; i++) {
    const angle = (i / Math.max(dir.files.length, 1)) * Math.PI * 2;
    nodes.push({
      id: `file:${dir.files[i]!.path}`,
      kind: 'file',
      x: node.x + Math.cos(angle) * radius,
      y: node.y + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      radius: 4,
      parent: node.id,
      ref: dir.files[i],
    });
  }

  for (const subDir of dir.dirs) {
    addDirNode(subDir, node, nodes, config);
  }
}

function countFiles(dir: DirectoryNode): number {
  let count = dir.files.length;
  for (const sub of dir.dirs) {
    count += countFiles(sub);
  }
  return count;
}

/** Step the physics simulation forward by the fixed dt. */
export function tickPhysics(
  nodes: LayoutNode[],
  config: PhysicsConfig = DEFAULT_CONFIG,
  userTargets?: Map<string, Vec2>,
): void {
  const dt = config.dt;
  const n = nodes.length;

  // Reset forces
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);

  // O(n²) pairwise forces
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) continue;

      if (a.kind === 'dir' && b.kind === 'dir') {
        // Parent attraction
        if (b.parent === a.id) {
          const force = config.parentAttraction * dist;
          fx[i]! += force * (dx / dist);
          fy[i]! += force * (dy / dist);
          fx[j]! -= force * (dx / dist);
          fy[j]! -= force * (dy / dist);
        } else if (a.parent === b.id) {
          const force = config.parentAttraction * dist;
          fx[j]! += force * (dx / dist);
          fy[j]! += force * (dy / dist);
          fx[i]! -= force * (dx / dist);
          fy[i]! -= force * (dy / dist);
        } else {
          // Sibling repulsion
          const force = config.siblingRepulsion / (dist * dist);
          fx[i]! -= force * (dx / dist);
          fy[i]! -= force * (dy / dist);
          fx[j]! += force * (dx / dist);
          fy[j]! += force * (dy / dist);
        }
      } else if (a.kind === 'user' && b.kind === 'user') {
        // User-user repulsion
        const force = config.userRepulsion / (dist * dist);
        fx[i]! -= force * (dx / dist);
        fy[i]! -= force * (dy / dist);
        fx[j]! += force * (dx / dist);
        fy[j]! += force * (dy / dist);
      }
    }

    // User attraction to target
    if (nodes[i]!.kind === 'user' && userTargets) {
      const target = userTargets.get(nodes[i]!.id);
      if (target) {
        const dx = target.x - nodes[i]!.x;
        const dy = target.y - nodes[i]!.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) {
          fx[i]! += config.userAttraction * dx;
          fy[i]! += config.userAttraction * dy;
        }
      }
    }
  }

  // Integrate
  for (let i = 0; i < n; i++) {
    const node = nodes[i]!;
    node.vx += fx[i]! * dt;
    node.vy += fy[i]! * dt;
    node.vx *= config.damping;
    node.vy *= config.damping;
    node.x += node.vx * dt;
    node.y += node.vy * dt;

    // Clamp to prevent runaway
    const maxCoord = 10000;
    node.x = Math.max(-maxCoord, Math.min(maxCoord, node.x));
    node.y = Math.max(-maxCoord, Math.min(maxCoord, node.y));
  }
}

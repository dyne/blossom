import type { DirectoryNode, FileNode, User } from './types';
import { pathHashPosition, type LayoutNode, type PhysicsConfig, type Vec2, buildLayout, tickPhysics, buildUserTargets, updateFilePositions } from './layout';

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

/** Persistent physics simulation that owns LayoutNodes across frames. */
export class Simulation {
  #nodes: LayoutNode[] = [];
  #config: PhysicsConfig;

  constructor(config: PhysicsConfig = { ...DEFAULT_CONFIG }) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  get nodes(): LayoutNode[] {
    return this.#nodes;
  }

  /** Sync nodes with the current graph and user state. Preserves existing node positions. */
  sync(dirs: DirectoryNode[], users: User[]): void {
    const fresh = buildLayout(dirs, users, this.#config);
    const freshMap = new Map(fresh.map((n) => [n.id, n]));
    const existing = new Map(this.#nodes.map((n) => [n.id, n]));

    const merged: LayoutNode[] = [];

    for (const fn of fresh) {
      const old = existing.get(fn.id);
      if (old) {
        old.ref = fn.ref;
        if (old.kind === 'dir') {
          old.radius = fn.radius;
          old.parentRadius = fn.parentRadius;
          old.area = fn.area;
          old.visibleFileCount = fn.visibleFileCount;
          old.changeTimer = fn.changeTimer;
        }
        if (old.kind === 'file') {
          old.directoryId = fn.directoryId;
          old.size = fn.size;
        }
        merged.push(old);
      } else {
        merged.push(fn);
      }
    }

    this.#nodes = merged;
  }

  /** Run one physics tick on the persistent node array. */
  tick(): void {
    const users = new Set<User>();
    for (const n of this.#nodes) {
      if (n.kind === 'user' && n.ref) users.add(n.ref as User);
    }
    const targets = buildUserTargets([...users], this.#nodes);
    tickPhysics(this.#nodes, this.#config, targets);
    updateFilePositions(this.#nodes, this.#config.dt);
  }

  /** Copy user node positions back into User domain objects. */
  writeUserPositions(): void {
    for (const node of this.#nodes) {
      if (node.kind === 'user' && node.ref) {
        const user = node.ref as User;
        user.x = node.x;
        user.y = node.y;
      }
    }
  }

  /** Find a file node by path. */
  findFileNode(path: string): LayoutNode | undefined {
    return this.#nodes.find((n) => n.kind === 'file' && n.id === `file:${path}`);
  }

  /** Reset all simulation state. */
  reset(): void {
    this.#nodes = [];
  }
}

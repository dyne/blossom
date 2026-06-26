import { describe, expect, it, beforeEach } from 'vitest';
import { Simulation } from './simulation';
import type { DirectoryNode, User } from './types';

function makeDir(name: string, path: string, files: number, dirs: DirectoryNode[] = []): DirectoryNode {
  return {
    name, path, dirs,
    files: Array.from({ length: files }, (_, i) => ({
      name: `file${i}.ts`,
      path: `${path}/file${i}.ts`,
      markedForRemoval: false,
    })),
  };
}

function makeUser(name: string, x = 0, y = 0, actions: User['actions'] = []): User {
  return { name, color: { r: 0.5, g: 0.5, b: 0.5 }, x, y, actions };
}

describe('Simulation', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it('sync creates nodes from empty state', () => {
    sim.sync([makeDir('src', 'src', 2)], []);
    expect(sim.nodes.length).toBeGreaterThan(0);
    expect(sim.nodes.some((n) => n.kind === 'dir')).toBe(true);
    expect(sim.nodes.filter((n) => n.kind === 'file')).toHaveLength(2);
  });

  it('sync preserves existing node positions', () => {
    sim.sync([makeDir('src', 'src', 1)], []);
    const dirNode = sim.nodes.find((n) => n.kind === 'dir')!;
    dirNode.x = 123;
    dirNode.y = 456;

    sim.sync([makeDir('src', 'src', 1)], []);
    const after = sim.nodes.find((n) => n.kind === 'dir')!;
    expect(after.x).toBe(123);
    expect(after.y).toBe(456);
  });

  it('sync adds new nodes and removes stale ones', () => {
    sim.sync([makeDir('src', 'src', 1)], []);

    sim.sync([makeDir('src', 'src', 1), makeDir('lib', 'lib', 1)], []);
    expect(sim.nodes.filter((n) => n.kind === 'dir' && !n.virtual)).toHaveLength(2);

    sim.sync([makeDir('src', 'src', 1)], []);
    expect(sim.nodes.filter((n) => n.kind === 'dir' && !n.virtual)).toHaveLength(1);
    expect(sim.nodes.some((n) => n.id === 'dir:src')).toBe(true);
  });

  it('sync adds file node when file is added', () => {
    sim.sync([makeDir('src', 'src', 1)], []);
    expect(sim.nodes.filter((n) => n.kind === 'file')).toHaveLength(1);

    sim.sync([makeDir('src', 'src', 2)], []);
    expect(sim.nodes.filter((n) => n.kind === 'file')).toHaveLength(2);
  });

  it('sync removes file node when file is deleted', () => {
    sim.sync([makeDir('src', 'src', 2)], []);
    expect(sim.nodes.filter((n) => n.kind === 'file')).toHaveLength(2);

    sim.sync([makeDir('src', 'src', 1)], []);
    expect(sim.nodes.filter((n) => n.kind === 'file')).toHaveLength(1);
  });

  it('sync adds and preserves user nodes', () => {
    const u = makeUser('Ada', 10, 20);
    sim.sync([], [u]);
    const userNode = sim.nodes.find((n) => n.kind === 'user')!;
    expect(userNode.x).toBe(10);
    expect(userNode.y).toBe(20);

    userNode.x = 99;
    sim.sync([], [makeUser('Ada', 10, 20)]);
    const after = sim.nodes.find((n) => n.kind === 'user')!;
    expect(after.x).toBe(99);
  });

  it('tick changes node positions', () => {
    sim.sync([makeDir('src', 'src', 3), makeDir('lib', 'lib', 2)], [
      makeUser('Ada', 0, 0),
      makeUser('Bob', 100, 100),
    ]);
    const positions = sim.nodes.map((n) => ({ x: n.x, y: n.y }));
    sim.tick();
    const moved = sim.nodes.some((n, i) => n.x !== positions[i]!.x || n.y !== positions[i]!.y);
    expect(moved).toBe(true);
  });

  it('writeUserPositions syncs user domain objects', () => {
    const u = makeUser('Ada', 0, 0);
    sim.sync([], [u]);
    const userNode = sim.nodes.find((n) => n.kind === 'user')!;
    userNode.x = 42;
    userNode.y = 99;

    sim.writeUserPositions();
    expect(u.x).toBe(42);
    expect(u.y).toBe(99);
  });

  it('findFileNode returns file node by path', () => {
    sim.sync([makeDir('src', 'src', 2)], []);
    const fn = sim.findFileNode('src/file0.ts');
    expect(fn).toBeTruthy();
    expect(fn!.kind).toBe('file');
  });

  it('findFileNode returns undefined for unknown path', () => {
    sim.sync([makeDir('src', 'src', 1)], []);
    expect(sim.findFileNode('nonexistent.ts')).toBeUndefined();
  });

  it('reset clears all nodes', () => {
    sim.sync([makeDir('src', 'src', 2)], [makeUser('Ada', 0, 0)]);
    sim.reset();
    expect(sim.nodes).toHaveLength(0);
  });

  it('sync preserves directory-specific fields', () => {
    sim.sync([makeDir('src', 'src', 3)], []);
    const dirNode = sim.nodes.find((n) => n.id === 'dir:src')!;
    expect(dirNode.visibleFileCount).toBeGreaterThan(0);
    expect(dirNode.positionInitialized).toBe(true);
    expect(typeof dirNode.changeTimer).toBe('number');

    dirNode.positionInitialized = false;
    dirNode.changeTimer = 999;
    dirNode.x = 50;
    sim.sync([makeDir('src', 'src', 3)], []);
    const after = sim.nodes.find((n) => n.id === 'dir:src')!;
    expect(after.x).toBe(50); // position preserved
    expect(after.visibleFileCount).toBeGreaterThan(0); // updated from fresh
  });

  it('sync keeps directory motion direct instead of preserving velocity', () => {
    sim.sync([makeDir('src', 'src', 1)], []);
    const node = sim.nodes.find((n) => n.id === 'dir:src')!;
    sim.tick();
    expect(node.vx).toBe(0);

    sim.sync([makeDir('src', 'src', 1)], []);
    const after = sim.nodes.find((n) => n.id === 'dir:src')!;
    expect(after.vx).toBe(0);
  });
});

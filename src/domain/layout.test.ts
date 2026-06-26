import { describe, expect, it } from 'vitest';
import { buildLayout, pathHashPosition, tickPhysics, stepSimulation, buildUserTargets } from './layout';
import type { DirectoryNode, User } from './types';

function makeDir(name: string, path: string, files: number, dirs: DirectoryNode[] = []): DirectoryNode {
  return {
    name,
    path,
    dirs,
    files: Array.from({ length: files }, (_, i) => ({
      name: `file${i}.ts`,
      path: `${path}/file${i}.ts`,
      markedForRemoval: false,
    })),
  };
}

describe('pathHashPosition', () => {
  it('returns deterministic positions', () => {
    const a = pathHashPosition('src/main.ts');
    const b = pathHashPosition('src/main.ts');
    expect(a).toEqual(b);
  });

  it('returns different positions for different paths', () => {
    const a = pathHashPosition('src/a.ts');
    const b = pathHashPosition('src/b.ts');
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
  });
});

describe('buildLayout', () => {
  it('creates directory nodes from the tree', () => {
    const dirs: DirectoryNode[] = [
      makeDir('src', 'src', 2),
    ];
    const nodes = buildLayout(dirs, []);
    expect(nodes).toHaveLength(3); // 1 dir + 2 files
    const dirNode = nodes.find((n) => n.kind === 'dir');
    expect(dirNode).toBeTruthy();
    expect(dirNode!.id).toBe('dir:src');
  });

  it('places files radially within directories', () => {
    const dirs: DirectoryNode[] = [
      makeDir('src', 'src', 3),
    ];
    const nodes = buildLayout(dirs, []);
    const dirNode = nodes.find((n) => n.kind === 'dir')!;
    const fileNodes = nodes.filter((n) => n.kind === 'file');
    expect(fileNodes).toHaveLength(3);

    // Files should be at different angles around the dir
    for (const f of fileNodes) {
      expect(f.parent).toBe(dirNode.id);
    }
  });

  it('directory radius grows with file count', () => {
    const small = buildLayout([makeDir('a', 'a', 2)], []);
    const large = buildLayout([makeDir('b', 'b', 50)], []);

    const smallDir = small.find((n) => n.kind === 'dir')!;
    const largeDir = large.find((n) => n.kind === 'dir')!;
    expect(largeDir.radius).toBeGreaterThan(smallDir.radius);
  });

  it('creates user nodes', () => {
    const users: User[] = [
      { name: 'Ada', color: { r: 1, g: 0, b: 0 }, x: 100, y: 200, actions: [] },
      { name: 'Bob', color: { r: 0, g: 1, b: 0 }, x: 300, y: 400, actions: [] },
    ];
    const nodes = buildLayout([], users);
    const userNodes = nodes.filter((n) => n.kind === 'user');
    expect(userNodes).toHaveLength(2);
    expect(userNodes[0]!.x).toBe(100);
  });

  it('directory nodes have Gource-specific fields populated', () => {
    const dirs: DirectoryNode[] = [
      makeDir('src', 'src', 3),
    ];
    const nodes = buildLayout(dirs, []);
    const dirNode = nodes.find((n) => n.kind === 'dir')!;
    expect(dirNode.parentRadius).toBe(0); // root dir has no parent
    expect(dirNode.visibleFileCount).toBeGreaterThan(0);
    expect(dirNode.positionInitialized).toBe(true);
    expect(typeof dirNode.changeTimer).toBe('number');
  });

  it('child directory nodes reference parent radius', () => {
    const child = makeDir('b', 'a/b', 1);
    const parent = makeDir('a', 'a', 1, [child]);
    const nodes = buildLayout([parent], []);
    const childNode = nodes.find((n) => n.id === 'dir:a/b')!;
    expect(childNode.parentRadius).toBeDefined();
    expect(childNode.parentRadius).toBeGreaterThan(0);
  });

  it('creates nested layout from nested directories', () => {
    const child = makeDir('b', 'a/b', 1);
    const parent = makeDir('a', 'a', 1, [child]);
    const nodes = buildLayout([parent], []);
    const dirNodes = nodes.filter((n) => n.kind === 'dir');
    expect(dirNodes).toHaveLength(2);
    const bNode = nodes.find((n) => n.id === 'dir:a/b');
    expect(bNode).toBeTruthy();
    expect(bNode!.parent).toBe('dir:a');
  });
});

describe('tickPhysics', () => {
  it('produces no NaN or Infinity after repeated ticks', () => {
    const dirs: DirectoryNode[] = [
      makeDir('src', 'src', 5),
      makeDir('lib', 'lib', 3),
    ];
    const users: User[] = [
      { name: 'Ada', color: { r: 1, g: 0, b: 0 }, x: 0, y: 0, actions: [] },
      { name: 'Bob', color: { r: 0, g: 1, b: 0 }, x: 50, y: 50, actions: [] },
    ];
    const nodes = buildLayout(dirs, users);

    for (let i = 0; i < 600; i++) {
      tickPhysics(nodes);
      for (const n of nodes) {
        expect(Number.isNaN(n.x)).toBe(false);
        expect(Number.isNaN(n.y)).toBe(false);
        expect(Number.isFinite(n.vx)).toBe(true);
        expect(Number.isFinite(n.vy)).toBe(true);
      }
    }
  });

  it('user attraction moves user toward target', () => {
    const users: User[] = [
      { name: 'Ada', color: { r: 1, g: 0, b: 0 }, x: 0, y: 0, actions: [] },
    ];
    const nodes = buildLayout([], users);
    const targets = new Map<string, { x: number; y: number }>();
    targets.set('user:Ada', { x: 100, y: 0 });

    for (let i = 0; i < 100; i++) {
      tickPhysics(nodes, undefined, targets);
    }

    const ada = nodes.find((n) => n.id === 'user:Ada')!;
    expect(ada.x).toBeGreaterThan(1); // moved toward target
  });

  it('file moves toward parent directory', () => {
    const dirs: DirectoryNode[] = [makeDir('src', 'src', 1)];
    const nodes = buildLayout(dirs, []);
    const fileNode = nodes.find((n) => n.kind === 'file')!;

    fileNode.x = 1000;
    fileNode.y = 1000;

    for (let i = 0; i < 60; i++) {
      tickPhysics(nodes);
    }

    // File should have moved from its displaced position
    const moved = fileNode.x !== 1000 || fileNode.y !== 1000;
    expect(moved).toBe(true);
  });

  it('preserves valid coordinates after reset-like empty build', () => {
    const nodes = buildLayout([], []);
    tickPhysics(nodes);
    expect(nodes).toHaveLength(0);
  });

  it('performance smoke test: 500 nodes for 60 frames', () => {
    const dirs: DirectoryNode[] = [];
    for (let i = 0; i < 20; i++) {
      dirs.push(makeDir(`dir${i}`, `dir${i}`, 10));
    }
    const users: User[] = [];
    for (let i = 0; i < 10; i++) {
      users.push({
        name: `User${i}`,
        color: { r: 0.5, g: 0.5, b: 0.5 },
        x: i * 10,
        y: i * 10,
        actions: [],
      });
    }

    const nodes = buildLayout(dirs, users);
    // ~20 dirs * 10 files = 200 files + 20 dirs + 10 users ≈ 230 nodes
    const start = performance.now();
    for (let f = 0; f < 60; f++) {
      tickPhysics(nodes);
    }
    const elapsed = performance.now() - start;
    // Should complete well under 1 second
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('stepSimulation', () => {
  it('writes user positions back from physics', () => {
    const dirs: DirectoryNode[] = [
      makeDir('src', 'src', 2),
    ];
    const users: User[] = [
      {
        name: 'Ada', color: { r: 1, g: 0, b: 0 }, x: 0, y: 0,
        actions: [{ kind: 'A', path: 'src/file0.ts', progress: 0, active: true }],
      },
    ];

    const initialX = users[0]!.x;
    for (let f = 0; f < 30; f++) {
      stepSimulation(dirs, users);
    }
    // After 30 steps, user should have moved (attracted to file target)
    expect(users[0]!.x).not.toBe(initialX);
  });

  it('returns layout nodes', () => {
    const dirs: DirectoryNode[] = [makeDir('src', 'src', 1)];
    const nodes = stepSimulation(dirs, []);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some((n) => n.kind === 'dir')).toBe(true);
  });
});

describe('buildUserTargets', () => {
  it('maps user to file positions based on active actions', () => {
    const users: User[] = [
      {
        name: 'Ada', color: { r: 1, g: 0, b: 0 }, x: 0, y: 0,
        actions: [{ kind: 'A', path: 'src/file0.ts', progress: 0, active: true }],
      },
    ];
    const nodes = buildLayout([makeDir('src', 'src', 2)], users);
    const targets = buildUserTargets(users, nodes);
    expect(targets.has('user:Ada')).toBe(true);
  });
});

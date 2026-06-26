import { describe, expect, it, beforeEach } from 'vitest';
import { RepositoryGraph } from './graph';
import { createLogEvent } from './factories';

function file(name: string, color?: { r: number; g: number; b: number }): Record<string, unknown> {
  return { name, color, markedForRemoval: false };
}

describe('RepositoryGraph', () => {
  let g: RepositoryGraph;

  beforeEach(() => {
    g = new RepositoryGraph();
  });

  it('creates root files on add', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'main.ts'));
    expect(g.rootFiles).toHaveLength(1);
    expect(g.rootFiles[0]!.name).toBe('main.ts');
    expect(g.rootFiles[0]!.path).toBe('main.ts');
  });

  it('creates nested files with intermediate directories', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'src/utils/helper.ts'));
    expect(g.roots).toHaveLength(1);
    const src = g.roots[0]!;
    expect(src.name).toBe('src');
    expect(src.dirs).toHaveLength(1);
    const utils = src.dirs[0]!;
    expect(utils.name).toBe('utils');
    expect(utils.files).toHaveLength(1);
    expect(utils.files[0]!.name).toBe('helper.ts');
  });

  it('shares directory prefixes across files', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'src/main.ts'));
    g.apply(createLogEvent(2, 'Bob', 'A', 'src/lib.ts'));
    expect(g.roots).toHaveLength(1);
    const src = g.roots[0]!;
    expect(src.name).toBe('src');
    expect(src.files).toHaveLength(2);
    expect(src.files[0]!.name).toBe('main.ts');
    expect(src.files[1]!.name).toBe('lib.ts');
  });

  it('converts file to directory when nested file uses same name', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'foo'));
    expect(g.rootFiles).toHaveLength(1);
    expect(g.rootFiles[0]!.name).toBe('foo');

    g.apply(createLogEvent(2, 'Bob', 'A', 'foo/bar.txt'));
    // foo should now be a directory
    const foo = g.roots.find((d) => d.name === 'foo');
    expect(foo).toBeTruthy();
    expect(foo!.files).toHaveLength(1);
    expect(foo!.files[0]!.name).toBe('bar.txt');
    // Original root file should be gone
    expect(g.rootFiles.find((f) => f.name === 'foo')).toBeFalsy();
  });

  it('modify updates file color', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'main.ts'));
    g.apply(createLogEvent(2, 'Ada', 'M', 'main.ts', { r: 1, g: 0, b: 0 }));
    expect(g.rootFiles[0]!.color).toEqual({ r: 1, g: 0, b: 0 });
  });

  it('modify creates file when absent', () => {
    g.apply(createLogEvent(1, 'Ada', 'M', 'newfile.ts'));
    expect(g.rootFiles).toHaveLength(1);
    expect(g.rootFiles[0]!.name).toBe('newfile.ts');
  });

  it('delete marks file for removal', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'main.ts'));
    g.apply(createLogEvent(2, 'Ada', 'D', 'main.ts'));
    expect(g.rootFiles[0]!.markedForRemoval).toBe(true);
  });

  it('delete directory recursively marks files before pruning', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'src/main.ts'));
    g.apply(createLogEvent(2, 'Ada', 'A', 'src/utils/helper.ts'));
    g.apply(createLogEvent(3, 'Ada', 'A', 'lib.ts'));

    g.apply(createLogEvent(4, 'Ada', 'D', 'src'));

    const src = g.roots.find((d) => d.name === 'src');
    expect(src).toBeTruthy();
    expect(src!.files[0]!.markedForRemoval).toBe(true);
    expect(src!.dirs[0]!.files[0]!.markedForRemoval).toBe(true);
    expect(g.rootFiles[0]!.name).toBe('lib.ts');

    g.pruneEmpty();
    expect(g.roots.find((d) => d.name === 'src')).toBeUndefined();
  });

  it('prunes empty directories after removals', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'src/a/b/file.ts'));
    g.apply(createLogEvent(2, 'Ada', 'D', 'src/a/b/file.ts'));

    g.pruneEmpty();
    expect(g.roots).toHaveLength(0);
  });

  it('does not prune non-empty directories', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'src/a/file.ts'));
    g.apply(createLogEvent(2, 'Ada', 'A', 'src/b/file.ts'));
    g.apply(createLogEvent(3, 'Ada', 'D', 'src/a/file.ts'));

    g.pruneEmpty();
    expect(g.roots).toHaveLength(1);
    const src = g.roots[0]!;
    expect(src.dirs).toHaveLength(1);
    expect(src.dirs[0]!.name).toBe('b');
  });

  it('resets the entire tree', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'a.ts'));
    g.apply(createLogEvent(2, 'Ada', 'A', 'b.ts'));
    g.reset();
    expect(g.roots).toHaveLength(0);
    expect(g.rootFiles).toHaveLength(0);
  });

  it('re-uses existing file on repeated add', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'main.ts'));
    g.apply(createLogEvent(2, 'Bob', 'A', 'main.ts'));
    expect(g.rootFiles).toHaveLength(1);
    expect(g.allFiles()).toHaveLength(1);
  });

  it('allFiles returns flat list excluding marked-for-removal', () => {
    g.apply(createLogEvent(1, 'Ada', 'A', 'main.ts'));
    g.apply(createLogEvent(2, 'Ada', 'A', 'lib/util.ts'));
    g.apply(createLogEvent(3, 'Ada', 'A', 'lib/helper.ts'));
    const files = g.allFiles();
    expect(files).toHaveLength(3);
  });
});

import type { DirectoryNode, FileNode, LogEvent } from './types';

/** Internal directory entry that holds both files and subdirectories. */
interface DirEntry {
  name: string;
  path: string;
  dirs: DirEntry[];
  files: FileNode[];
}

/** The repository directory tree. */
export class RepositoryGraph {
  #root: DirEntry = { name: '', path: '', dirs: [], files: [] };

  get roots(): DirectoryNode[] {
    return this.#root.dirs;
  }

  /** Root-level files as DirectoryNode equivalents for rendering. */
  get rootFiles(): FileNode[] {
    return this.#root.files;
  }

  /** Apply a log event, mutating the tree. */
  apply(event: LogEvent): void {
    const parts = event.path.split('/').filter(Boolean);
    if (parts.length === 0) return;

    if (parts.length === 1) {
      const name = parts[0]!;

      if (event.action === 'D') {
        const subDir = this.#root.dirs.find((d) => d.name === name);
        if (subDir) {
          this.#markDirForRemoval(subDir);
          this.#removeFromList(this.#root.dirs, name);
        } else {
          const file = this.#root.files.find((f) => f.name === name);
          if (file) file.markedForRemoval = true;
          if (file) file.deletedAt = Date.now();
        }
      } else {
        const file = this.#ensureFile(this.#root, name, event);
        this.#updateFileColor(file, event);
      }
    } else {
      const dirParts = parts.slice(0, -1);
      const basename = parts[parts.length - 1]!;
      const dir = this.#ensureDirs(this.#root, dirParts);

      if (event.action === 'D') {
        const subDir = dir.dirs.find((d) => d.name === basename);
        if (subDir) {
          this.#markDirForRemoval(subDir);
          this.#removeFromList(dir.dirs, basename);
        } else {
          const file = dir.files.find((f) => f.name === basename);
          if (file) file.markedForRemoval = true;
          if (file) file.deletedAt = Date.now();
        }
      } else {
        const file = this.#ensureFile(dir, basename, event);
        this.#updateFileColor(file, event);
      }
    }
  }

  /** Clear the entire tree. */
  reset(): void {
    this.#root = { name: '', path: '', dirs: [], files: [] };
  }

  /** Prune empty directories recursively. */
  pruneEmpty(): void {
    this.#pruneEmptyList(this.#root.dirs);
  }

  /** Collect all files from the tree. */
  allFiles(): FileNode[] {
    const result: FileNode[] = [...this.#root.files];
    this.#collectFiles(this.#root.dirs, result);
    return result.filter((f) => !f.markedForRemoval);
  }

  #ensureDirs(parent: DirEntry, parts: string[]): DirEntry {
    const name = parts[0]!;
    let dir = parent.dirs.find((d) => d.name === name);

    if (!dir) {
      // Check if there's a file with this name (file-to-dir conversion)
      const fileIdx = parent.files.findIndex((f) => f.name === name);
      if (fileIdx >= 0) {
        parent.files.splice(fileIdx, 1);
      }

      dir = {
        name,
        path: parent.path ? `${parent.path}/${name}` : name,
        dirs: [],
        files: [],
      };
      parent.dirs.push(dir);
    }

    if (parts.length > 1) {
      return this.#ensureDirs(dir, parts.slice(1));
    }
    return dir;
  }

  #ensureFile(parent: DirEntry, name: string, event: LogEvent): FileNode {
    let file = parent.files.find((f) => f.name === name);
    if (!file) {
      file = {
        name,
        path: parent.path ? `${parent.path}/${name}` : name,
        markedForRemoval: false,
      };
      parent.files.push(file);
    }
    file.markedForRemoval = false;
    return file;
  }

  #updateFileColor(file: FileNode, event: LogEvent): void {
    if (event.color !== undefined) {
      file.color = event.color;
    }
    if (event.action === 'M') {
      file.flashUntil = Date.now() + 500;
    }
  }

  #markDirForRemoval(dir: DirEntry): void {
    for (const file of dir.files) {
      file.markedForRemoval = true;
    }
    for (const subDir of dir.dirs) {
      this.#markDirForRemoval(subDir);
    }
  }

  #removeFromList(list: DirEntry[], name: string): void {
    const idx = list.findIndex((d) => d.name === name);
    if (idx >= 0) {
      list.splice(idx, 1);
    }
  }

  #pruneEmptyList(list: DirEntry[]): void {
    for (let i = list.length - 1; i >= 0; i--) {
      const dir = list[i]!;
      // Remove files marked for removal
      dir.files = dir.files.filter((f) => !f.markedForRemoval);
      this.#pruneEmptyList(dir.dirs);
      if (dir.dirs.length === 0 && dir.files.length === 0) {
        list.splice(i, 1);
      }
    }
  }

  #collectFiles(dirs: DirEntry[], result: FileNode[]): void {
    for (const dir of dirs) {
      for (const file of dir.files) {
        result.push(file);
      }
      this.#collectFiles(dir.dirs, result);
    }
  }
}

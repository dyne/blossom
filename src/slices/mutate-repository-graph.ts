import type { DirectoryNode, LogEvent } from '../domain/types.ts';

/** The repository directory tree. */
export class RepositoryGraph {
  /** Root directories. */
  get roots(): DirectoryNode[] { return []; }
  /** Apply a log event, mutating the tree. */
  apply(event: LogEvent): void {}
  /** Clear the entire tree. */
  reset(): void {}
}

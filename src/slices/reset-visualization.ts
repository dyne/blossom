import type { RepositoryGraph } from './mutate-repository-graph.ts';
import type { LiveQueue } from './advance-live-queue.ts';

/** Clear all application state: queue, graph, users, renderer. */
export function resetVisualization(
  queue: LiveQueue,
  graph: RepositoryGraph,
  onReset: () => void,
): void {
  throw new Error('not implemented');
}

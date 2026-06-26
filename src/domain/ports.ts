import type { AppStatus, ConnectionState, LogEvent, SceneState } from './types.ts';

/** Emit ordered log events from a live source. */
export interface LogEventSource {
  /** Register a callback to receive log events in arrival order. */
  onEvent(listener: (event: LogEvent) => void): () => void;
  /** Register a callback for connection state changes. */
  onState(listener: (state: ConnectionState) => void): () => void;
  /** Begin receiving events from the source. */
  start(): void;
  /** Stop receiving events and close the source. */
  stop(): void;
}

/** Provide per-frame callbacks tied to the browser animation loop. */
export interface FrameClock {
  /** Register a callback to run each frame. Returns an unsubscribe function. */
  onTick(listener: (dt: number) => void): () => void;
  /** Current frames-per-second target. */
  readonly maxFps: number;
  /** Pause or resume the clock. */
  setPaused(paused: boolean): void;
}

/** Draw the world layers, labels, and HUD for a given scene snapshot. */
export interface SceneRenderer {
  /** Render a complete scene snapshot. Called each frame. */
  render(scene: SceneState): void;
  /** Tear down all display objects and release resources. */
  destroy(): void;
}

/** Report application status changes to the UI layer. */
export interface StatusSink {
  /** Publish the latest status. Called whenever state changes. */
  update(status: AppStatus): void;
}

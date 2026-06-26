/** A Blossom log event action: add, modify, or delete. */
export type ActionKind = 'A' | 'M' | 'D';

/** RGB color as three normalized floats [0, 1]. */
export type Color = { r: number; g: number; b: number };

/** A validated username string. */
export type UserName = string;

/** A repository path such as `src/main.ts` or `lib/util/`. */
export type RepositoryPath = string;

/** Monotonically increasing sequence number for deterministic ordering. */
export type SequenceNumber = number;

/** A validated log event ready for graph mutation. */
export interface LogEvent {
  sequence: SequenceNumber;
  user: UserName;
  action: ActionKind;
  path: RepositoryPath;
  color?: Color | undefined;
}

/** A node in the repository directory tree. */
export interface DirectoryNode {
  name: string;
  path: string;
  dirs: DirectoryNode[];
  files: FileNode[];
}

/** A file node in the repository tree. */
export interface FileNode {
  name: string;
  path: string;
  color?: Color | undefined;
  markedForRemoval: boolean;
}

/** A user in the simulation. */
export interface User {
  name: UserName;
  color: Color;
  x: number;
  y: number;
  actions: UserAction[];
}

/** A pending or active action for a user. */
export interface UserAction {
  kind: ActionKind;
  path: RepositoryPath;
  progress: number; // 0..1
  active: boolean;
  pendingSince?: number; // time when enqueued
  event?: LogEvent; // source event reference
}

/** Camera state for view transforms. */
export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

/** Connection state for the WebSocket source. */
export type ConnectionState = 'connecting' | 'open' | 'closed' | 'failed';

/** Application status for HUD display. */
export interface AppStatus {
  connection: ConnectionState;
  queueSize: number;
  paused: boolean;
  eventCount: number;
}

/** A snapshot of the full scene for the renderer. */
export interface SceneState {
  dirs: DirectoryNode[];
  users: User[];
  camera: CameraState;
  status: AppStatus;
}

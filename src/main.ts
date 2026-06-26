import { parseStartup } from './app/startup';
import { createBrowserWebSocketSource } from './adapters/websocket-source';
import type { LogEventSource } from './domain/ports';
import { createPixiRenderer } from './adapters/pixi-renderer';
import { LiveQueue } from './slices/advance-live-queue';
import { RepositoryGraph } from './slices/mutate-repository-graph';
import { UserManager } from './domain/users';
import { Camera } from './domain/camera';
import { stepSimulation } from './domain/layout';
import type { ConnectionState, SceneState, LogEvent } from './domain/types';

const startup = parseStartup(window.location.search);

const canvas = document.getElementById('blossom-canvas') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Canvas not found');

const renderer = await createPixiRenderer(canvas);

const queue = new LiveQueue();
const graph = new RepositoryGraph();
const users = new UserManager();
const camera = new Camera();

let eventCount = 0;
let connectionState: ConnectionState = 'closed';
let paused = false;
let source: LogEventSource = createBrowserWebSocketSource(startup.wsUrl);

function createSource(url: string): LogEventSource {
  return createBrowserWebSocketSource(url);
}

function setupSource(newSource: LogEventSource): void {
  newSource.onEvent((event: LogEvent) => {
    queue.enqueue(event);
  });
  newSource.onState((state: ConnectionState) => {
    connectionState = state;
    updateStatusText();
  });
}

setupSource(source);

function buildScene(): SceneState {
  return {
    dirs: graph.roots,
    users: users.users,
    camera: camera.state,
    status: {
      connection: connectionState,
      queueSize: queue.size,
      paused,
      eventCount,
    },
  };
}

function applyEvent(event: LogEvent): void {
  graph.apply(event);
  users.enqueueAction(event, performance.now() / 1000);
  eventCount++;
  if (eventCount % 10 === 0) {
    graph.pruneEmpty();
  }
}

// Controls
const btnConnect = document.getElementById('btn-connect')!;
const btnPause = document.getElementById('btn-pause')!;
const btnFit = document.getElementById('btn-fit')!;
const btnReset = document.getElementById('btn-reset')!;
const wsUrlInput = document.getElementById('ws-url') as HTMLInputElement;
const speedInput = document.getElementById('speed-input') as HTMLInputElement;
const statusText = document.getElementById('status-text')!;

wsUrlInput.value = startup.wsUrl;
speedInput.value = String(startup.speed);

let connected = false;
btnConnect.addEventListener('click', () => {
  if (connected) {
    source.stop();
    connected = false;
    btnConnect.textContent = 'connect';
    connectionState = 'closed';
  } else {
    source.stop();
    source = createSource(wsUrlInput.value);
    setupSource(source);
    source.start();
    connected = true;
    btnConnect.textContent = 'disconnect';
  }
});

btnPause.addEventListener('click', () => {
  paused = !paused;
  if (paused) {
    queue.pause();
    btnPause.textContent = 'resume';
  } else {
    queue.resume();
    btnPause.textContent = 'pause';
  }
});

btnFit.addEventListener('click', () => {
  const allNodes = stepSimulation(graph.roots, users.users);
  if (allNodes.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of allNodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  camera.fitToView({ minX, minY, maxX, maxY });
});

btnReset.addEventListener('click', () => {
  queue.reset();
  graph.reset();
  users.reset();
  eventCount = 0;
});

function updateStatusText(): void {
  statusText.textContent = `${connectionState} | e:${eventCount} | q:${queue.size}`;
}

// Camera - pointer events for pan/zoom
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  camera.zoomAt(factor, e.offsetX, e.offsetY);
});

let dragging = false;
let lastDragX = 0;
let lastDragY = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastDragX = e.clientX;
  lastDragY = e.clientY;
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastDragX;
  const dy = e.clientY - lastDragY;
  camera.pan(-dx, -dy);
  lastDragX = e.clientX;
  lastDragY = e.clientY;
});

canvas.addEventListener('pointerup', () => {
  dragging = false;
});
canvas.addEventListener('pointerleave', () => {
  dragging = false;
});

// Touch pinch zoom
let initialPinchDist = 0;
let initialPinchZoom = 0;
let initialPinchCenter: { x: number; y: number } = { x: 0, y: 0 };

canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    dragging = false;
    initialPinchDist = Math.hypot(
      e.touches[0]!.clientX - e.touches[1]!.clientX,
      e.touches[0]!.clientY - e.touches[1]!.clientY,
    );
    initialPinchZoom = camera.state.zoom;
    initialPinchCenter = {
      x: (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2,
      y: (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2,
    };
  }
});

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dist = Math.hypot(
      e.touches[0]!.clientX - e.touches[1]!.clientX,
      e.touches[0]!.clientY - e.touches[1]!.clientY,
    );
    const factor = dist / initialPinchDist;
    const targetZoom = initialPinchZoom * factor;
    const currentZoom = camera.state.zoom;
    if (currentZoom > 0) {
      camera.zoomAt(targetZoom / currentZoom, initialPinchCenter.x, initialPinchCenter.y);
    }
  }
});

// Handle resize
function onResize(): void {
  camera.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);
onResize();

// Connection if autoplay
if (startup.autoplay) {
  source.start();
  connected = true;
  btnConnect.textContent = 'disconnect';
}

// Main render loop
function frame(): void {
  const speed = parseInt(speedInput.value, 10) || 5;
  queue.tick(speed, applyEvent);

  // Run physics first so we know file positions for user targeting
  const layoutNodes = stepSimulation(graph.roots, users.users);

  // Build map of user name → target file position from pending/active actions
  const userTargets = new Map<string, { x: number; y: number }>();
  for (const node of layoutNodes) {
    if (node.kind === 'file') {
      userTargets.set(`file:${node.id}`, { x: node.x, y: node.y });
    }
  }

  users.tick(1 / 60, performance.now() / 1000, (name) => {
    const u = users.getOrCreate(name);
    // Find the first pending/active action target position for this user
    for (const action of u.actions) {
      const pos = userTargets.get(`file:file:${action.path}`);
      if (pos) return pos;
    }
    return { x: u.x, y: u.y }; // fallback: user's own position
  });

  const scene = buildScene();
  scene.layoutNodes = layoutNodes;

  updateStatusText();
  renderer.render(scene);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

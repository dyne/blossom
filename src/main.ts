import { parseStartup } from './app/startup';
import { createBrowserWebSocketSource } from './adapters/websocket-source';
import { createPixiRenderer } from './adapters/pixi-renderer';
import { LiveQueue } from './slices/advance-live-queue';
import { RepositoryGraph } from './slices/mutate-repository-graph';
import { UserManager } from './domain/users';
import { Camera } from './domain/camera';
import { pathHashPosition } from './domain/layout';
import type { ConnectionState, SceneState } from './domain/types';

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

function applyEvent(event: import('./domain/types').LogEvent): void {
  graph.apply(event);
  users.enqueueAction(event, performance.now() / 1000);
  eventCount++;
  // Prune periodically
  if (eventCount % 10 === 0) {
    graph.pruneEmpty();
  }
}

// WebSocket
const source = createBrowserWebSocketSource(startup.wsUrl);
source.onEvent((event) => {
  queue.enqueue(event);
});
source.onState((state) => {
  connectionState = state;
  updateStatusText();
});

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
  } else {
    // Re-create source with current URL
    window.location.search = `?ws=${encodeURIComponent(wsUrlInput.value)}&speed=${speedInput.value}`;
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
  const allFiles = graph.allFiles();
  if (allFiles.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of allFiles) {
    // Use hash positions for rough bounds
    const pos = pathHashPosition(f.path);
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x);
    maxY = Math.max(maxY, pos.y);
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

canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    dragging = false;
    initialPinchDist = Math.hypot(
      e.touches[0]!.clientX - e.touches[1]!.clientX,
      e.touches[0]!.clientY - e.touches[1]!.clientY,
    );
    initialPinchZoom = camera.state.zoom;
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
    camera.state.zoom = Math.max(0.1, Math.min(10, initialPinchZoom * factor));
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
  users.tick(1 / 60, performance.now() / 1000, (name) => {
    const u = users.getOrCreate(name);
    return { x: u.x, y: u.y };
  });
  updateStatusText();
  renderer.render(buildScene());
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

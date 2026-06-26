import { parseStartup } from './app/startup';
import { createBrowserWebSocketSource } from './adapters/websocket-source';
import type { LogEventSource } from './domain/ports';
import { createPixiRenderer } from './adapters/pixi-renderer';
import { LiveQueue } from './slices/advance-live-queue';
import { RepositoryGraph } from './slices/mutate-repository-graph';
import { UserManager } from './domain/users';
import { Camera } from './domain/camera';
import { Simulation } from './domain/simulation';
import type { ConnectionState, SceneState, LogEvent } from './domain/types';

const startup = parseStartup(window.location.search);

const canvas = document.getElementById('blossom-canvas') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Canvas not found');

const renderer = await createPixiRenderer(canvas);

const queue = new LiveQueue();
const graph = new RepositoryGraph();
const users = new UserManager();
const camera = new Camera();
const sim = new Simulation();

let eventCount = 0;
let connectionState: ConnectionState = 'closed';
let paused = false;
let fittedOnce = false;
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

// Connection if autoplay
let connected = false;
if (startup.autoplay) {
  source.start();
  connected = true;
  btnConnect.textContent = 'disconnect';
} else {
  connectionState = 'closed';
  updateStatusText();
}
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
  const nodes = sim.nodes;
  if (nodes.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.radius);
    minY = Math.min(minY, n.y - n.radius);
    maxX = Math.max(maxX, n.x + n.radius);
    maxY = Math.max(maxY, n.y + n.radius);
  }
  camera.fitToView({ minX, minY, maxX, maxY });
});

btnReset.addEventListener('click', () => {
  queue.reset();
  graph.reset();
  users.reset();
  sim.reset();
  eventCount = 0;
  fittedOnce = false;
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
  camera.pan(dx, dy);
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

// Main render loop
let lastFrameTime = performance.now();
const MAX_FRAME_DT = 1 / 15; // cap at 15 FPS equivalent to avoid spiral-of-death

function frame(): void {
  const now = performance.now();
  let dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;

  const speed = parseInt(speedInput.value, 10) || 5;

  if (!paused) {
    queue.tick(speed, applyEvent);
    sim.sync(graph.roots, users.users, graph.rootFiles);

    const filePositions = new Map<string, { x: number; y: number }>();
    for (const node of sim.nodes) {
      if (node.kind === 'file') {
        filePositions.set((node.ref as { path: string }).path, { x: node.x, y: node.y });
      }
    }

    users.tick(dt, performance.now() / 1000, (path) => {
      return filePositions.get(path);
    });

    sim.tick();
    sim.writeUserPositions();

    if (!dragging) {
      // Auto-framing based on activity
      if (!camera.manualCamera && !camera.manualZoom) {
        const activeUsers = users.users.filter((u) => u.actions.some((a) => a.active));
        if (activeUsers.length > 0) {
          const userBounds = camera.computeUserBounds(activeUsers);
          if (userBounds) {
            camera.adjust(userBounds, false);
          }
        } else {
          const dirNodes = sim.nodes.filter((n) => n.kind === 'dir' || n.kind === 'file');
          const dirBounds = camera.computeDirBounds(dirNodes);
          if (dirBounds) {
            camera.adjust(dirBounds, true);
            // Auto-rotate: if tree is narrow, rotate 90 degrees
            const w = dirBounds.maxX - dirBounds.minX;
            const h = dirBounds.maxY - dirBounds.minY;
            if (w > 0 && h > 0 && h / w > 2.0) {
              camera.setTargetRotation(Math.PI / 2);
            } else {
              camera.setTargetRotation(0);
            }
          }
        }
      }
    }
    camera.tickMomentum(dt);

    // Auto-fit on first data
    if (!fittedOnce && sim.nodes.length > 0) {
      fittedOnce = true;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of sim.nodes) {
        minX = Math.min(minX, n.x - n.radius); minY = Math.min(minY, n.y - n.radius);
        maxX = Math.max(maxX, n.x + n.radius); maxY = Math.max(maxY, n.y + n.radius);
      }
      camera.fitToView({ minX, minY, maxX, maxY });
    }
  }

  const scene = buildScene();
  scene.layoutNodes = sim.nodes;

  updateStatusText();
  renderer.render(scene);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

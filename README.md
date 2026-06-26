# Blossom

Native TypeScript live repository visualization inspired by Gource.

## Product Decisions

Blossom is a live-only visualization tool:

- **Live-only**: Never supports rewind, seek, progress sliders, or repository scanning.
- **Arrival order**: Events are processed in WebSocket arrival order; no sorting or grouping.
- **No timestamps**: The protocol has no timestamp field.
- **Single project**: One Blossom instance visualizes one project.
- **Local reset**: Reset is a local UI/app command that clears all queued, domain, and renderer state.
- **Responsive**: Desktop, tablet, and mobile browsers are supported.

## Architecture Decision

Blossom uses **native TypeScript and PixiJS v8**; it is not a WASM/SDL port.

WASM/SDL would preserve more of Gource's C++ code but would carry old IO, windowing, and playback assumptions into a browser app. A native TypeScript rewrite with PixiJS v8 gives browser-native maintainability and uses Gource only as a behavioral reference for tree layout, user movement, action beams, colors, and labels. WASM remains a documented fallback only if later visual fidelity matters more than browser-native maintainability.

## In V1 / Out of V1

| In v1                                      | Out of v1                                      |
|--------------------------------------------|-------------------------------------------------|
| WebSocket connection                       | Git/SVN/Hg/Bzr readers                         |
| Strict Blossom custom-log parser           | File/stdin input                                |
| Arrival-order event queue                  | WebSocket reset/control messages               |
| Repository tree visualization              | Timestamps                                      |
| Users, files, add/modify/delete action beams | Rewind, seek                                 |
| Labels                                     | Video export                                    |
| Responsive pan/zoom                        | Captions                                        |
| Pause/resume                               | User image directories                          |
| Local reset                                | Regex filters                                   |
| Fit-to-view                                | Multi-project layout                            |
| Connection status                          | Advanced shader effects                         |

## VSA Slices

| Slice                  | Responsibility                                       |
|------------------------|------------------------------------------------------|
| connect-stream         | WebSocket connection management                      |
| ingest-log-event       | Parse raw lines into domain log events               |
| advance-live-queue     | Drain FIFO queue of events per frame                 |
| mutate-repository-graph | Apply log events to the repository tree             |
| render-scene           | Draw the graph with PixiJS                           |
| control-camera         | Pan, zoom, fit-to-view                               |
| reset-visualization    | Clear all state                                      |
| show-status            | Connection, queue, pause state                       |

## Ports

| Port              | Role                                      | Adapter          |
|-------------------|-------------------------------------------|------------------|
| LogEventSource    | Emit ordered log events                   | WebSocket        |
| FrameClock        | Provide per-frame callbacks               | requestAnimationFrame |
| SceneRenderer     | Draw world layers, labels, HUD            | PixiJS v8        |
| StatusSink        | Report state changes to UI                | DOM              |

## Protocol

Blossom uses a strict newline-separated text protocol over WebSocket. Each line is one event:

```
username|action|path
username|action|path|colour
```

- **username**: Any non-empty string. Empty defaults to `Unknown`.
- **action**: `A` (add), `M` (modify), or `D` (delete). Empty defaults to `A`.
- **path**: Repository path (e.g. `src/main.ts`). Must be non-empty.
- **colour**: Optional hex color `RRGGBB` or `#RRGGBB`.

Timestamps are intentionally excluded. Events are processed in arrival order only.

### Examples

```
Ada|A|src/main.ts
Ada|M|src/main.ts|ffcc33
Ada|D|src/main.ts
Bob|A|lib/utils/format.ts|#44aaff
```

## Setup

```bash
cd blossom
npm install
```

## Commands

```bash
# Development
npm run dev          # Start Vite dev server (http://localhost:5173)

# Testing
npm test             # Run unit tests (vitest)
npm run typecheck    # TypeScript type checking

# Build
npm run build        # TypeScript compile + Vite production build

# Demo sender
npm run sender       # Start WebSocket fixture sender on port 8080
                     # Customize: PORT=9999 FIXTURE=fixtures/nested.log SPEED=100 npm run sender
```

### Running the demo

Terminal 1 (sender):
```bash
npm run sender
```

Terminal 2 (dev server):
```bash
npm run dev
```

Open `http://localhost:5173` in a browser. Click **connect** to start streaming.

## Known v1 Limitations

- No reconnect on WebSocket failure
- No seek, rewind, or historical playback
- No video export
- No multi-project support
- No regex filters or captions
- O(n²) force simulation (adequate for moderate file counts)
- No Playwright browser integration tests yet

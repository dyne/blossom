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

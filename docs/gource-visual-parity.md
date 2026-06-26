# Blossom Gource Visual Parity

## Non-Goals And Guardrails

The following must NOT change during visual parity work:

- **Protocol rules**: Do not change `src/domain/parser.ts` protocol rules.
- **Timestamps**: Do not add timestamps to the protocol or WebSocket messages.
- **Seek/rewind/progress**: Do not add seek, rewind, or progress sliders.
- **Repository readers**: Do not add local filesystem or git repository readers.
- **User-facing flags**: Do not add new CLI flags or URL parameters without explicit approval.
- **WebSocket semantics**: Do not change WebSocket source semantics.
- **Architecture**: Do not replace PixiJS or the VSA/slice structure.

Allowed work is limited to:
- Layout and simulation constants
- Camera framing and easing
- Renderer styling and effects
- Visual fixtures and tests
- Performance optimizations

## Gource Reference Behaviors

Visual parity checklist grounded in Gource source concepts:

| Gource Source | Concept | Required Blossom Change |
|---|---|---|
| `dirnode.cpp` | Directory physics, file ring placement, area-based radii, spline edges | Replace generic force layout with branch-and-leaf tree organization |
| `file.cpp` | File pawn size, touch flash, delete fade, local ring motion | Draw Gource-sized file pawns instead of 3px circles; add flash/fade |
| `user.cpp`, `action.cpp` | User speed, action activation (distance-based), beam fading, idle fade | Fix activation=compare user-to-file distance; match action rates; add idle fade |
| `zoomcamera.cpp`, `gource.cpp` | Camera fit, bounds selection, destination easing, render order, bloom, shadows | Port ZoomCamera easing; add bounds selection; match render layer order |

## Current Blossom Visual Gaps

Observed mismatches vs Gource:

1. **Action activation delayed**: User activation compares position to itself via callback, not user-to-file distance. Actions wait until max lag.
2. **Directory nodes are filled circles**: Should be mostly invisible branch structure with spline edges.
3. **Edges are straight thin lines**: Should be thick curved Bezier splines with shadow.
4. **Files are tiny generic dots (3px)**: Should be Gource-sized file pawns (8px diameter) arranged in rings.
5. **Users are small circles (7px)**: Should be textured avatar-like pawns (20px) with shadows and fade.
6. **Starfield/particles/glow are non-Gource**: Background should be plain dark, bloom should be deterministic.
7. **Camera lacks bounds selection and auto-rotation**: Uses loose follow with momentum, not ZoomCamera destination-based easing.
8. **Render order differs**: Layer stack and shadow pass differ from Gource.

## Execution Order

Dependency order for implementation:

1. Add fixtures and config (done in L1)
2. Fix action activation before tuning user motion
3. Replace directory radii before file ring placement
4. Add spline data before curved rendering
5. Remove starfield before screenshot baselines
6. Implement camera bounds before auto-rotation
7. Measure performance before adding any spatial index

## Baseline Verification

Ran `npm test` before any visual parity code changes:
- 11 test files, 132 tests passed
- `npm run typecheck` passes
- `npm run build` succeeds
- No pre-existing failures to document

## Reviewer Evidence

### Preserved Protocol Constraints
- Log format: `username|action|path[|colour]` unchanged
- WebSocket semantics unchanged
- No timestamps added to protocol
- No seek/rewind/progress controls added
- No repository readers or user-facing flags added
- PixiJS v8 and VSA/slice structure preserved

### Gource Visual Features Matched
1. **Tree Organization**: Area-based directory radii, multi-ring file placement, local-coordinate file movement, Gource-style directory forces with parent gravity, separation, overlap repulsion, grandparent bias, and sibling spacing
2. **Snappiness**: Action activation by user-to-file distance (beamDistance threshold), burst-rate action progress, forced-lag activation, user motion with approach/retreat zones, speed clamp, and friction
3. **Camera**: Bounds selection (directory bounds / active-user bounds), ZoomCamera-style destination-based easing with no-overshoot clamp, auto-rotation for narrow trees
4. **Rendering**: Plain dark background (#1a1a1a), curved Bezier-spline branches with shadow strips, document-pawn files with shadow, avatar-pawn users with highlight, tapered-quad action beams with fading, deterministic bloom via BlurFilter on additive layer, idle fade for users, label timing
5. **Performance**: Fixed-step simulation with max-frame-dt clamp

### Remaining Differences
- No starfield or random particles (removed per Gource parity)
- No custom GLSL shaders (BlurFilter-based bloom is acceptable)
- No spatial index (O(n²) verified acceptable for test fixtures)
- Playwright e2e screenshots not automated (requires browser environment)

### Verification Results
- 164 tests pass (12 test files)
- TypeScript compiles with no errors
- Vite build produces valid production bundle
- Branch: `blossom-gource-visual-parity`

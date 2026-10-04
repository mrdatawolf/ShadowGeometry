# Shadow Geometry — 2D → 2.5D → 3D Interactive Spec

## Context

`rundown.txt` in this folder is a chat log where a hexagonal "six forces"
cosmology was developed: six nodes arranged on a hexagon, three primal
(A, B, C) and three derived as pairwise sums (D = A+B, E = B+C, F = C+A).
The chat then explored a "2.5D" extension where every visible node secretly
hides a counterpart node on an axis perpendicular to the plane (A/A', etc.),
and hinted at a seventh pair — G = A+B+C and its hidden counterpart G' — for
which the flat plane had no room at all.

`6f_2d.svg` and `6f_2.5d.svg` are the flat renderings of those two stages.

This spec extends that work into an interactive page with three stages:
flat hexagon → 2.5D hidden-layer → full 3D icosahedron, plus a slicing/shadow
tool in stage 3 that shows the 2D "laws" are an accident of viewing angle.
A true 4D (tesseract-style) stage is intentionally **out of scope** for this
pass — don't build toward it, but don't design the data model in a way that
would make adding it later painful either.

## Tech stack / file layout

Static, no-build-step page. three.js loaded from a CDN (e.g.
`unpkg.com/three@<version>/build/three.module.js` + `OrbitControls` from the
same CDN's examples path). Everything lives in this folder so the source
material and the interactive version stay together:

```
Samples/Chris_FASERIP/
  index.html              page shell: canvas, stepper controls, side panel, label/slice editor
  app.js                  stage state machine, three.js scene, transitions, camera
  geometry.js             node + edge data model, icosahedron vertex coordinates
  labels.js               label/slice config loading, localStorage merge, export/import
  style.css
  labels.default.json     placeholder display names for the 14 points
  slices.default.json     shipped slice bookmarks (can start as an empty array)
  6f_2d.svg                (existing, reference only, do not modify)
  6f_2.5d.svg              (existing, reference only, do not modify)
  rundown.txt              (existing, reference only, do not modify)
```

Use ES modules directly in the browser (`<script type="module">`), no bundler,
no package.json — it must be runnable by double-clicking/serving `index.html`
with nothing else installed.

## Data model (`geometry.js`)

14 points, referenced everywhere by stable internal **id**, never by display
label (labels are data, loaded separately — see "Labels" below):

| id      | family     | layer   | pair id |
|---------|------------|---------|---------|
| a       | primal     | visible | aPrime  |
| b       | primal     | visible | bPrime  |
| c       | primal     | visible | cPrime  |
| d       | derived    | visible | dPrime  |
| e       | derived    | visible | ePrime  |
| f       | derived    | visible | fPrime  |
| g       | synthesis  | visible | gPrime  |
| aPrime  | primal     | hidden  | a       |
| bPrime  | primal     | hidden  | b       |
| cPrime  | primal     | hidden  | c       |
| dPrime  | derived    | hidden  | d       |
| ePrime  | derived    | hidden  | e       |
| fPrime  | derived    | hidden  | f       |
| gPrime  | synthesis  | hidden  | g       |

`d = a+b`, `e = b+c`, `f = c+a`, `g = a+b+c` (and the primed mirror of each).

### Edge groups

Tag every edge with a group so stages/transitions can turn groups on and off:

- `hexRing` (6): a-d, d-b, b-e, e-c, c-f, f-a
- `triangles` (6): a-b, b-c, c-a, d-e, e-f, f-d
- `hexRingHidden` / `trianglesHidden` (12): same two groups, primed ids
- `dualityAxes` (7): a-aPrime, b-bPrime, c-cPrime, d-dPrime, e-ePrime,
  f-fPrime, g-gPrime
- `synthesis` (6): g-a, g-b, g-c, gPrime-aPrime, gPrime-bPrime, gPrime-cPrime
- `icosahedronExtra` (remainder): place a, b, c, d, e, f, aPrime..fPrime at
  the 12 vertices of a regular icosahedron such that each visible/hidden pair
  (a/aPrime, etc.) occupies a true antipodal vertex pair. Enumerate the
  icosahedron's actual 30 edges; every edge not already covered by
  `hexRing`/`triangles`/their hidden mirrors falls into this group. These are
  the "new" connections stage 3 reveals that didn't exist in the flat model.
  Document the chosen vertex-to-id assignment in a code comment since it's a
  judgment call — just keep it consistent (antipodal = visible/hidden dual).

## Stages

**Stage 1 — Flat hexagon.** Render `a..f` only (no g/g') at the regular-hexagon
layout from `6f_2.5d.svg` (reuse those coordinates). Edges: `hexRing` +
`triangles`. Side panel: static text — A, B, C are primal; D = A+B, E = B+C,
F = C+A.

**Stage 2 — 2.5D hidden layer.** Each visible node gets a translucent hidden
twin on a dashed vertical axis above it (reuse the `6f_2.5d.svg` layout).
Edges: stage 1's edges + `hexRingHidden` + `trianglesHidden` + `dualityAxes`
(only the 6 a-aPrime..f-fPrime, not g-gPrime yet). Optionally render a faint,
unlabeled marker at the center hinting at g/g' (low opacity, not interactive,
no edges) — a foreshadowing detail, not a functional node yet. Side panel:
static text — the "Hidden Vertex Within Every Vertex" passage (six forces
become twelve, not by adding points but because every point secretly
contained another).

**Stage 3 — Icosahedron.** All 14 points at their true 3D positions (12
icosahedron vertices + g/g' near the centroid, offset from each other along
the main axis by a small amount — close enough to visually blur into "one
point" from most angles). Edges: everything from stage 2 plus `synthesis`
plus `icosahedronExtra`, revealed in two waves after the fold animation
settles (see Transitions). Side panel becomes **live** — see "Slice/shadow"
below, replacing the static text panel used in stages 1-2.

## Transitions

**1 → 2:** each of the 6 visible nodes spawns its translucent hidden twin,
animating it outward along the dashed depth axis (position tween, maybe
250-400ms, staggered slightly per node so it doesn't read as one flat pop).

**2 → 3:** the two flat layers rotate/fold into the icosahedron's true vertex
positions (position tween on all 12 outer points simultaneously). Once
settled:
1. Wave 1 — fade in the edges that map to already-familiar relationships
   (`hexRing`, `triangles`, their hidden mirrors, `dualityAxes`) at their new
   3D positions, if not already visible.
2. Wave 2 — fade in `icosahedronExtra` edges one at a time (small stagger,
   e.g. 80-150ms apart) — these are new, previously nonexistent connections.
3. Fade in g and g' at the centroid, then `synthesis` and the g-gPrime
   duality edge last.

A Prev/Next stepper (buttons, not scroll-jacking) drives stage changes and
plays the transition in the appropriate direction. Going backward reverses
the same animation, it does not hard-cut.

## Stage 3 slice/shadow tool

Stage 3's side panel is a live orthographic projection ("shadow") of all 14
points onto a plane perpendicular to the current camera view direction,
redrawn every frame (or on camera-change) as the user orbits. Render it
either as:
- a literal ground-plane shadow in the three.js scene (project each point
  onto a fixed plane beneath the icosahedron using the current view
  direction, draw dots/lines there in the same colors as the 3D nodes), or
- a synced flat 2D canvas/SVG panel showing the same projected coordinates.

Either is acceptable — pick whichever is less code; the ground-plane shadow
is the more literal realization of "shadow" but the 2D panel is simpler and
equally legible. Labels follow the projected dots. The point of this feature
is purely visual/didactic: rotating the solid changes which vertices
coincide and which edges cross, demonstrating that the "laws" a 2D observer
would infer depend on viewing angle, not just on the structure itself.

### Bookmarkable slice angles

- A "Save this angle" control captures the current camera orientation
  (e.g., azimuth/elevation or quaternion) plus a user-entered name and stores
  it as a slice bookmark (see Labels/localStorage below).
- A list of saved bookmarks lets the user click one to animate the camera to
  that saved orientation (tween, not an instant cut).
- Bookmarks can be renamed and deleted from the same list.

## Labels, slices, and persistence (`labels.js`)

Two config shapes, both shipped as default JSON files and both editable at
runtime:

```json
// labels.default.json
{ "a": "A", "b": "B", "c": "C", "d": "D", "e": "E", "f": "F", "g": "G",
  "aPrime": "A′", "bPrime": "B′", "cPrime": "C′", "dPrime": "D′",
  "ePrime": "E′", "fPrime": "F′", "gPrime": "G′" }
```

```json
// slices.default.json
[]
```
(each entry, once saved: `{ "id": "...", "name": "...", "camera": {...}, "createdAt": "..." }`)

**Load order:** fetch the shipped defaults, then read a localStorage key
(e.g. `sixForces.overrides`) and merge it on top (localStorage values win
per-key for labels; slice bookmarks from localStorage are appended to the
shipped list). All rendering/panel code must look up display text through a
single `getLabel(id)` function — never hardcode letter strings anywhere in
`geometry.js` or `app.js`.

**Editing UI:** an inline rename control for each of the 14 labels (a simple
list of text inputs is fine — this doesn't need to be fancy). Writes go to
localStorage immediately, not the shipped JSON files.

**Export:** a button that serializes the current merged state
(`{ labels, slices }`) to a timestamped JSON file download
(`six-forces-export-YYYY-MM-DD.json`). This file is what later gets copied
back into `labels.default.json` / `slices.default.json` in the repo to
promote a user's naming session into the shipped defaults.

**Import:** a button (file input) that loads a previously exported JSON file
and overwrites the current localStorage state (ask for confirmation since
it replaces in-progress edits).

## Explicit non-goals for this pass

- No 4D/tesseract stage. Don't build it, don't add UI for it, but don't
  paint the data model into a corner that would make adding a 15th/16th
  point painful later (it shouldn't be, given the id/group structure above).
- No backend/server and no automatic write-back from the browser to the repo
  files — export is a manual download; importing it into the shipped config
  files is a manual follow-up step, not something this page does itself.
- No build tooling (webpack/vite/etc.) — plain ES modules + CDN three.js.

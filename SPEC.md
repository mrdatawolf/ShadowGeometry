# Shadow Geometry — Interactive Spec

## Mathematical foundation

Every vertex in this project lives in **4D space** and is projected down into
3D (and ultimately 2D screen pixels) via a perspective divide on the fourth
coordinate w.

**Golden ratio:**
```
φ = (1 + √5) / 2  ≈ 1.618
```

**4D → 3D projection** (implemented in `tesseract.js`):
```
w′ = z·sin θ + w·cos θ       rotate the 4th axis into view
z′ = z·cos θ − w·sin θ
scale = focal / (focal − w′)  perspective divide on w
output = (x·scale, y·scale, z′·scale)
```
`focal = 2.5`. The slider on the 4D tab controls θ.

The visible and hidden layers are separated along the w-axis — they are not
simply two copies offset in 3D; the offset lives in the dimension the 3D
camera cannot point to directly:

| System    | Visible layer w | Hidden layer w |
|-----------|-----------------|----------------|
| Greater   | +1/φ            | −1/φ           |
| Multiverse| +1              | −1             |

The 3D views (3D tab, Stereo tab) hold θ fixed; the 4D tab lets the user
rotate θ and watch the visible/hidden layers interchange.

## World toggle (header)

A segmented two-button toggle in the page header switches between the two
geometry systems:

- **Greater · 6-point** — icosahedron / hexagonal system (14 nodes)
- **Multiverse · 4-point** — cube / dual-tetrahedra system (8 nodes)

The active button is highlighted (blue tint for Greater, amber for
Multiverse). Switching worlds swaps the view-mode tab row to the tabs for
that world and restores the last-used view within it. Each button carries
`aria-pressed` for accessibility.

## Data models (`geometry.js`)

### Greater — 14 nodes

| id      | family    | layer   | pair id |
|---------|-----------|---------|---------|
| a       | primal    | visible | aPrime  |
| b       | primal    | visible | bPrime  |
| c       | primal    | visible | cPrime  |
| d       | derived   | visible | dPrime  |
| e       | derived   | visible | ePrime  |
| f       | derived   | visible | fPrime  |
| g       | synthesis | visible | gPrime  |
| aPrime  | primal    | hidden  | a       |
| bPrime  | primal    | hidden  | b       |
| cPrime  | primal    | hidden  | c       |
| dPrime  | derived   | hidden  | d       |
| ePrime  | derived   | hidden  | e       |
| fPrime  | derived   | hidden  | f       |
| gPrime  | synthesis | hidden  | g       |

Relationships: `d = a+b`, `e = b+c`, `f = c+a`, `g = a+b+c` (primes mirror each).

3D positions: the 12 outer nodes sit at the vertices of a regular icosahedron
using golden-ratio coordinates (e.g. `[0, 1, φ]`, `[1, φ, 0]`, `[φ, 0, 1]`
and their sign variants). g/g′ sit near the centroid, offset slightly along
the main axis. The 4D w-values place visible nodes at `w = +1/φ` and hidden
nodes at `w = −1/φ`.

#### Edge groups (Greater)

- `hexRing` (6): a-d, d-b, b-e, e-c, c-f, f-a
- `triangles` (6): a-b, b-c, c-a, d-e, e-f, f-d
- `hexRingHidden` / `trianglesHidden` (12): same groups, primed ids
- `dualityAxes` (7): a-aPrime, b-bPrime, c-cPrime, d-dPrime, e-ePrime,
  f-fPrime, g-gPrime
- `synthesis` (6): g-a, g-b, g-c, gPrime-aPrime, gPrime-bPrime, gPrime-cPrime
- `icosahedronExtra`: all remaining icosahedron edges not covered above

### Multiverse — 8 nodes

Four element pairs forming a cube, with two inscribed tetrahedra (one
visible, one hidden):

| id      | layer   | pair id  |
|---------|---------|----------|
| b       | visible | bPrime   |
| c       | visible | cPrime   |
| d       | visible | dPrime   |
| f       | visible | fPrime   |
| bPrime  | hidden  | b        |
| cPrime  | hidden  | c        |
| dPrime  | hidden  | d        |
| fPrime  | hidden  | f        |

3D positions: cube vertices at `(±1, ±1, ±1)` with even sign-product for
visible nodes and odd for hidden nodes. The 4D w-values place visible at
`w = +1` and hidden at `w = −1`.

## View tabs

Both worlds expose four tabs: **2D · 3D · Stereo · 4D**.

**2D** — Orthographic flat projection with a live shadow canvas. The shadow
redraws as the user orbits, showing that the "laws" a 2D observer infers
depend on viewing angle. A bookmarking system saves named camera angles.

**3D** — OrbitControls three.js scene. Primal/derived/synthesis edges
colour-coded. The stage stepper (Prev/Next) within the Greater 3D view
animates through three narrative stages:
1. Flat hexagon (a–f, hexRing + triangles edges)
2. Hidden layer revealed (primed twins + dualityAxes)
3. Full icosahedron (all edges + g/g′)

**Stereo** — Cross-eyed stereoscopic pair. Camera separation and image
spacing are adjustable. Bookmarks are shared with the 3D view.

**4D** — The shape rotates through the fourth dimension via a θ slider or
auto-rotate. As θ increases the visible and hidden layers swap, making the
4D structure legible to a 3D viewer for the first time.

## Labels and persistence (`labels.js`)

14 (or 8) display names loaded from a shipped JSON default, then merged with
localStorage overrides. All rendering code calls `getLabel(id)` — never
hardcodes letter strings. An inline editor lets users rename nodes; exports
serialize to a timestamped JSON download; imports reload from a previously
exported file (with confirmation).

## Tech stack

Static, no-build-step page. Three.js and OrbitControls loaded from CDN.
Plain ES modules (`<script type="module">`). No bundler, no package.json.

```
index.html     page shell, toggle, tab navs, panel markup
app.js         world/view state machine, three.js scenes, transitions
geometry.js    vertex coordinates (4D), edge groups, projection helpers
tesseract.js   4D viewer — θ rotation, perspective projection to 3D
stereo.js      stereoscopic camera pair utilities
style.css
```

# ShadowGeometry

[![Verify](https://github.com/mrdatawolf/ShadowGeometry/actions/workflows/verify.yml/badge.svg)](https://github.com/mrdatawolf/ShadowGeometry/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An interactive page exploring a hexagonal "six forces" cosmology as it unfolds
from a flat hexagon into a 3D icosahedron, plus a shadow/slicing tool that
shows how the flat hexagon's "laws" are an accident of viewing angle. See
[SPEC.md](SPEC.md) for the full design spec and background.

## Table of contents

- [Getting started](#getting-started)
- [Usage](#usage)
  - [2D and 3D views](#2d-and-3d-views)
  - [Vertex colors and labels](#vertex-colors-and-labels)
  - [Edge reveal](#edge-reveal)
  - [Shadow panel](#shadow-panel)
  - [Vertex snapping](#vertex-snapping)
  - [Camera bookmarks](#camera-bookmarks)
  - [Cross-eyed stereo tab](#cross-eyed-stereo-tab)
  - [The fourth view (4D tab)](#the-fourth-view-4d-tab)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Specification judgment calls](#specification-judgment-calls)
- [License](#license)

## Getting started

No build, package installation, or backend is required. The browser loads
three.js 0.170.0 and OrbitControls from jsDelivr, so internet access is
needed.

```sh
python serve.py
```

Then visit `http://localhost:8000/` (pass a different port as an argument if
8000 is busy).

Plain `python -m http.server` often serves `.js` as `text/plain` on Windows
because it reads the MIME type from the system registry, and browsers refuse
to load that as an ES module; `serve.py` overrides the MIME map before
serving so this doesn't come up.

> **Note:** Browsers generally block plain ES modules from `file://` URLs, so
> opening `index.html` directly (double-clicking it) isn't reliably
> supported. The page shows a startup message explaining how to serve it, and
> falls back to inline label defaults if JSON fetching fails in a browser
> that allows local modules.

## Usage

### 2D and 3D views

Use the header's 2D and 3D tabs to move directly between the flat hexagon and
the 3D solid. The canvas has no separate stage title/navigation strip, and
the 2.5D hidden-layer stage has been removed. In the 3D view, drag to orbit;
the side panel projects the same geometry onto the camera's perpendicular
plane. Both views show the twelve outer vertices; synthesis points are
absent.

The 3D opening silhouette retains the flat clockwise order a–d–b–e–c–f, with
`a` at the top. `aPrime` is directly behind `a`; `ePrime` is directly behind
`e`. The other four primed corners occupy the two interior projected
positions: `bPrime` in front of `dPrime` on the right, `cPrime` in front of
`fPrime` on the left. The regular solid uses a corrected ID-to-corner
assignment, so logical pairs no longer have to be antipodal. The flat view
keeps its front-facing camera and rotates into the 3D angle during the fold;
positions interpolate in the viewing plane so the original ring stays convex
and keeps its order throughout. No intermediate hidden-layer view or depth
axes are shown.

### Vertex colors and labels

Each of the twelve vertices has its own stable color across the flat, solid,
shadow, and stereo views. Primed partners use complementary hues (180 degrees
apart) at equal saturation and lightness so both remain visible on black.
Labels and editor IDs use the corresponding vertex colors, and ring/triangle
line colors continue to describe their relationships.

### Edge reveal

The opening draws only the original hexRing and two visible triangles. Primed
ring/triangle connections and all 18 additional physical outer edges stay
hidden until a user orbit moves at least 0.5 degrees away from home; they
then reveal with a 95ms stagger. Clicking without movement, idle time, and
recalling bookmarks do not initiate this reveal. Returning to the flat view
fades revealed extras back out, and entering 3D again resets the reveal.

Nearer opaque vertices hide rear vertices with overlapping projected centers,
including their labels and shadow dots. All twelve nodes are opaque once the
fold settles. At the home angle, eight distinct vertices remain visible;
`aPrime`, `ePrime`, `dPrime`, and `fPrime` are occluded. Orbiting can reveal
them again. While orbiting, both view backgrounds stay black.

### Shadow panel

The shadow projects the same points as the 3D scene, following its camera
orientation and snapping. Its lines show only the convex outer silhouette.
With six silhouette corners, it adds two triangles on alternating corners,
styled like the flat view: solid blue and dashed red. The first triangle
starts at the highest corner, choosing the leftmost when two top corners
share a height; the second uses the three remaining corners. Triangle
corners are determined by the current shadow shape, independently of fixed
3D IDs.

Other silhouette shapes show only the outer ring. Six-corner shadows display
only the six outline dots and labels, hiding all interior vertices so the
diagram matches the flat view. Other shapes retain their visible interior
dots and labels, subject to the same occlusion rules. This affects only the
shadow panel; interior vertices remain in the 3D solid.

The outer border of the 3D viewer is green for an aligned six-corner
silhouette, yellow for a ten-corner silhouette, and its normal neutral color
otherwise. These are silhouette corner counts, not counts of distinct dots:
the regular solid does not project to exactly six or ten distinct vertices.
Shape detection uses a small fixed projection tolerance, independently of the
adjustable snap distance. Green requires four front/back vertex pairs to
coincide within 0.01 world units in projection (roughly half a pixel in the
shadow), as well as a six-corner outline; it checks rear vertices too, even
though their dots and labels are hidden. A hexagonal-looking outline with no
aligned vertices keeps a neutral border.

### Vertex snapping

Vertex snapping is enabled by default and can be toggled in the shadow panel.
The snap-distance slider ranges from 4 to 80 screen pixels (default 18); its
Default button restores 18 pixels and saves the preference.

After you release an orbit drag and the camera settles, a pair within the
chosen distance and 15 degrees of exact alignment attracts the camera. A
320ms rotation places the two projected dots exactly over one another. This
applies to all 12 active points, preserves the regular solid, and updates the
shadow with the same view. Dragging again releases the alignment. Saving an
angle captures the snapped camera orientation, and recalling bookmarks keeps
their saved angle.

Snap distance and the enabled toggle save immediately to browser
localStorage. Exports include
`preferences: { snapEnabled, snapDistancePixels, stereoSeparationDegrees, stereoLabelsEnabled }`
alongside `labels` and `slices`; importing restores them after confirmation.
Older exports without preferences use the defaults (snapping enabled, 18
pixels).

### Camera bookmarks

Save, recall, rename, or delete camera bookmarks. Expand the editor to change
the 12 active names. Stored synthesis names remain in exports for
compatibility. Changes persist in browser storage. Export downloads the
merged labels and slices; Import validates the file and confirms
replacement.

### Cross-eyed stereo tab

Select **Cross-eyed stereo** to open a separate 3D-only viewer. The right-eye
camera is shown on the left and the left-eye camera on the right. Cross your
eyes until the two models form a middle image; the small matching plus signs
help with alignment. Drag either half to orbit both cameras together.

Image spacing sets the fixed center-to-center distance in em (8–40, default
29), independently of the depth angle. Orbiting does not change that
distance. On narrow screens the spacing is capped to half the available
viewport width so the models fit within their halves. There is no center
divider. Captions and alignment marks follow the fixed centers. Spacing
saves locally and in exports, and its Default button restores 29 em.

The two views use the same solid, with symmetric camera angles and matching
vertical coordinates. Geometry is duplicated visually without being
reflected or reassigned. Each eye independently hides rear vertices. The
stereo viewer starts at the familiar home orientation, reveals additional
edges on orbit, and uses the shared snapping preferences. Its green/yellow
border describes the central viewing direction. **Reset view** returns this
viewer to home. Switching tabs preserves each viewer's orientation and
pauses the hidden one.

Stereo separation adjusts the total angle between the cameras from 0 to 12
degrees (default 4). Zero shows identical images. The stereo separation
Default button restores 4 degrees and saves the preference. Labels are
optional and off by default. Both settings save immediately to localStorage
and are included in JSON exports/imports through the 3D tab. Older files use
stereo defaults.

The stereo Saved perspectives section shares bookmarks with 3D: save, visit,
rename, or delete from either tab. Visiting restores the exact central
camera position and target; both eye views follow that alignment with the
current stereo angle and spacing. Bookmark recall does not trigger edge
reveal. Shared bookmarks retain existing localStorage persistence and JSON
export/import.

### The fourth view (4D tab)

Select **4D** to open a third standalone viewer (independent of 2D/3D and
Stereo, like the stereo tab) showing a genuine fourth coordinate, not an
illustration of one. Every point keeps its existing flat-hexagon x/y/z (the
same values `flatPositions` already gave primed and unprimed partners before
the fold ever separated them) and gains a `w` of +1 if visible or -1 if
hidden. At rest this projects to the classic tesseract image: two nested
hexagons — one per `w` layer — connected corner to corner by the duality
edges. Synthesis edges and `g`/`gPrime` are rendered here, unlike the 3D tab;
`g` and `gPrime` start overlapping at the center (same as their 3D home
shadow) and visibly separate once the fourth dimension starts turning, since
both now carry opposite, non-cancelling `w`.

Drag to orbit the projected shadow in the ordinary three dimensions, exactly
like the 3D and stereo tabs. The shape also auto-rotates on its own through
the fourth dimension (the `z`/`w` plane) by default, which is what produces
the "turning inside-out" look as the two hexagons swap which one is nearer.
The **Rotate through the fourth dimension** slider lets you set that angle
directly; moving it pauses auto-rotation, and the **Auto-rotate** checkbox
resumes it from the current angle. `icosahedronExtra` edges from the 3D
icosahedron don't apply to this figure and are omitted; every other edge
group (`hexRing`, `triangles`, their hidden mirrors, `dualityAxes`,
`synthesis`) is shown. There's no snapping or saved-bookmark support on this
tab — it's orbit plus the one hyper-rotation control.

## Project structure

```
index.html              page shell: canvas, stepper controls, side panel, label/slice editor
app.js                  stage state machine, three.js scene, transitions, camera
geometry.js             node + edge data model, icosahedron vertex coordinates
labels.js               label/slice config loading, localStorage merge, export/import
stereo.js               cross-eyed stereo viewer
tesseract.js             fourth-dimension (tesseract) viewer
style.css
labels.default.json     placeholder display names for the 14 points
slices.default.json     shipped slice bookmarks
serve.py                static file server with correct ES-module MIME types
verify.cjs              browser-free verification script
SPEC.md                 full design spec and background
```

## Testing

Run the verification script if Node.js is available:

```sh
node --experimental-vm-modules verify.cjs
```

This checks module syntax, geometry invariants, the home-view projection,
and actual shadow drawing commands using a mock canvas. It verifies:

- Entry draws 6 outline dots and three closed paths (outer ring and two
  alternating triangles), regardless of the 3D edge reveal state.
- The top-left tie rule and outline-only ten-corner shadows.
- The clockwise a–d–b–e–c–f order throughout the fold and on the opening
  silhouette, with `aPrime`/`ePrime` behind `a`/`e` and four interior primed
  corners.
- Rear mesh/label/dot occlusion.
- The two-stage stepper, idle/click exclusion, orbit-triggered staggering,
  and reveal reset.
- Label persistence, bookmark editing, and import validation/confirmation.
- Unavailable storage handling.
- Crossed-eyed stereo camera ordering, matching vertical projections, two
  rendering passes, and independent eye occlusion using renderer mocks.
- The fourth-dimension data model (`vertexW`, `tesseractEdges`) and the
  rotation/perspective-projection math, including that `g` and `gPrime`
  coincide at rest and separate once rotated through `w`.

It does not perform a WebGL/browser rendering test — human stereo fusion and
actual WebGL rendering require checking the page in a browser. The reference
SVGs and `rundown.txt` are unchanged by this script.

This check also runs automatically on push and pull request via
[GitHub Actions](.github/workflows/verify.yml).

## Specification judgment calls

- Preserve the exact circle coordinates of `6f_2.5d.svg`, despite its hexagon
  not being mathematically regular. Its hidden circle at the bottom also
  disagrees with the dashed axis endpoint; the circle coordinate wins.
- Primed points unfold directly from their corresponding flat points into
  their icosahedron positions; there is no separate hidden-layer stage.
- The chosen icosahedron assignment is documented explicitly in `geometry.js`.
  Counterparts are logical pairs, rather than antipodal corners, as
  authorized by the revised opening layout. The 30 actual edges are
  enumerated deterministically by distance 2 in the standard golden-ratio
  coordinate set. Every vertex has degree 5.
- Of the 24 familiar ring/triangle relationships, 12 coincide with solid
  edges. The other 18 solid edges form `icosahedronExtra`. All familiar
  relationships are retained in the data model. Following the revised
  display request, 3D initially shows only the original unprimed
  ring/triangle layer, then reveals primed connections and additional
  physical edges after orbit input. Depth axes and synthesis points remain
  absent from 3D.
- The named ring relationships stay fixed. The corrected 3D assignment makes
  this ring the home silhouette; other angles can have different outlines.
  Additional physical edges are re-enumerated for the corrected assignment;
  there are still 18. The home camera direction is derived from a minus
  `aPrime`.
- Unrendered synthesis coordinates are offset by ±0.09 along the normalized
  home axis, so their home projections coincide if used in a later stage.
- The shadow uses the permitted synced 2D canvas rather than a ground plane.
  Camera bookmarks store position and target; recall interpolates the
  viewing direction on a sphere rather than moving through the solid.
- Persisted full slice snapshots carry `replaceSlices: true` so deleting or
  renaming a shipped bookmark survives reload and imports fully replace the
  current session. Older/local append-style data still merges with shipped
  bookmarks. Label overrides always win per ID.

## License

MIT — see [LICENSE](LICENSE).

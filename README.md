# ShadowGeometry interactive page

Open `index.html` through a static HTTP server. No build, package installation,
or backend is required. The browser loads three.js 0.170.0 and OrbitControls
from jsDelivr, so internet access is needed.

Run `python serve.py` in this directory and visit `http://localhost:8000/`
(pass a different port as an argument if 8000 is busy). Plain
`python -m http.server` often serves `.js` as `text/plain` on Windows because
it reads the MIME type from the system registry, and browsers refuse to load
that as an ES module; `serve.py` overrides the MIME map before serving so
this doesn't come up.

Browsers generally block plain ES modules from `file://` URLs. Consequently,
the spec's double-click requirement cannot be guaranteed together with its
plain external ES-module requirement. The page includes a startup message
explaining how to serve it, and inline label defaults if JSON fetching fails
in a browser that allows local modules.

Use the header's 2D and 3D tabs to move directly between the flat hexagon and
the 3D solid. The canvas has no separate stage title/navigation strip.
The 2.5D hidden-layer stage has been removed. In the 3D view, drag to orbit; the
side panel projects the same geometry onto the camera's perpendicular plane.
Both views show the twelve outer vertices; synthesis points are absent.
Each of the twelve vertices has its own stable color across the flat, solid,
shadow and stereo views. Primed partners use complementary hues (180 degrees
apart), at equal saturation and lightness so both remain visible on black.
Labels and editor IDs use the corresponding vertex colors. Ring and triangle
line colors continue to describe their relationships.
The 3D opening silhouette retains the flat clockwise order a–d–b–e–c–f,
with a at the top. aPrime is directly behind a; ePrime is directly behind e.
The other four primed corners occupy the two interior projected positions:
bPrime in front of dPrime on the right, cPrime in front of fPrime on the left.
The regular solid uses a corrected ID-to-corner assignment; logical pairs no
longer have to be antipodal. The flat view keeps its front-facing camera and
rotates into the 3D angle during the fold. Positions interpolate in the viewing
plane so the original ring remains convex and keeps its order throughout.
No intermediate hidden-layer view or depth axes are shown.
The opening draws only the original hexRing and two visible triangles. Primed
ring/triangle connections and all 18 additional physical outer edges
stay hidden until a user orbit moves at least 0.5 degrees away from home;
they then reveal with a 95 ms stagger. Clicking without movement, idle time,
and recalling bookmarks do not initiate this reveal. Returning to the flat view
fades revealed extras back out, and entering 3D again resets the reveal.
The shadow projects the same points as the 3D scene, following its camera
orientation and snapping. Its lines show only the convex outer silhouette.
With six silhouette corners, it adds two triangles on alternating corners,
styled like the flat view: solid blue and dashed red. The first triangle
starts at the highest corner, choosing the leftmost when two top corners
share a height; the second uses the three remaining corners. Triangle corners
are determined by the current shadow shape, independently of fixed 3D IDs.
Other silhouette shapes show only the outer ring. Six-corner shadows display
only the six outline dots and labels, hiding all interior vertices so the
diagram matches the flat view. Other shapes retain their visible interior
dots and labels, subject to the same occlusion rules. This affects only the
shadow panel; interior vertices remain in the 3D solid.
Nearer opaque vertices hide rear vertices with overlapping projected centers,
including their labels and shadow dots. All twelve nodes are opaque once the
fold settles. At the home angle eight distinct vertices remain visible;
aPrime, ePrime, dPrime, and fPrime are occluded. Orbiting can reveal them again.
While orbiting, both view backgrounds stay black. The outer border of the 3D
viewer is green for an aligned six-corner silhouette, yellow for a ten-corner
silhouette, and its normal neutral color otherwise. These are silhouette
corner counts, not counts of distinct dots: the regular solid does not project
to exactly six or ten distinct vertices. Shape detection uses a small fixed
projection tolerance, independently of the adjustable snap distance. Green
requires four front/back vertex pairs to coincide within 0.01 world units in
projection (roughly half a pixel in the shadow), as well as a six-corner outline.
It checks rear vertices too, even though their dots and labels are hidden.
A hexagonal-looking outline with no aligned vertices keeps a neutral border.
Save, recall, rename, or delete camera bookmarks. Expand the editor to change
the 12 active names. Stored synthesis names remain in exports for compatibility.
Changes persist in browser storage. Export downloads the merged
labels and slices; Import validates the file and confirms replacement.

## Specification judgment calls

- Preserve the exact circle coordinates of `6f_2.5d.svg`, despite its hexagon
  not being mathematically regular. Its hidden circle at the bottom also
  disagrees with the dashed axis endpoint; the circle coordinate wins.
- Primed points unfold directly from their corresponding flat points into
  their icosahedron positions; there is no separate hidden-layer stage.
- The chosen icosahedron assignment is documented explicitly in `geometry.js`.
  Counterparts are logical pairs, rather than antipodal corners, as authorized
  by the revised opening layout. The 30 actual edges are enumerated
  deterministically by distance 2 in the standard
  golden-ratio coordinate set. Every vertex has degree 5.
- Of the 24 familiar ring/triangle relationships, 12 coincide with solid
  edges. The other 18 solid edges form `icosahedronExtra`. All familiar
  relationships are retained in the data model. Following the revised display
  request, 3D initially shows only the original unprimed ring/triangle layer,
  then reveals primed connections and additional physical edges after orbit input.
  Depth axes and synthesis points remain absent from 3D.
- The named ring relationships stay fixed. The corrected 3D assignment makes
  this ring the home silhouette; other angles can have different outlines.
  Additional physical edges are re-enumerated for the corrected assignment;
  there are still 18. The home camera direction is derived from a minus aPrime.
- Unrendered synthesis coordinates are offset by ±0.09 along the normalized
  home axis, so their home projections coincide if used in a later stage.
- The shadow uses the permitted synced 2D canvas rather than a ground plane.
  Camera bookmarks store position and target; recall interpolates the viewing
  direction on a sphere rather than moving through the solid.
- Persisted full slice snapshots carry `replaceSlices: true` so deleting or
  renaming a shipped bookmark survives reload and imports fully replace the
  current session. Older/local append-style data still merges with shipped
  bookmarks. Label overrides always win per ID.

## Checks

Run `node --experimental-vm-modules verify.cjs` if Node is available. This
checks module syntax, geometry invariants, the home-view projection, and actual
shadow drawing commands using a mock canvas. Entry draws 6 outline dots and
three closed paths (outer ring and two alternating triangles), regardless of
the 3D edge reveal state. It checks the top-left tie rule and outline-only
ten-corner shadows, plus the clockwise
a–d–b–e–c–f order throughout the fold and on the opening silhouette, aPrime/ePrime
behind a/e, four interior primed corners, rear mesh/label/dot occlusion, the two-stage
stepper, idle/click exclusion, orbit-triggered
staggering, reveal reset, label persistence, bookmark editing, import
validation/confirmation, and unavailable storage.
It does not perform a WebGL/browser rendering test.

The reference SVGs and `rundown.txt` are unchanged.

## Visual attraction in 3D

Vertex snapping is enabled by default and can be toggled in the shadow panel.
The snap-distance slider ranges from 4 to 80 screen pixels (default 18).
Its Default button restores 18 pixels and saves the preference.
After you release an orbit drag and the camera settles, a pair within the chosen
distance and 15 degrees of exact alignment attracts the camera. A 320 ms rotation
places the two projected dots exactly over one another. This applies to all
12 active points, preserves the regular solid and updates the shadow with the same
view. Dragging again releases the alignment. Saving an angle captures the
snapped camera orientation, and recalling bookmarks keeps their saved angle.

Snap distance and the enabled toggle save immediately to browser localStorage.
Exports include `preferences: { snapEnabled, snapDistancePixels, stereoSeparationDegrees, stereoLabelsEnabled }` alongside
`labels` and `slices`; importing restores them after confirmation. Older exports
without preferences use the defaults (snapping enabled, 18 pixels).

## Cross-eyed stereo tab

The stereo Saved perspectives section shares bookmarks with 3D: save,
visit, rename or delete from either tab. Visiting restores the exact central
camera position and target; both eye views follow that alignment with the
current stereo angle and spacing. Bookmark recall does not trigger edge reveal.
Shared bookmarks retain existing localStorage persistence and JSON export/import.
Select **Cross-eyed stereo** to open a separate 3D-only viewer. The right-eye
camera is shown on the left and the left-eye camera on the right. Cross your
eyes until the two models form a middle image; the small matching plus signs
help with alignment. Drag either half to orbit both cameras together.
Image spacing sets the fixed center-to-center distance in em (8–40, default
29), independently of the depth angle. Orbiting does not change that distance.
On narrow screens the spacing is capped to half the available viewport width;
the models fit within their halves. There is no center divider. Captions and
alignment marks follow the fixed centers. Spacing saves locally and in exports,
and its Default button restores 29 em.

The two views use the same solid, with symmetric camera angles and matching
vertical coordinates. Geometry is duplicated visually without being reflected
or reassigned. Each eye independently hides rear vertices. The stereo viewer
starts at the familiar home orientation, reveals additional edges on orbit,
and uses the shared snapping preferences. Its green/yellow border describes
the central viewing direction. **Reset view** returns this viewer to home.
Switching tabs preserves each viewer's orientation and pauses the hidden one.

Stereo separation adjusts the total angle between the cameras from 0 to 12
degrees (default 4). Zero shows identical images. The stereo separation Default
button restores 4 degrees and saves the preference. Labels are optional and off
by default. Both settings save immediately to localStorage and are included
in JSON exports/imports through the 3D tab. Older files use stereo defaults.

The verification script also checks crossed-eye camera ordering, matching
vertical projections, two rendering passes, and independent eye occlusion
using renderer mocks. Human stereo fusion and WebGL rendering require checking
the page in a browser.

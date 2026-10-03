// IDs, rather than editable labels, define every relationship.
export const outerIds = ['a', 'd', 'b', 'e', 'c', 'f'];
const families = {a:'primal', b:'primal', c:'primal', d:'derived', e:'derived', f:'derived', g:'synthesis'};
export const nodes = Object.entries(families).flatMap(([id, family]) => [
  {id, family, layer:'visible', pairId:`${id}Prime`},
  {id:`${id}Prime`, family, layer:'hidden', pairId:id}
]);
// Synthesis IDs remain in the saved data for compatibility, but have no role
// in the current two-stage visualization.
export const activeNodes=nodes.filter(node=>node.family!=='synthesis');
// Stable identity colors: primed counterparts are 180 degrees apart on the
// hue wheel, with equal saturation/lightness for visibility on black.
const baseVertexHues={a:210,b:140,c:260,d:10,e:60,f:170};
export const vertexHues=Object.fromEntries(Object.entries(baseVertexHues).flatMap(([id,hue])=>[[id,hue],[`${id}Prime`,(hue+180)%360]]));
export const vertexColors=Object.fromEntries(Object.entries(vertexHues).map(([id,hue])=>[id,`hsl(${hue}, 72%, 68%)`]));
export const sums = {d:['a','b'], e:['b','c'], f:['c','a'], g:['a','b','c'], dPrime:['aPrime','bPrime'], ePrime:['bPrime','cPrime'], fPrime:['cPrime','aPrime'], gPrime:['aPrime','bPrime','cPrime']};
// Exact circle coordinates from 6f_2.5d.svg (the source is not quite regular).
const flat = {a:[350,140], d:[500,225], b:[500,365], e:[350,450], c:[200,365], f:[200,225]};
const hidden = {a:[350,70], d:[500,155], b:[500,295], e:[350,415], c:[200,295], f:[200,155]};
const convert = ([x,y], z=0) => [(x-350)/100, (260-y)/100, z];
export const flatPositions = Object.fromEntries(outerIds.flatMap(id => [[id,convert(flat[id])],[`${id}Prime`,convert(flat[id])]]));
export const hiddenPositions = Object.fromEntries(outerIds.flatMap(id => [[id,convert(flat[id])],[`${id}Prime`,convert(hidden[id],0.7)]]));
const phi = (1+Math.sqrt(5))/2;
// Use all twelve standard regular-icosahedron corners exactly once. The home
// silhouette is clockwise a,d,b,e,c,f, matching the flat ring. aPrime sits
// behind a, ePrime behind e. The remaining primes form two interior projected
// positions: bPrime (front)/dPrime (back) on the right, and cPrime (front)/
// fPrime (back) on the left. Pair IDs are logical counterparts, not antipodes;
// this intentionally supersedes the original spec's antipodal assignment.
export const solidPositions = {
  a:[0,1,phi], d:[-1,phi,0], b:[0,1,-phi],
  e:[phi,0,-1], c:[1,-phi,0], f:[0,-1,phi],
  aPrime:[-phi,0,1], ePrime:[0,-1,-phi],
  bPrime:[1,phi,0], dPrime:[-phi,0,-1],
  cPrime:[phi,0,1], fPrime:[-1,-phi,0]
};
// Projected a defines screen up; this viewing direction puts aPrime behind a
// and ePrime behind e while preserving the six unprimed silhouette identities.
const homeAxis=solidPositions.a.map((v,i)=>v-solidPositions.aPrime[i]);
export const solidHomeDirection=homeAxis.map(v=>v/Math.hypot(...homeAxis));
// Retained, unrendered synthesis data: both points have the same home shadow.
solidPositions.g = solidHomeDirection.map(v=>v*0.09);
solidPositions.gPrime = solidHomeDirection.map(v=>-v*0.09);
for (const positions of [flatPositions,hiddenPositions]) { positions.g=[0,0,0]; positions.gPrime=[0,0,0]; }
const ring = [['a','d'],['d','b'],['b','e'],['e','c'],['c','f'],['f','a']];
const triangles = [['a','b'],['b','c'],['c','a'],['d','e'],['e','f'],['f','d']];
const edge = (group, [from,to]) => ({id:`${group}:${from}:${to}`, group, from, to});
export const edges = [
  ...ring.map(p=>edge('hexRing',p)), ...triangles.map(p=>edge('triangles',p)),
  ...ring.map(p=>edge('hexRingHidden',p.map(id=>`${id}Prime`))),
  ...triangles.map(p=>edge('trianglesHidden',p.map(id=>`${id}Prime`))),
  ...Object.keys(families).map(id=>edge('dualityAxes',[id,`${id}Prime`])),
  ...['a','b','c'].flatMap(id=>[edge('synthesis',['g',id]),edge('synthesis',['gPrime',`${id}Prime`])])
];
const key = (a,b)=>[a,b].sort().join(':');
const familiar = new Set(edges.filter(e=>/hexRing|triangles/.test(e.group)).map(e=>key(e.from,e.to)));
export const icosahedronEdges = [];
const vertices = Object.keys(solidPositions).filter(id=>!id.startsWith('g'));
// Regular icosahedron nearest-neighbor distance is exactly 2. Iterate unique
// unordered pairs deterministically; this enumerates 30 edges, degree 5 each.
for(let i=0;i<vertices.length;i++) for(let j=i+1;j<vertices.length;j++) {
  const a=vertices[i], b=vertices[j];
  if(Math.abs(Math.hypot(...solidPositions[a].map((v,k)=>v-solidPositions[b][k]))-2)<1e-8) {
    icosahedronEdges.push([a,b]);
    if(!familiar.has(key(a,b))) edges.push(edge('icosahedronExtra',[a,b]));
  }
}

// Pick a near alignment in the viewing plane, without changing any vertices.
// Both signs of the pair direction represent the same orthographic overlap.
export function findVisualSnap(viewDirection, pixelsPerUnit, capturePixels=18, maxAngle=Math.PI/36) {
  const length=Math.hypot(...viewDirection);
  if(!length || !Number.isFinite(pixelsPerUnit) || pixelsPerUnit<=0)return null;
  const view=viewDirection.map(v=>v/length), ids=activeNodes.map(n=>n.id);
  let best=null;
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    const from=ids[i],to=ids[j];
    const delta=solidPositions[from].map((v,k)=>v-solidPositions[to][k]);
    const distance=Math.hypot(...delta);if(distance<1e-8)continue;
    let direction=delta.map(v=>v/distance);
    let dot=direction.reduce((sum,v,k)=>sum+v*view[k],0);
    if(dot<0){direction=direction.map(v=>-v);dot=-dot;}
    const angle=Math.acos(Math.min(1,dot));
    const gap=distance*Math.sin(angle)*pixelsPerUnit;
    if(angle<=maxAngle && gap<=capturePixels && (!best || angle<best.angle))best={from,to,direction,angle,gap};
  }
  return best;
}

// Entry preserves both flat ring/triangle layers. Orbiting reveals the rest
// of the physical wireframe; duality axes and synthesis remain absent.
const solidEdgeKeys=new Set(icosahedronEdges.map(([a,b])=>key(a,b)));
export const stage3Edges=edges.filter(e=>solidEdgeKeys.has(key(e.from,e.to))||/^(hexRing|triangles)(Hidden)?$/.test(e.group));

// Depth is measured toward the camera. Occlusion is shared by the 3D labels,
// meshes, and shadow dots, so rear identities never show through a front node.
export function getOccludedVertexIds(points,radius=0.095){
  const occluded=new Set(),front=[];
  for(const point of [...points].sort((a,b)=>b.depth-a.depth)){
    if(front.some(p=>p.depth>point.depth+1e-6&&Math.hypot(p.x-point.x,p.y-point.y)<=radius))occluded.add(point.id);
    else if((point.alpha??1)>=0.999)front.push(point);
  }
  return occluded;
}

// Monotone-chain silhouette in projection coordinates. Near-coincident points
// share a representative; almost-collinear corners are removed using a
// perpendicular-distance tolerance, independent of canvas size.
export function analyzeShadow(points,tolerance=0.025){
  const sorted=points.map(p=>({...p})).sort((a,b)=>a.x-b.x||a.y-b.y);
  const unique=[];
  for(const point of sorted)if(!unique.some(p=>Math.hypot(point.x-p.x,point.y-p.y)<=tolerance))unique.push(point);
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const half=list=>{const hull=[];for(const p of list){while(hull.length>=2){const a=hull[hull.length-2],b=hull[hull.length-1];if(cross(a,b,p)>tolerance*Math.hypot(p.x-a.x,p.y-a.y))break;hull.pop();}hull.push(p);}return hull;};
  let hull=unique;
  if(unique.length>2){const lower=half(unique),upper=half([...unique].reverse());hull=[...lower.slice(0,-1),...upper.slice(0,-1)];}
  let regularHexagon=false;
  if(hull.length===6){
    const center={x:hull.reduce((s,p)=>s+p.x,0)/6,y:hull.reduce((s,p)=>s+p.y,0)/6};
    const radii=hull.map(p=>Math.hypot(p.x-center.x,p.y-center.y));
    const sides=hull.map((p,i)=>Math.hypot(p.x-hull[(i+1)%6].x,p.y-hull[(i+1)%6].y));
    const even=values=>{const average=values.reduce((a,b)=>a+b,0)/values.length;return average>1e-8&&values.every(v=>Math.abs(v-average)/average<=0.08);};
    regularHexagon=even(radii)&&even(sides);
  }
  return {hull,corners:hull.length,kind:regularHexagon?'hexagon':hull.length===10?'ten':'other'};
}

// The shadow's triangles describe its current silhouette, rather than fixed
// 3D relationships. Start at the uppermost corner; tied heights choose left.
// y is measured upward in the viewing plane, before canvas coordinates invert it.
export function getShadowDiagram(points,tolerance=0.025){
  const shape=analyzeShadow(points,tolerance);
  if(!shape.hull.length)return {...shape,ring:[],triangles:[]};
  const top=Math.max(...shape.hull.map(p=>p.y));
  const anchor=shape.hull.filter(p=>top-p.y<=tolerance).sort((a,b)=>a.x-b.x)[0];
  const at=shape.hull.indexOf(anchor),ring=[...shape.hull.slice(at),...shape.hull.slice(0,at)];
  const triangles=ring.length===6?[[ring[0],ring[2],ring[4]],[ring[1],ring[3],ring[5]]]:[];
  return {...shape,ring,triangles};
}

// Color feedback describes actual alignment, not just a hexagonal-looking
// hull. A regular icosahedron's aligned six-corner view has four overlapping
// front/back pairs (eight projected positions). Use all vertices, including
// occluded rear points, and a sub-pixel tolerance independent of snap capture.
export function getShadowAlignment(points,corners,tolerance=0.01){
  let alignedPairs=0;
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
    const a=points[i],b=points[j];
    if(Math.abs(a.depth-b.depth)>1e-6&&Math.hypot(a.x-b.x,a.y-b.y)<=tolerance)alignedPairs++;
  }
  return {alignedPairs,kind:corners===6&&alignedPairs>=4?'hexagon':corners===10?'ten':'other'};
}

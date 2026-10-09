import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {StereoViewer} from './stereo.js';
import {TesseractViewer} from './tesseract.js';
import {activeNodes,vertexColors,edges,flatPositions,solidPositions,solidHomeDirection,sums,findVisualSnap,getShadowDiagram,getShadowAlignment,getOccludedVertexIds,greaterVertexW,multiverseNodes,cubePositions,cubeEdges,multiverseVertexW,squarePositions,squareEdges,cubeHomeDirection} from './geometry.js';
import {loadConfig,getLabel,getSlices,getPreferences,setPreferences,subscribe,renameLabel,saveSlice,renameSlice,deleteSlice,exportConfig,importConfig,persistenceMessage} from './labels.js';

const $=id=>document.getElementById(id);
const colors={primal:'#78aaff',derived:'#f19886',synthesis:'#e5d18c'};
const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
const phase=(t,start,duration)=>smooth((t-start)/duration);
const extraEdges=edges.filter(e=>e.group==='icosahedronExtra');
// The fold and user-triggered reveal have separate clocks. Neither stage entry
// nor a bookmark camera tween can start the extra-edge clock.
const FOLD_END=900, SOLID_END=1150, EXTRA_STEP=95;
const EXTRA_END=(extraEdges.length-1)*EXTRA_STEP+200;
let stage=1, solidTime=0, transition=null, cameraTween=null;
let extraTime=0,extraRevealed=false,orbitGesture=false;
let snapPending=false,settledFrames=0;
const lastView=new THREE.Vector3();
const orbitStartView=new THREE.Vector3();
let scene,camera,renderer,controls;
let activeView='flat',requestedStage=1,stereoViewer,tesseractViewer;
let activeWorld='multiverse',activeMvView='mv-flat',mvTesseractViewer,mvStereoViewer;
const objects=new Map(), lines=new Map();
const viewport=$('viewport');
const vector=a=>new THREE.Vector3(...a);
const flatHomePosition=new THREE.Vector3(0,-0.15,8),flatHomeTarget=new THREE.Vector3(0,-0.15,0);
const homeTarget=new THREE.Vector3(0,0,0),homePosition=vector(solidHomeDirection).multiplyScalar(8);
// In the home view the projected primal top vertex sets screen up. This roll
// keeps the opening outer ring in its original clockwise order.
const homeUp=vector(solidPositions.a).addScaledVector(vector(solidHomeDirection),-vector(solidPositions.a).dot(vector(solidHomeDirection))).normalize();
const homeRight=homeUp.clone().cross(vector(solidHomeDirection)).normalize();

export function getFoldCameraUp(fold){
  const target=flatHomeTarget.clone().lerp(homeTarget,fold);
  const view=flatHomePosition.clone().lerp(homePosition,fold).sub(target).normalize();
  const top=vector(flatPositions.a).lerp(vector(solidPositions.a),fold).sub(target);
  // Follow the projected top vertex throughout the fold, so a stays upright
  // rather than temporarily drifting sideways as the camera turns.
  return top.addScaledVector(view,-top.dot(view)).normalize();
}

export function getFoldPosition(id,fold){
  if(fold<=0)return vector(flatPositions[id]);
  if(fold>=1)return vector(solidPositions[id]);
  const target=flatHomeTarget.clone().lerp(homeTarget,fold);
  const view=flatHomePosition.clone().lerp(homePosition,fold).sub(target).normalize();
  const up=getFoldCameraUp(fold),right=up.clone().cross(view).normalize();
  const start=vector(flatPositions[id]).sub(flatHomeTarget),end=vector(solidPositions[id]);
  // Interpolate in the viewing plane, not across unrelated world axes. Each
  // unprimed point retains its place in the ring while depth unfolds beneath it.
  return target.addScaledVector(right,THREE.MathUtils.lerp(start.x,end.dot(homeRight),fold))
    .addScaledVector(up,THREE.MathUtils.lerp(start.y,end.dot(homeUp),fold))
    .addScaledVector(view,THREE.MathUtils.lerp(start.z,end.dot(vector(solidHomeDirection)),fold));
}

function setup(){
  scene=new THREE.Scene();scene.background=new THREE.Color('#171f2b');
  camera=new THREE.OrthographicCamera(-4,4,3,-3,0.01,100);
  camera.position.copy(flatHomePosition);camera.lookAt(flatHomeTarget);
  renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  viewport.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','Three-dimensional six forces model');
  configureControls(flatHomeTarget);
  const sphere=new THREE.SphereGeometry(0.095,20,14);
  for(const node of activeNodes){
    const mesh=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color:vertexColors[node.id],depthWrite:true}));
    scene.add(mesh);
    const label=document.createElement('span');label.className='point-label';label.style.color=vertexColors[node.id];label.textContent=getLabel(node.id);$('point-labels').append(label);
    objects.set(node.id,{mesh,label,node,alpha:0});
  }
  for(const edge of edges){
    if(!objects.has(edge.from)||!objects.has(edge.to))continue;
    const dashed=edge.group==='dualityAxes'||edge.group.endsWith('Hidden')||(edge.group==='triangles' && objects.get(edge.from).node.family==='derived');
    const color=edge.group==='icosahedronExtra'?'#b5d8ce':edge.group==='synthesis'?colors.synthesis:edge.group==='dualityAxes'?'#a1aec3':edge.group.startsWith('hexRing')?'#69778d':colors[objects.get(edge.from).node.family];
    const material=dashed?new THREE.LineDashedMaterial({color,transparent:true,dashSize:0.07,gapSize:0.05,depthWrite:false}):new THREE.LineBasicMaterial({color,transparent:true,depthWrite:false});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
    const line=new THREE.Line(geometry,material);scene.add(line);lines.set(edge.id,{line,edge,alpha:0,color});
  }
  new ResizeObserver(resize).observe(viewport);resize();
  $('boot-message').hidden=true;
}
function configureControls(target){
  // OrbitControls caches the camera-up basis. Recreate after a fold changes
  // that basis, rather than leaving the first user drag with stale axes.
  controls?.dispose();
  controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(target);
  controls.enableDamping=true;controls.enablePan=false;controls.enableZoom=false;controls.enabled=stage===2&&!transition;
  controls.addEventListener('start',()=>{cameraTween=null;controls.enableDamping=true;orbitGesture=stage===2&&!transition;orbitStartView.copy(camera.position).sub(controls.target).normalize();snapPending=false;settledFrames=0;$('snap-status').textContent='Release a drag near an overlap to snap the view.';});
  controls.addEventListener('end',()=>{maybeRevealExtras();orbitGesture=false;snapPending=true;settledFrames=0;lastView.copy(camera.position).sub(controls.target).normalize();});
}
function resize(){
  const w=viewport.clientWidth,h=viewport.clientHeight;
  if(!w||!h)return;
  renderer.setSize(w,h);const halfHeight=Math.max(3,2.35*h/w);
  camera.top=halfHeight;camera.bottom=-halfHeight;camera.left=-halfHeight*w/h;camera.right=halfHeight*w/h;camera.updateProjectionMatrix();
}
function updateGeometry(){
  const fold=phase(solidTime,0,FOLD_END);
  for(const [id,obj] of objects){
    const {node,mesh,label}=obj;
    const p=getFoldPosition(id,fold);mesh.position.copy(p);
    obj.alpha=node.layer==='hidden'?fold:1;
    const translucent=obj.alpha<0.999;
    if(mesh.material.transparent!==translucent){mesh.material.transparent=translucent;mesh.material.needsUpdate=true;}
    mesh.material.opacity=obj.alpha;mesh.visible=obj.alpha>0.001;
    const projected=p.clone().project(camera);label.style.left=`${(projected.x+1)*viewport.clientWidth/2}px`;label.style.top=`${(1-projected.y)*viewport.clientHeight/2-19}px`;
    label.style.opacity=obj.alpha;label.hidden=!mesh.visible||projected.z < -1||projected.z>1;
  }
  applyVertexOcclusion();
  for(const obj of lines.values()){
    const {edge,line}=obj;
    const hiddenAlpha=edge.group==='dualityAxes'?objects.get(edge.to).alpha:Math.min(objects.get(edge.from).alpha,objects.get(edge.to).alpha);
    const alpha=getEdgeAlpha(edge,hiddenAlpha,solidTime,extraTime);
    obj.alpha=alpha;line.material.opacity=alpha*0.65;line.visible=alpha>0.001;
    const positions=line.geometry.attributes.position;
    positions.setXYZ(0,...objects.get(edge.from).mesh.position.toArray());positions.setXYZ(1,...objects.get(edge.to).mesh.position.toArray());positions.needsUpdate=true;
    line.geometry.computeBoundingSphere();if(line.material.isLineDashedMaterial)line.computeLineDistances();
  }
}
function applyVertexOcclusion(){
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),view=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,2);
  const points=[...objects].filter(([,obj])=>obj.alpha>0.001).map(([id,obj])=>({id,x:obj.mesh.position.dot(right),y:obj.mesh.position.dot(up),depth:obj.mesh.position.dot(view),alpha:obj.alpha}));
  const occluded=getOccludedVertexIds(points);
  for(const [id,obj] of objects){obj.occluded=occluded.has(id);obj.mesh.visible=obj.alpha>0.001&&!obj.occluded;if(obj.occluded)obj.label.hidden=true;}
}
export function getEdgeAlpha(edge,hiddenAlpha,foldTime,revealTime){
  if(edge.group==='synthesis'||edge.group==='dualityAxes'||edge.from==='g'||edge.to==='gPrime')return 0;
  if(edge.group==='icosahedronExtra')return phase(revealTime,extraEdges.indexOf(edge)*EXTRA_STEP,200);
  // The opening diagram has exactly the original six ring sides and two
  // triangles. Interior primed connections appear only after the first orbit.
  let alpha=edge.group.endsWith('Hidden')?hiddenAlpha*phase(revealTime,0,250):1;
  // Familiar edges dim during the fold and recover before controls activate.
  alpha*=1-0.7*phase(foldTime,0,500)+0.7*phase(foldTime,FOLD_END,250);
  return alpha;
}
function panel(){
  if(stage!==2&&scene){scene.background.set('#171f2b');$('scene-card').dataset.alignment='other';}
  $('panel-caption').textContent=['THE FIRST VIEW','A CHANGE OF PERSPECTIVE'][stage-1];
  $('stage-text').replaceChildren();$('stage-text').hidden=stage===2;$('shadow-tool').hidden=stage!==2;
  const add=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;$('stage-text').append(el);};
  if(stage===1){add('h2','Six points, three origins');add('p',`${['a','b','c'].map(getLabel).join(', ')} are primal.`);for(const id of ['d','e','f'])add('p',`${getLabel(id)} = ${sums[id].map(getLabel).join(' + ')}`);add('p','Although this looks flat, each visible point has a hidden counterpart on a perpendicular axis — making the true geometry three-dimensional. That extra dimension is not decorative: it is what allows this six/twelve-point system and the four/eight-point cube system to be derived from the same higher-dimensional structure, two shadows of a single greater universe.');}
  $('interaction-hint').textContent=stage===2?'Drag to orbit · nearer vertices hide those behind':'The visible plane';
  $('save-angle').querySelector('button').disabled=!!transition;
  for(const button of $('bookmarks').querySelectorAll('.visit'))button.disabled=!!transition;
}
function mvPanel(){
  const isFlat=activeMvView==='mv-flat';
  $('mv-stage-text').hidden=!isFlat;$('mv-shadow-tool').hidden=isFlat;
  if(isFlat){
    $('mv-stage-text').replaceChildren();
    const add=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;$('mv-stage-text').append(el);};
    add('h2','Four elements, two layers');
    add('p',`${['d','b','c','f'].map(getLabel).join(', ')} meet at the corners of a square.`);
    add('p','Each has a prime counterpart in the hidden layer.');
    add('p','Both the four-point square and the six/twelve-point hexagonal geometry are projections down from 4D. Each vertex carries a fourth coordinate w, and a perspective projection collapses it into the 3D (and ultimately 2D) view you see: scale = focal / (focal − w′), where w′ = z·sin θ + w·cos θ rotates the 4th axis into view.');
    add('p','The hidden layer sits at w = −1 (or −1/φ for the hexagonal system), while the visible layer sits at w = +1 (or +1/φ). That shared requirement for a 4th dimension — not just depth, but a full extra axis needed for geometric completeness — is what makes these two shapes aspects of one greater universe rather than two unrelated figures.');
  }
}
function changeStage(direction){
  if(transition || stage+direction<1 || stage+direction>2)return;
  const from=stage;stage+=direction;controls.enabled=false;cameraTween=null;snapPending=false;orbitGesture=false;controls.enableDamping=false;controls.update();
  if(from===2){transition={kind:'cameraHome',elapsed:0,duration:500,fromPosition:camera.position.clone(),fromTarget:controls.target.clone(),fromExtra:extraTime,next:{kind:'solid',from:SOLID_END,to:0,duration:SOLID_END}};}
  else {extraTime=0;extraRevealed=false;transition={kind:'solid',from:0,to:SOLID_END,duration:SOLID_END,elapsed:0};}
  panel();
}
function animateCamera(saved,duration=900){
  if(stage!==2||transition)return;
  snapPending=false;
  // Flush residual orbit damping before a scripted movement so its final
  // orientation is exact. Direct user input can interrupt any camera tween.
  controls.enableDamping=false;controls.update();
  cameraTween={elapsed:0,duration,fromPosition:camera.position.clone(),fromTarget:controls.target.clone(),toPosition:vector(saved.position),toTarget:vector(saved.target)};
}
function animateMvCamera(saved,duration=900){
  if(!mvControls)return;
  mvControls.enableDamping=false;mvControls.update();
  mvCameraTween={elapsed:0,duration,fromPosition:mvCamera.position.clone(),fromTarget:mvControls.target.clone(),toPosition:vector(saved.position),toTarget:vector(saved.target)};
}
function snapView(){
  if(!snapPending||stage!==2||transition||cameraTween)return;
  if(!$('snap-vertices').checked){snapPending=false;return;}
  const view=camera.position.clone().sub(controls.target).normalize();
  settledFrames=view.distanceToSquared(lastView)<1e-8?settledFrames+1:0;lastView.copy(view);
  if(settledFrames<5)return;
  snapPending=false;
  const snap=findVisualSnap(view.toArray(),viewport.clientHeight/(camera.top-camera.bottom),getPreferences().snapDistancePixels,Math.PI/12);
  if(!snap)return;
  const radius=camera.position.distanceTo(controls.target);
  const position=vector(snap.direction).multiplyScalar(radius).add(controls.target);
  animateCamera({position:position.toArray(),target:controls.target.toArray()},320);
  $('snap-status').textContent=`Aligned: ${getLabel(snap.from)} / ${getLabel(snap.to)}. Drag again to release.`;
}
function tickMotion(dt){
  const wasTransitioning=!!transition;
  if(transition){
    transition.elapsed+=dt;const t=Math.min(transition.elapsed/transition.duration,1);
    if(transition.kind==='cameraHome'){
      camera.position.copy(transition.fromPosition).lerp(homePosition,smooth(t));controls.target.copy(transition.fromTarget).lerp(homeTarget,smooth(t));
      extraTime=THREE.MathUtils.lerp(transition.fromExtra,0,smooth(t));
    }else {
      solidTime=THREE.MathUtils.lerp(transition.from,transition.to,t);
      const folded=phase(solidTime,0,FOLD_END);
      camera.position.copy(flatHomePosition).lerp(homePosition,folded);
      controls.target.copy(flatHomeTarget).lerp(homeTarget,folded);
      camera.up.copy(getFoldCameraUp(folded));
    }
    if(t===1){if(transition.next){extraTime=0;extraRevealed=false;transition={...transition.next,elapsed:0};}else{transition=null;configureControls(controls.target.clone());panel();}}
  }
  if(cameraTween){
    cameraTween.elapsed+=dt;const t=Math.min(cameraTween.elapsed/cameraTween.duration,1),e=smooth(t);
    // Interpolate direction on a sphere to avoid diving through the model when
    // recalling opposing viewpoints. Radius and target interpolate separately.
    const from=cameraTween.fromPosition.clone().sub(cameraTween.fromTarget),to=cameraTween.toPosition.clone().sub(cameraTween.toTarget);
    const rotation=new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(),to.clone().normalize());
    const partial=new THREE.Quaternion().slerp(rotation,e);
    const direction=from.clone().normalize().applyQuaternion(partial);
    controls.target.copy(cameraTween.fromTarget).lerp(cameraTween.toTarget,e);
    camera.position.copy(controls.target).addScaledVector(direction,THREE.MathUtils.lerp(from.length(),to.length(),e));
    if(t===1){cameraTween=null;controls.enableDamping=true;}
  }
  if(wasTransitioning)camera.lookAt(controls.target);else controls.update();
  // Require actual user movement, not just a pointer-down or elapsed time.
  maybeRevealExtras();
  if(extraRevealed&&stage===2&&!transition)extraTime=Math.min(EXTRA_END,extraTime+dt);
}
function maybeRevealExtras(){
  if(!orbitGesture||stage!==2||transition||extraRevealed)return;
  const view=camera.position.clone().sub(controls.target).normalize();
  if(view.dot(vector(solidHomeDirection))<Math.cos(0.5*Math.PI/180)&&view.dot(orbitStartView)<Math.cos(0.1*Math.PI/180))extraRevealed=true;
}
function shadow(){
  const canvas=$('shadow'),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
  const dpr=Math.min(devicePixelRatio,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  // Camera right/up form an orthonormal basis for the perpendicular plane.
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),view=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,2);
  const scale=Math.min(w,h)/5.4,points=new Map(),projection=[],allProjection=[];
  for(const [id,obj] of objects){
    if(obj.node.family==='synthesis')continue;
    const p=obj.mesh.position,x=p.dot(right),y=p.dot(up);
    if(obj.alpha>0.001)allProjection.push({id,x,y,depth:p.dot(view)});
    if(obj.alpha>0.001&&!obj.occluded)projection.push({id,x,y});
    points.set(id,[w/2+x*scale,h/2-y*scale]);
  }
  const shape=getShadowDiagram(projection);
  const alignment=getShadowAlignment(allProjection,shape.corners);
  canvas.style.backgroundColor='#000000';scene.background.set('#000000');
  $('scene-card').dataset.alignment=alignment.kind;
  const description=alignment.kind==='hexagon'?'Aligned hexagon · 6 corners':alignment.kind==='ten'?'Ten-corner silhouette':`${shape.corners}-corner silhouette`;
  if($('shadow-shape').textContent!==description)$('shadow-shape').textContent=description;
  const drawPolygon=(vertices,color,dashed=false)=>{
    if(vertices.length<2)return;
    ctx.globalAlpha=0.8;ctx.strokeStyle=color;ctx.setLineDash(dashed?[5,4]:[]);ctx.beginPath();
    vertices.forEach((p,i)=>{const x=w/2+p.x*scale,y=h/2-p.y*scale;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
    ctx.closePath();ctx.stroke();
  };
  // Shadow lines follow the outer silhouette, regardless of revealed 3D edges.
  // Six corners support exactly two alternating triangles; other shapes do not.
  drawPolygon(shape.ring,'#91a0b5');
  if(shape.triangles.length){drawPolygon(shape.triangles[0],colors.primal);drawPolygon(shape.triangles[1],colors.derived,true);}
  const hexagonCorners=(shape.corners===6||alignment.kind==='ten')?new Set(shape.ring.map(p=>p.id)):null;
  ctx.setLineDash([]);ctx.font='12px system-ui';ctx.textAlign='center';
  for(const [id,obj] of objects){if(obj.alpha<0.001||obj.occluded||!points.has(id)||(hexagonCorners&&!hexagonCorners.has(id)))continue;const [x,y]=points.get(id);ctx.globalAlpha=obj.alpha;ctx.fillStyle=vertexColors[id];ctx.beginPath();ctx.arc(x,y,3.7,0,Math.PI*2);ctx.fill();ctx.fillText(getLabel(id),x,y-10,Math.max(70,w/3));}
  ctx.globalAlpha=1;
}
function mvShadow(){
  const canvas=$('mv-shadow'),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
  const dpr=Math.min(devicePixelRatio,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const right=new THREE.Vector3().setFromMatrixColumn(mvCamera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(mvCamera.matrixWorld,1),view=new THREE.Vector3().setFromMatrixColumn(mvCamera.matrixWorld,2);
  const scale=Math.min(w,h)/5.4,points=new Map(),projection=[];
  for(const [id,obj] of mvObjects){
    const p=obj.mesh.position,x=p.dot(right),y=p.dot(up);
    projection.push({id,x,y,depth:p.dot(view),alpha:1});
    points.set(id,[w/2+x*scale,h/2-y*scale]);
  }
  const occluded=getOccludedVertexIds(projection);
  const visible=projection.filter(p=>!occluded.has(p.id));
  const shape=getShadowDiagram(visible);
  canvas.style.backgroundColor='#000000';
  const description=shape.corners===6?'Aligned hexagon · 6 corners':shape.corners===4?'Square · 4 corners':`${shape.corners}-corner silhouette`;
  if($('mv-shadow-shape').textContent!==description)$('mv-shadow-shape').textContent=description;
  const drawPolygon=(vertices,color,dashed=false)=>{
    if(vertices.length<2)return;
    ctx.globalAlpha=0.8;ctx.strokeStyle=color;ctx.setLineDash(dashed?[5,4]:[]);ctx.beginPath();
    vertices.forEach((p,i)=>{const x=w/2+p.x*scale,y=h/2-p.y*scale;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
    ctx.closePath();ctx.stroke();
  };
  drawPolygon(shape.ring,'#91a0b5');
  if(shape.triangles.length){drawPolygon(shape.triangles[0],colors.primal);drawPolygon(shape.triangles[1],colors.derived,true);}
  const cornerIds=shape.ring.length?new Set(shape.ring.map(p=>p.id)):null;
  ctx.setLineDash([]);ctx.font='12px system-ui';ctx.textAlign='center';
  for(const [id] of mvObjects){
    if(!points.has(id)||occluded.has(id))continue;
    if(cornerIds&&!cornerIds.has(id))continue;
    const [x,y]=points.get(id);ctx.globalAlpha=1;ctx.fillStyle=vertexColors[id];ctx.beginPath();ctx.arc(x,y,3.7,0,Math.PI*2);ctx.fill();
    ctx.fillText(getLabel(id),x,y-10,Math.max(70,w/3));
  }
  ctx.globalAlpha=1;
}
function bookmarks(){
  for(const mode of ['explorer','stereo','mv-explorer','mv-stereo']){
    const listId=mode==='stereo'?'stereo-bookmarks':mode==='mv-explorer'?'mv-bookmarks':mode==='mv-stereo'?'mv-stereo-bookmarks':'bookmarks';
    const list=$(listId);list.replaceChildren();
    for(const s of getSlices()){
      const li=document.createElement('li');const visit=document.createElement('button');visit.className='visit';visit.textContent=s.name;visit.title=s.name;visit.disabled=mode==='explorer'&&!!transition;
      visit.onclick=()=>{if(mode==='stereo')stereoViewer?.visit(s.camera,s.name);else if(mode==='mv-stereo')mvStereoViewer?.visit(s.camera,s.name);else if(mode==='mv-explorer')animateMvCamera(s.camera);else animateCamera(s.camera);};
      const statusId=mode==='stereo'?'stereo-status':mode==='mv-stereo'?'mv-stereo-status':mode==='mv-explorer'?'mv-status':'status';
      const rename=document.createElement('button');rename.textContent='Rename';rename.setAttribute('aria-label',`Rename ${s.name}`);rename.onclick=()=>{const name=prompt('New bookmark name',s.name);if(name?.trim())try{renameSlice(s.id,name);}catch(e){$(statusId).textContent=e.message;}};
      const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`Delete ${s.name}`);remove.onclick=()=>deleteSlice(s.id);li.append(visit,rename,remove);list.append(li);
    }
  }
  const count=getSlices().length;
  $('stereo-bookmarks-empty').hidden=count>0;
  $('mv-stereo-bookmarks-empty').hidden=count>0;
}
function editor(){
  for(const node of activeNodes){const label=document.createElement('label');label.textContent=node.id;label.style.color=vertexColors[node.id];const input=document.createElement('input');input.value=getLabel(node.id);input.maxLength=120;input.dataset.id=node.id;input.setAttribute('aria-label',`Display name for ${node.id}`);
    input.addEventListener('input',()=>{if(input.value.trim()){renameLabel(node.id,input.value);input.setCustomValidity('');}else input.setCustomValidity('A label cannot be empty.');});
    input.addEventListener('blur',()=>{if(!input.value.trim()){input.value=getLabel(node.id);input.setCustomValidity('');}});label.append(input);$('label-editor').append(label);}
}
function mvEditor(){
  for(const node of multiverseNodes){const label=document.createElement('label');label.textContent=node.id;label.style.color=vertexColors[node.id];const input=document.createElement('input');input.value=getLabel(node.id);input.maxLength=120;input.dataset.id=node.id;input.setAttribute('aria-label',`Display name for ${node.id}`);
    input.addEventListener('input',()=>{if(input.value.trim()){renameLabel(node.id,input.value);input.setCustomValidity('');}else input.setCustomValidity('A label cannot be empty.');});
    input.addEventListener('blur',()=>{if(!input.value.trim()){input.value=getLabel(node.id);input.setCustomValidity('');}});label.append(input);$('mv-label-editor').append(label);}
}
function refresh(){
  const preferences=getPreferences();
  $('snap-vertices').checked=preferences.snapEnabled;
  $('snap-distance').value=preferences.snapDistancePixels;
  $('snap-distance-value').value=`${preferences.snapDistancePixels} px`;
  $('snap-distance').disabled=!preferences.snapEnabled;
  $('stereo-separation').value=preferences.stereoSeparationDegrees;
  $('stereo-separation-value').value=`${preferences.stereoSeparationDegrees}°`;
  $('stereo-labels').checked=preferences.stereoLabelsEnabled;
  $('stereo-spacing').value=preferences.stereoSpacingEm;
  $('stereo-spacing-value').value=`${preferences.stereoSpacingEm} em`;
  $('mv-stereo-separation').value=preferences.stereoSeparationDegrees;
  $('mv-stereo-separation-value').value=`${preferences.stereoSeparationDegrees}°`;
  $('mv-stereo-labels').checked=preferences.stereoLabelsEnabled;
  $('mv-stereo-spacing').value=preferences.stereoSpacingEm;
  $('mv-stereo-spacing-value').value=`${preferences.stereoSpacingEm} em`;
  for(const [id,obj] of objects)obj.label.textContent=getLabel(id);
  for(const [id,obj] of mvObjects)obj.label.textContent=getLabel(id);
  for(const input of $('label-editor').querySelectorAll('input'))if(input!==document.activeElement)input.value=getLabel(input.dataset.id);
  for(const input of $('mv-label-editor').querySelectorAll('input'))if(input!==document.activeElement)input.value=getLabel(input.dataset.id);
  $('tesseract-g-note').textContent=`${getLabel('g')} and ${getLabel('gPrime')}`;
  panel();mvPanel();bookmarks();$('status').textContent=persistenceMessage;
}
let mvScene,mvCamera,mvRenderer,mvControls,mvCameraTween=null;
const mvObjects=new Map(),mvSquareLines=[],mvCubeLines=[];
function setupMv(){
  const vp=$('mv-viewport');
  mvScene=new THREE.Scene();mvScene.background=new THREE.Color('#171f2b');
  mvCamera=new THREE.OrthographicCamera(-4,4,3,-3,0.01,100);
  mvCamera.position.set(0,0,8);mvCamera.lookAt(0,0,0);
  mvRenderer=new THREE.WebGLRenderer({antialias:true});mvRenderer.setPixelRatio(Math.min(devicePixelRatio,2));
  vp.append(mvRenderer.domElement);mvRenderer.domElement.setAttribute('aria-label','Three-dimensional four elements cube model');
  mvControls=new OrbitControls(mvCamera,mvRenderer.domElement);
  mvControls.target.set(0,0,0);mvControls.enableDamping=true;mvControls.enablePan=false;mvControls.enableZoom=false;mvControls.enabled=false;
  const sphere=new THREE.SphereGeometry(0.095,20,14);
  for(const node of multiverseNodes){
    const color=vertexColors[node.id];
    const mesh=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color,depthWrite:true}));mvScene.add(mesh);
    const label=document.createElement('span');label.className='point-label';label.style.color=color;label.textContent=getLabel(node.id);$('mv-point-labels').append(label);
    mvObjects.set(node.id,{mesh,label,node});
  }
  for(const [from,to] of squareEdges){
    const mat=new THREE.LineBasicMaterial({color:colors.primal,transparent:true,opacity:0.65,depthWrite:false});
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
    const line=new THREE.Line(geo,mat);mvScene.add(line);mvSquareLines.push({line,from,to});
  }
  for(const [from,to] of cubeEdges){
    const family=multiverseNodes.find(n=>n.id===from).family;
    const mat=new THREE.LineBasicMaterial({color:colors[family],transparent:true,opacity:0.65,depthWrite:false});
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
    const line=new THREE.Line(geo,mat);mvScene.add(line);mvCubeLines.push({line,from,to});
  }
  new ResizeObserver(resizeMv).observe(vp);resizeMv();
  $('mv-boot-message').hidden=true;
  subscribe(()=>{for(const [id,obj] of mvObjects)obj.label.textContent=getLabel(id);});
  let mvLast=performance.now();
  mvRenderer.setAnimationLoop(now=>{
    const dt=Math.min(now-mvLast,60);mvLast=now;
    if(activeWorld!=='multiverse'||(activeMvView!=='mv-flat'&&activeMvView!=='mv-explorer'))return;
    if(mvCameraTween){
      mvCameraTween.elapsed+=dt;const t=Math.min(mvCameraTween.elapsed/mvCameraTween.duration,1),e=smooth(t);
      const from=mvCameraTween.fromPosition.clone().sub(mvCameraTween.fromTarget);
      const to=mvCameraTween.toPosition.clone().sub(mvCameraTween.toTarget);
      const rotation=new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(),to.clone().normalize());
      mvControls.target.copy(mvCameraTween.fromTarget).lerp(mvCameraTween.toTarget,e);
      mvCamera.position.copy(mvControls.target).addScaledVector(from.clone().normalize().applyQuaternion(new THREE.Quaternion().slerp(rotation,e)),THREE.MathUtils.lerp(from.length(),to.length(),e));
      mvCamera.lookAt(mvControls.target);
      if(t===1){mvCameraTween=null;mvControls.enableDamping=true;}
    }else{mvControls.update();}
    mvCamera.updateMatrixWorld();updateMvGeometry();
    if(activeMvView==='mv-explorer')mvShadow();
    mvRenderer.render(mvScene,mvCamera);
  });
}
function resizeMv(){
  const vp=$('mv-viewport');const w=vp.clientWidth,h=vp.clientHeight;if(!w||!h)return;
  mvRenderer.setSize(w,h);const halfH=Math.max(3,2.35*h/w);
  mvCamera.top=halfH;mvCamera.bottom=-halfH;mvCamera.left=-halfH*w/h;mvCamera.right=halfH*w/h;mvCamera.updateProjectionMatrix();
}
function updateMvGeometry(){
  const isFlat=activeMvView==='mv-flat';
  const pos=isFlat?squarePositions:cubePositions;
  const vp=$('mv-viewport');
  const right=new THREE.Vector3().setFromMatrixColumn(mvCamera.matrixWorld,0);
  const up=new THREE.Vector3().setFromMatrixColumn(mvCamera.matrixWorld,1);
  const view=new THREE.Vector3().setFromMatrixColumn(mvCamera.matrixWorld,2);
  const points=[];
  for(const [id,obj] of mvObjects){
    if(!pos[id])continue;obj.mesh.position.set(...pos[id]);
    points.push({id,x:obj.mesh.position.dot(right),y:obj.mesh.position.dot(up),depth:obj.mesh.position.dot(view),alpha:1});
  }
  const occluded=getOccludedVertexIds(points);
  for(const [id,obj] of mvObjects){
    if(!pos[id])continue;const occ=occluded.has(id);obj.mesh.visible=!occ;
    const screen=obj.mesh.position.clone().project(mvCamera);
    obj.label.hidden=occ||screen.z<-1||screen.z>1;
    obj.label.style.left=`${(screen.x+1)*vp.clientWidth/2}px`;
    obj.label.style.top=`${(1-screen.y)*vp.clientHeight/2-19}px`;
  }
  for(const {line,from,to} of mvSquareLines){
    line.visible=isFlat;
    if(isFlat){const a=line.geometry.attributes.position;a.setXYZ(0,...squarePositions[from]);a.setXYZ(1,...squarePositions[to]);a.needsUpdate=true;line.geometry.computeBoundingSphere();}
  }
  for(const {line,from,to} of mvCubeLines){
    line.visible=!isFlat;
    if(!isFlat){const a=line.geometry.attributes.position;a.setXYZ(0,...cubePositions[from]);a.setXYZ(1,...cubePositions[to]);a.needsUpdate=true;line.geometry.computeBoundingSphere();}
  }
}
async function main(){
  await loadConfig();setup();editor();mvEditor();subscribe(refresh);refresh();
  const selectView=name=>{
    activeView=name;
    $('explorer-panel').hidden=name==='stereo'||name==='tesseract';
    $('stereo-panel').hidden=name!=='stereo';$('tesseract-panel').hidden=name!=='tesseract';
    $('explorer-panel').setAttribute('aria-labelledby',`${name==='flat'?'flat':'explorer'}-tab`);
    for(const mode of modes){
      $(`${mode}-tab`).setAttribute('aria-selected',String(mode===name));
      $(`${mode}-tab`).tabIndex=mode===name?0:-1;
    }
    if(name!=='stereo'&&name!=='tesseract'){
      requestedStage=name==='flat'?1:2;
      if(!transition&&stage!==requestedStage)changeStage(requestedStage-stage);
    }
    controls.enabled=name==='explorer'&&stage===2&&!transition;
    orbitGesture=false;snapPending=false;
    if(name==='stereo'){
      try{
        stereoViewer??=new StereoViewer($('stereo-viewport'),$('stereo-card'),$('stereo-status'));
        stereoViewer.setActive(true);$('stereo-message').hidden=true;
      }catch(error){$('stereo-message').textContent=`Stereo view could not start: ${error.message}`;}
      tesseractViewer?.setActive(false);
    }else if(name==='tesseract'){
      try{
        tesseractViewer??=createTesseractViewer();
        tesseractViewer.setActive(true);$('tesseract-message').hidden=true;
      }catch(error){$('tesseract-message').textContent=`Fourth view could not start: ${error.message}`;}
      stereoViewer?.setActive(false);
    }else{stereoViewer?.setActive(false);tesseractViewer?.setActive(false);resize();}
  };
  const createTesseractViewer=()=>{
    const viewer=new TesseractViewer($('tesseract-viewport'),$('tesseract-card'),$('tesseract-status'),
      {positions:solidPositions,wValues:greaterVertexW,labelsContainer:$('tesseract-labels')});
    viewer.onThetaChange=theta=>{
      const degrees=Math.round(theta*180/Math.PI)%360;
      $('tesseract-theta').value=degrees;$('tesseract-theta-value').value=`${degrees}°`;
    };
    return viewer;
  };
  const modes=['flat','explorer','stereo','tesseract'];
  for(const mode of modes){
    $(`${mode}-tab`).onclick=()=>selectView(mode);
    $(`${mode}-tab`).onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const next=event.key==='Home'?modes[0]:event.key==='End'?modes[modes.length-1]:modes[(modes.indexOf(mode)+(event.key==='ArrowLeft'?modes.length-1:1))%modes.length];
      selectView(next);$(`${next}-tab`).focus();
    };
  }
  const createMvTesseractViewer=()=>{
    const formattedEdges=cubeEdges.map(([from,to])=>({id:`cube:${from}:${to}`,from,to,group:'cube'}));
    const viewer=new TesseractViewer($('mv-tesseract-viewport'),$('mv-tesseract-card'),$('mv-tesseract-status'),
      {positions:cubePositions,wValues:multiverseVertexW,edges:formattedEdges,nodeSet:multiverseNodes,labelsContainer:$('mv-tesseract-labels')});
    viewer.onThetaChange=theta=>{
      const degrees=Math.round(theta*180/Math.PI)%360;
      $('mv-tesseract-theta').value=degrees;$('mv-tesseract-theta-value').value=`${degrees}°`;
    };
    return viewer;
  };
  const createMvStereoViewer=()=>{
    const formattedEdges=cubeEdges.map(([from,to])=>({id:`cube:${from}:${to}`,from,to,group:'cube'}));
    const homeNorm=vector(cubeHomeDirection).normalize();
    const worldY=new THREE.Vector3(0,1,0);
    const cubeUp=worldY.clone().addScaledVector(homeNorm,-worldY.dot(homeNorm)).normalize().toArray();
    return new StereoViewer($('mv-stereo-viewport'),$('mv-stereo-card'),$('mv-stereo-status'),
      {nodeSet:multiverseNodes,positions:cubePositions,homeDir:cubeHomeDirection,edgeSet:formattedEdges,
       leftLabels:$('mv-stereo-left-labels'),rightLabels:$('mv-stereo-right-labels'),
       circumradius:Math.sqrt(3)+0.095,enableReveal:false,snapFn:null,upRef:cubeUp});
  };
  const selectMvView=name=>{
    activeMvView=name;mvPanel();
    const mvModes=['mv-flat','mv-explorer','mv-stereo','mv-tesseract'];
    $('mv-explorer-panel').hidden=name!=='mv-flat'&&name!=='mv-explorer';
    $('mv-stereo-panel').hidden=name!=='mv-stereo';
    $('mv-tesseract-panel').hidden=name!=='mv-tesseract';
    for(const mode of mvModes){
      $(`${mode}-tab`).setAttribute('aria-selected',String(mode===name));
      $(`${mode}-tab`).tabIndex=mode===name?0:-1;
    }
    if(name==='mv-flat'||name==='mv-explorer'){
      if(!mvScene)setupMv();
      if(name==='mv-flat'){
        mvCamera.position.set(0,0,8);mvCamera.up.set(0,1,0);mvCamera.lookAt(0,0,0);
        mvControls.target.set(0,0,0);mvControls.enableDamping=false;mvControls.enabled=false;mvControls.update();
      }else{
        mvCamera.position.copy(vector(cubeHomeDirection).multiplyScalar(8));mvCamera.up.set(0,1,0);mvCamera.lookAt(0,0,0);
        mvControls.target.set(0,0,0);mvControls.enabled=true;
      }
      resizeMv();
      $('mv-interaction-hint').textContent=name==='mv-explorer'?'Drag to orbit · eight elements on a cube':'The square';
      mvStereoViewer?.setActive(false);mvTesseractViewer?.setActive(false);
    }else if(name==='mv-stereo'){
      if(!mvScene)setupMv();
      try{
        mvStereoViewer??=createMvStereoViewer();
        mvStereoViewer.setActive(true);$('mv-stereo-message').hidden=true;
      }catch(error){$('mv-stereo-message').textContent=`Stereo view could not start: ${error.message}`;}
      mvTesseractViewer?.setActive(false);
    }else if(name==='mv-tesseract'){
      try{
        mvTesseractViewer??=createMvTesseractViewer();
        mvTesseractViewer.setActive(true);$('mv-tesseract-message').hidden=true;
      }catch(error){$('mv-tesseract-message').textContent=`Fourth view could not start: ${error.message}`;}
      mvStereoViewer?.setActive(false);
    }else{mvStereoViewer?.setActive(false);mvTesseractViewer?.setActive(false);}
  };
  const selectWorld=name=>{
    activeWorld=name;
    $('greater-world-btn').setAttribute('aria-pressed',String(name==='greater'));
    $('multiverse-world-btn').setAttribute('aria-pressed',String(name==='multiverse'));
    $('greater-view-tabs').hidden=name!=='greater';
    $('multiverse-view-tabs').hidden=name==='greater';
    if(name==='greater'){
      $('mv-explorer-panel').hidden=true;$('mv-stereo-panel').hidden=true;$('mv-tesseract-panel').hidden=true;
      mvTesseractViewer?.setActive(false);mvStereoViewer?.setActive(false);
      selectView(activeView);
    }else{
      $('explorer-panel').hidden=true;$('stereo-panel').hidden=true;$('tesseract-panel').hidden=true;
      stereoViewer?.setActive(false);tesseractViewer?.setActive(false);
      selectMvView(activeMvView);
    }
  };
  $('greater-world-btn').onclick=()=>selectWorld('greater');
  $('multiverse-world-btn').onclick=()=>selectWorld('multiverse');
  const mvModes=['mv-flat','mv-explorer','mv-stereo','mv-tesseract'];
  for(const mode of mvModes){
    $(`${mode}-tab`).onclick=()=>selectMvView(mode);
    $(`${mode}-tab`).onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const idx=mvModes.indexOf(mode);
      const next=event.key==='Home'?mvModes[0]:event.key==='End'?mvModes[mvModes.length-1]:mvModes[(idx+(event.key==='ArrowLeft'?mvModes.length-1:1))%mvModes.length];
      selectMvView(next);$(`${next}-tab`).focus();
    };
  }
  $('mv-tesseract-theta').oninput=()=>{
    const degrees=Number($('mv-tesseract-theta').value);
    mvTesseractViewer?.setTheta(degrees*Math.PI/180);
    $('mv-tesseract-auto-rotate').checked=false;$('mv-tesseract-theta-value').value=`${degrees}°`;
  };
  $('mv-tesseract-auto-rotate').onchange=()=>mvTesseractViewer?.setAutoRotate($('mv-tesseract-auto-rotate').checked);
  $('mv-save-angle').onsubmit=event=>{event.preventDefault();if(!mvControls)return;try{saveSlice($('mv-slice-name').value,{position:mvCamera.position.toArray(),target:mvControls.target.toArray()});$('mv-slice-name').value='';}catch(e){$('mv-status').textContent=e.message;}};
  $('mv-stereo-home').onclick=()=>mvStereoViewer?.reset();
  $('mv-stereo-save-angle').onsubmit=event=>{
    event.preventDefault();if(!mvStereoViewer)return;
    try{saveSlice($('mv-stereo-slice-name').value,mvStereoViewer.getView());$('mv-stereo-slice-name').value='';}
    catch(error){$('mv-stereo-status').textContent=error.message;}
  };
  $('mv-stereo-separation').oninput=()=>setPreferences({stereoSeparationDegrees:Number($('mv-stereo-separation').value)});
  $('mv-stereo-separation-default').onclick=()=>setPreferences({stereoSeparationDegrees:4});
  $('mv-stereo-spacing').oninput=()=>setPreferences({stereoSpacingEm:Number($('mv-stereo-spacing').value)});
  $('mv-stereo-spacing-default').onclick=()=>setPreferences({stereoSpacingEm:29});
  $('mv-stereo-labels').onchange=()=>setPreferences({stereoLabelsEnabled:$('mv-stereo-labels').checked});
  $('stereo-home').onclick=()=>stereoViewer?.reset();
  $('stereo-save-angle').onsubmit=event=>{
    event.preventDefault();if(!stereoViewer)return;
    try{saveSlice($('stereo-slice-name').value,stereoViewer.getView());$('stereo-slice-name').value='';$('stereo-status').textContent=persistenceMessage;}
    catch(error){$('stereo-status').textContent=error.message;}
  };
  $('stereo-separation').oninput=()=>setPreferences({stereoSeparationDegrees:Number($('stereo-separation').value)});
  $('stereo-separation-default').onclick=()=>setPreferences({stereoSeparationDegrees:4});
  $('stereo-spacing').oninput=()=>setPreferences({stereoSpacingEm:Number($('stereo-spacing').value)});
  $('stereo-spacing-default').onclick=()=>setPreferences({stereoSpacingEm:29});
  $('stereo-labels').onchange=()=>setPreferences({stereoLabelsEnabled:$('stereo-labels').checked});
  $('tesseract-theta').oninput=()=>{
    const degrees=Number($('tesseract-theta').value);
    tesseractViewer?.setTheta(degrees*Math.PI/180);
    $('tesseract-auto-rotate').checked=false;$('tesseract-theta-value').value=`${degrees}°`;
  };
  $('tesseract-auto-rotate').onchange=()=>tesseractViewer?.setAutoRotate($('tesseract-auto-rotate').checked);
  $('save-angle').onsubmit=event=>{event.preventDefault();if(transition)return;try{saveSlice($('slice-name').value,{position:camera.position.toArray(),target:controls.target.toArray()});$('slice-name').value='';}catch(e){$('status').textContent=e.message;}};
  $('export').onclick=exportConfig;$('import').onclick=()=>$('import-file').click();
  $('snap-vertices').onchange=()=>{snapPending=false;setPreferences({snapEnabled:$('snap-vertices').checked});$('snap-status').textContent=$('snap-vertices').checked?'Release a drag near an overlap to snap the view.':'Vertex snapping is off.';};
  $('snap-distance').oninput=()=>setPreferences({snapDistancePixels:Number($('snap-distance').value)});
  $('snap-distance-default').onclick=()=>{snapPending=false;setPreferences({snapDistancePixels:18});};
  $('import-file').onchange=async event=>{const file=event.target.files[0];if(file)try{await importConfig(file);}catch(e){$('status').textContent=`Import failed: ${e.message}`;}event.target.value='';};
  let last=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min(now-last,60);last=now;if(activeWorld!=='greater'||activeView==='stereo'||activeView==='tesseract')return;if(!transition&&stage!==requestedStage)changeStage(requestedStage-stage);tickMotion(dt);snapView();camera.updateMatrixWorld();updateGeometry();if(stage===2)shadow();renderer.render(scene,camera);});
  selectWorld('multiverse');
}
main().catch(error=>{$('boot-message').hidden=false;$('boot-message').textContent=`Visualization could not start: ${error.message}. Serve this directory over HTTP and check access to the three.js CDN.`;console.error(error);});

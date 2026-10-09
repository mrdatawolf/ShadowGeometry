import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {activeNodes,vertexColors,stage3Edges,solidPositions,solidHomeDirection,findVisualSnap,getOccludedVertexIds,getShadowDiagram,getShadowAlignment} from './geometry.js';
import {getLabel,getPreferences,subscribe} from './labels.js';

const colors={primal:'#78aaff',derived:'#f19886'};
const vector=a=>new THREE.Vector3(...a);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const normalize=a=>{const length=Math.hypot(...a);return a.map(v=>v/length);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};

// Parallel vertical axes eliminate vertical disparity. The two orthographic
// viewpoints yaw equally about screen-up and converge on the same target.
// Cross-eyed viewing swaps the eyes on screen; no geometry is mirror-flipped.
export function getStereoFrames(position,target,up,separationDegrees){
  const view=normalize(position.map((v,i)=>v-target[i]));
  const vertical=normalize(up.map((v,i)=>v-dot(up,view)*view[i]));
  const right=cross(vertical,view),radius=Math.hypot(...position.map((v,i)=>v-target[i]));
  const angle=separationDegrees*Math.PI/360;
  const frame=sign=>{
    const direction=view.map((v,i)=>v*Math.cos(angle)+sign*right[i]*Math.sin(angle));
    return {position:target.map((v,i)=>v+radius*direction[i]),target:[...target],up:vertical,right:cross(vertical,direction),direction};
  };
  return {screenLeft:frame(1),screenRight:frame(-1)};
}

export class StereoViewer{
  constructor(viewport,card,status,options={}){
    const {nodeSet=activeNodes,positions=solidPositions,homeDir=solidHomeDirection,edgeSet=stage3Edges,leftLabels=document.getElementById('stereo-left-labels'),rightLabels=document.getElementById('stereo-right-labels'),circumradius=Math.hypot(...solidPositions.a)+0.095,enableReveal=true,snapFn=findVisualSnap}=options;
    this.viewport=viewport;this.card=card;this.status=status;this.active=false;
    this.extraTime=0;this.revealing=false;this.dragging=false;this.snapPending=false;this.stableFrames=0;this.tween=null;
    this.homeDir=homeDir;this.circumradius=circumradius;this.enableReveal=enableReveal;this.snapFn=snapFn;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#000000');
    this.camera=new THREE.OrthographicCamera(-4,4,3,-3,0.01,100);
    const homeNorm=vector(homeDir).normalize();
    const upRef=options.upRef?vector(options.upRef):vector(solidPositions.a);
    this.camera.position.copy(homeNorm.clone().multiplyScalar(8));
    this.camera.up.copy(upRef.clone().addScaledVector(homeNorm,-upRef.dot(homeNorm)).normalize());
    this.camera.lookAt(0,0,0);
    this.eyeCameras=[this.camera.clone(),this.camera.clone()];
    this.renderer=new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.domElement.setAttribute('aria-label','Cross-eyed stereoscopic icosahedron: right eye on the left, left eye on the right');
    viewport.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.enableZoom=false;this.controls.enabled=false;
    this.controls.addEventListener('start',()=>{
      this.tween=null;this.controls.enableDamping=true;this.snapPending=false;this.stableFrames=0;this.dragging=true;
      this.dragStart=this.camera.position.clone().sub(this.controls.target).normalize();
    });
    this.controls.addEventListener('end',()=>{this.startReveal();this.dragging=false;this.snapPending=true;this.lastDirection=this.camera.position.clone().sub(this.controls.target).normalize();});
    this.points=[];this.lines=[];
    const sphere=new THREE.SphereGeometry(0.095,20,14);
    for(const node of nodeSet){
      const mesh=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color:vertexColors[node.id],depthWrite:true}));
      mesh.position.copy(vector(positions[node.id]));this.scene.add(mesh);
      const labels=[leftLabels,rightLabels].map(container=>{const el=document.createElement('span');el.className='point-label';el.style.color=vertexColors[node.id];container.append(el);return el;});
      this.points.push({node,mesh,labels});
    }
    let extraIndex=0;
    for(const edge of edgeSet){
      const family=nodeSet.find(n=>n.id===edge.from)?.family??'primal';
      const dashed=edge.group.endsWith('Hidden')||(edge.group==='triangles'&&family==='derived');
      const color=edge.group==='icosahedronExtra'?'#b5d8ce':edge.group.startsWith('hexRing')?'#69778d':colors[family];
      const material=dashed?new THREE.LineDashedMaterial({color,transparent:true,dashSize:0.07,gapSize:0.05,depthWrite:false}):new THREE.LineBasicMaterial({color,transparent:true,depthWrite:false});
      const geometry=new THREE.BufferGeometry().setFromPoints([vector(positions[edge.from]),vector(positions[edge.to])]);
      const line=new THREE.Line(geometry,material);if(dashed)line.computeLineDistances();this.scene.add(line);
      this.lines.push({edge,line,index:edge.group==='icosahedronExtra'?extraIndex++:-1});
    }
    this.extraEnd=Math.max(0,extraIndex-1)*95+200;
    this.unsubscribe=subscribe(()=>this.refreshLabels());this.refreshLabels();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(viewport);
    this.lastTime=performance.now();
    this.renderer.setAnimationLoop(now=>{const dt=Math.min(now-this.lastTime,60);this.lastTime=now;if(this.active)this.frame(dt);});
  }
  refreshLabels(){for(const point of this.points)for(const label of point.labels)label.textContent=getLabel(point.node.id);}
  getView(){return {position:this.camera.position.toArray(),target:this.controls.target.toArray()};}
  visit(saved,name){
    // Discard pending orbit damping and snapping before restoring the exact
    // central shadow direction. Eye angles and image spacing remain preferences.
    this.tween=null;this.snapPending=false;this.dragging=false;this.stableFrames=0;
    this.controls.enableDamping=false;this.controls.update();
    this.controls.target.copy(vector(saved.target));this.camera.position.copy(vector(saved.position));
    this.controls.update();this.controls.enableDamping=true;
    this.status.textContent=`Bookmark: ${name}`;
  }
  setActive(active){this.active=active;this.controls.enabled=active;if(active)this.resize();else{this.dragging=false;this.snapPending=false;}}
  resize(){
    const width=this.viewport.clientWidth,height=this.viewport.clientHeight;if(!width||!height)return;
    this.renderer.setSize(width,height);
    this.emPixels=parseFloat(getComputedStyle(this.viewport).fontSize)||16;
    const aspect=(width/2)/height,halfHeight=Math.max(3,2.35/aspect);
    for(const camera of [this.camera,...this.eyeCameras]){camera.top=halfHeight;camera.bottom=-halfHeight;camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.updateProjectionMatrix();}
  }
  startReveal(){
    if(!this.enableReveal||!this.dragging||this.revealing)return;
    const view=this.camera.position.clone().sub(this.controls.target).normalize();
    if(view.dot(vector(this.homeDir))<Math.cos(Math.PI/360)&&view.dot(this.dragStart)<Math.cos(Math.PI/1800))this.revealing=true;
  }
  reset(){
    this.tween=null;this.controls.enableDamping=false;this.controls.update();
    this.controls.target.set(0,0,0);this.camera.position.copy(vector(this.homeDir).normalize().multiplyScalar(8));
    this.controls.update();this.controls.enableDamping=true;
    this.extraTime=0;this.revealing=false;this.snapPending=false;this.dragging=false;
    this.status.textContent='Drag to orbit · stereo separation adjusts depth';
  }
  snap(dt){
    if(this.tween){
      this.tween.time+=dt;const t=Math.min(this.tween.time/320,1);
      const rotation=new THREE.Quaternion().setFromUnitVectors(this.tween.from,this.tween.to);
      const direction=this.tween.from.clone().applyQuaternion(new THREE.Quaternion().slerp(rotation,smooth(t)));
      this.camera.position.copy(this.controls.target).addScaledVector(direction,this.tween.radius);
      if(t===1){this.tween=null;this.controls.enableDamping=true;}return;
    }
    if(!this.snapFn||!this.snapPending||!getPreferences().snapEnabled)return;
    const direction=this.camera.position.clone().sub(this.controls.target).normalize();
    this.stableFrames=direction.distanceToSquared(this.lastDirection)<1e-8?this.stableFrames+1:0;this.lastDirection.copy(direction);
    if(this.stableFrames<5)return;this.snapPending=false;
    const snap=this.snapFn(direction.toArray(),this.viewport.clientHeight/(this.eyeCameras[0].top-this.eyeCameras[0].bottom),getPreferences().snapDistancePixels,Math.PI/12);
    if(!snap)return;
    this.controls.enableDamping=false;this.controls.update();
    this.tween={time:0,from:this.camera.position.clone().sub(this.controls.target).normalize(),to:vector(snap.direction),radius:this.camera.position.distanceTo(this.controls.target)};
    this.status.textContent=`Aligned: ${getLabel(snap.from)} / ${getLabel(snap.to)}. Drag again to release.`;
  }
  project(camera){
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),view=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,2);
    return this.points.map(p=>({id:p.node.id,x:p.mesh.position.dot(right),y:p.mesh.position.dot(up),depth:p.mesh.position.dot(view)}));
  }
  frame(dt){
    if(!this.viewport.clientWidth||!this.viewport.clientHeight)return;
    this.controls.update();this.startReveal();this.snap(dt);this.controls.update();this.camera.updateMatrixWorld();
    if(this.revealing)this.extraTime=Math.min(this.extraEnd,this.extraTime+dt);
    for(const {edge,line,index} of this.lines){
      const alpha=index>=0?smooth((this.extraTime-index*95)/200):edge.group.endsWith('Hidden')?smooth(this.extraTime/250):1;
      line.material.opacity=alpha*0.65;line.visible=alpha>0.001;
    }
    const center=this.project(this.camera),hidden=getOccludedVertexIds(center);
    const shape=getShadowDiagram(center.filter(p=>!hidden.has(p.id)));
    this.card.dataset.alignment=getShadowAlignment(center,shape.corners).kind;
    const frames=getStereoFrames(this.camera.position.toArray(),this.controls.target.toArray(),new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1).toArray(),getPreferences().stereoSeparationDegrees);
    const width=this.viewport.clientWidth,height=this.viewport.clientHeight,half=Math.floor(width/2);
    const viewports=[[0,half],[half,width-half]],ordered=[frames.screenLeft,frames.screenRight];
    this.renderer.setScissorTest(true);
    for(let eye=0;eye<2;eye++){
      const camera=this.eyeCameras[eye],frame=ordered[eye],offset=viewports[eye][0],eyeWidth=viewports[eye][1];
      camera.position.copy(vector(frame.position));camera.up.copy(vector(frame.up));camera.lookAt(vector(frame.target));camera.updateMatrixWorld();
      const projection=this.project(camera);
      // Center spacing is a fixed CSS length, independent of rotating silhouettes.
      // On narrow screens cap spacing to one half-panel and fit a bounding sphere
      // so neither eye's image is cropped at the middle or the outside edge.
      const spacingPixels=Math.min(getPreferences().stereoSpacingEm*(this.emPixels||16),width/2);
      const radius=this.circumradius??Math.hypot(...solidPositions.a)+0.095;
      const halfHeight=Math.max(3,2.35*height/(width/2),radius*height/spacingPixels);
      const halfWorldWidth=halfHeight*eyeWidth/height;
      camera.top=halfHeight;camera.bottom=-halfHeight;
      const desiredCenter=(eye===0?1:-1)*(eyeWidth/2-spacingPixels/2)*2*halfWorldWidth/eyeWidth;
      const windowCenter=dot(frame.target,frame.right)-desiredCenter;
      camera.left=windowCenter-halfWorldWidth;camera.right=windowCenter+halfWorldWidth;camera.updateProjectionMatrix();
      const centerPercent=50+desiredCenter/(2*halfWorldWidth)*100;
      this.viewport.style.setProperty(eye===0?'--stereo-left-center':'--stereo-right-center',`${centerPercent}%`);
      const occluded=getOccludedVertexIds(projection);
      for(const point of this.points){
        point.mesh.visible=!occluded.has(point.node.id);
        const p=point.mesh.position.clone().project(camera),label=point.labels[eye];
        label.hidden=!getPreferences().stereoLabelsEnabled||!point.mesh.visible||p.z < -1||p.z>1;
        label.style.left=`${(p.x+1)*eyeWidth/2}px`;label.style.top=`${(1-p.y)*height/2-19}px`;
      }
      this.renderer.setViewport(offset,0,eyeWidth,height);this.renderer.setScissor(offset,0,eyeWidth,height);
      this.renderer.render(this.scene,camera);
    }
    this.renderer.setScissorTest(false);
  }
}

import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {activeNodes,solidPositions,solidHomeDirection,icosahedronEdges,getOccludedVertexIds,fieldIds,fieldColors,fieldProfiles,fieldMembers,feltFieldOf,fieldBranches,tierBranchKinds,fieldOpposites,oppositeRoutes} from './geometry.js';
import {getLabel,subscribe} from './labels.js';

const vector=a=>new THREE.Vector3(...a);
const list=items=>items.length<2?items.join(''):`${items.slice(0,-1).join(', ')} and ${items[items.length-1]}`;
// Slightly off the 3D tab's home axis, so no vertex hides another and all
// three golden rectangles read as planes rather than edge-on lines.
const homeView=vector(solidHomeDirection);
const homeUp=vector(solidPositions.a).addScaledVector(homeView,-vector(solidPositions.a).dot(homeView)).normalize();
const homeRight=homeUp.clone().cross(homeView).normalize();
export const fieldsHomeDirection=homeView.clone().addScaledVector(homeRight,0.42).addScaledVector(homeUp,0.24).normalize().toArray();

// Text for the side panel. Pure, so verify.cjs can check it without a browser.
export function fieldNarrative(id,tier,label=getLabel){
  const profile=fieldProfiles[id],branches=fieldBranches[id];
  const V=label(id),D=label(profile.dominant),F=label(profile.felt),B=label(profile.blind),O=label(fieldOpposites[id]);
  const names=ids=>list(ids.map(label));
  const cycle=[profile.dominant,feltFieldOf[profile.dominant],feltFieldOf[feltFieldOf[profile.dominant]],profile.dominant].map(label).join(' → ');
  const open=tierBranchKinds[tier].reduce((sum,kind)=>sum+branches[kind].length,0);
  const paragraphs=[`${V} is steeped in ${D}: it is one of the four corners of ${D}'s golden rectangle.`];
  if(tier==='aligned')paragraphs.push(`${D} is the only field ${V} can sense, so only one branch is open: to its kin, ${names(branches.kin)}, across the short side of that rectangle.`);
  if(tier!=='aligned')paragraphs.push(`${V} has begun to feel ${F} pressing on ${D}. Everything aligned to ${D} feels ${F} first, never ${B}; the fields lean on one another in a fixed cycle (${cycle}). Two branches open into ${F}: ${names(branches.felt)}.`);
  if(tier==='master'){
    paragraphs.push(`${V} finds ${B}, the field it was never measured in. Its value there is zero: ${B} is the axis standing straight out of ${D}'s rectangle. The last two branches open into ${B}: ${names(branches.blind)}. With all five open, the three fields stop reading as three.`);
    paragraphs.push(`The farthest point, ${O}, is also aligned to ${D}: ${V}'s own field turned inside out. No branch reaches it directly. Of the ten shortest routes there, four cross both ${F} and ${B}, one leaving along each felt or blind branch. Those four are drawn.`);
    paragraphs.push('In the Multiverse cube every corner holds all three fields in equal measure (1 : 1 : 1). That balance is what mastery sees.');
  }
  return {title:V,subtitle:`Aligned to ${D}`,open,paragraphs,showBalanced:tier==='master'};
}

export class FieldsViewer{
  constructor(viewport,{labelsContainer,onSelect}={}){
    this.viewport=viewport;this.onSelect=onSelect;this.active=false;this.selected='a';this.tier='aligned';
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#000000');
    this.camera=new THREE.OrthographicCamera(-4,4,3,-3,0.01,100);
    this.renderer=new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.domElement.setAttribute('aria-label','The solid colored by field, with the selected vertex’s open branches');
    viewport.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.enableZoom=false;this.controls.enabled=false;
    this.reset();
    for(const [a,b] of icosahedronEdges){
      const geometry=new THREE.BufferGeometry().setFromPoints([vector(solidPositions[a]),vector(solidPositions[b])]);
      this.scene.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#3b4659'})));
    }
    // Each field is a plane: its four vertices form a golden rectangle.
    for(const field of fieldIds){
      const members=fieldMembers[field],d=fieldIds.indexOf(field),f=fieldIds.indexOf(feltFieldOf[field]);
      const corners=members.map(id=>vector(solidPositions[id])).sort((p,q)=>Math.atan2(p.getComponent(f),p.getComponent(d))-Math.atan2(q.getComponent(f),q.getComponent(d)));
      const color=new THREE.Color(fieldColors[field]);
      this.scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners),new THREE.LineBasicMaterial({color,transparent:true,opacity:0.4,depthWrite:false})));
      const plane=new THREE.BufferGeometry().setFromPoints(corners);plane.setIndex([0,1,2,0,2,3]);
      this.scene.add(new THREE.Mesh(plane,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.07,side:THREE.DoubleSide,depthWrite:false})));
    }
    this.points=new Map();
    const sphere=new THREE.SphereGeometry(0.095,20,14);
    for(const {id} of activeNodes){
      const color=fieldColors[fieldProfiles[id].dominant];
      const mesh=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color,transparent:true}));
      mesh.position.copy(vector(solidPositions[id]));mesh.userData.id=id;this.scene.add(mesh);
      const label=document.createElement('span');label.className='point-label';label.style.color=color;labelsContainer.append(label);
      this.points.set(id,{mesh,label});
    }
    const halo=new THREE.SphereGeometry(0.19,20,14);
    this.selectedHalo=new THREE.Mesh(halo,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0.22,depthWrite:false}));
    this.oppositeHalo=new THREE.Mesh(halo,new THREE.MeshBasicMaterial({transparent:true,opacity:0.3,depthWrite:false,wireframe:true}));
    this.scene.add(this.selectedHalo,this.oppositeHalo);
    this.highlights=new THREE.Group();this.scene.add(this.highlights);
    this.cylinder=new THREE.CylinderGeometry(1,1,1,10);
    // Click (not drag) selects the nearest vertex under the pointer.
    let down=null;const raycaster=new THREE.Raycaster();
    this.renderer.domElement.addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY];});
    this.renderer.domElement.addEventListener('pointerup',event=>{
      if(!down||Math.hypot(event.clientX-down[0],event.clientY-down[1])>5)return;
      const rect=this.renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),this.camera);
      const hit=raycaster.intersectObjects([...this.points.values()].map(p=>p.mesh))[0];
      if(hit)this.onSelect?.(hit.object.userData.id);
    });
    this.unsubscribe=subscribe(()=>this.refreshLabels());this.refreshLabels();
    this.update();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(viewport);
    this.renderer.setAnimationLoop(()=>{if(this.active)this.frame();});
  }
  refreshLabels(){for(const [id,p] of this.points)p.label.textContent=getLabel(id);}
  setActive(active){this.active=active;this.controls.enabled=active;if(active)this.resize();}
  resize(){
    const w=this.viewport.clientWidth,h=this.viewport.clientHeight;if(!w||!h)return;
    this.renderer.setSize(w,h);const halfHeight=Math.max(2.5,2.25*h/w);
    this.camera.top=halfHeight;this.camera.bottom=-halfHeight;this.camera.left=-halfHeight*w/h;this.camera.right=halfHeight*w/h;this.camera.updateProjectionMatrix();
  }
  reset(){
    const up=vector(solidPositions.a).addScaledVector(vector(fieldsHomeDirection),-vector(solidPositions.a).dot(vector(fieldsHomeDirection))).normalize();
    this.controls.enableDamping=false;this.controls.target.set(0,0,0);this.camera.position.copy(vector(fieldsHomeDirection).multiplyScalar(8));
    this.camera.up.copy(up);this.camera.lookAt(0,0,0);this.controls.update();this.controls.enableDamping=true;
  }
  setSelection(id,tier){this.selected=id;this.tier=tier;this.update();}
  tube(from,to,radius,color,opacity){
    const a=vector(solidPositions[from]),b=vector(solidPositions[to]),direction=b.clone().sub(a);
    const mesh=new THREE.Mesh(this.cylinder,new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity>=1}));
    mesh.position.copy(a).add(b).multiplyScalar(0.5);mesh.scale.set(radius,direction.length(),radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());this.highlights.add(mesh);
  }
  update(){
    for(const child of [...this.highlights.children]){child.material.dispose();this.highlights.remove(child);}
    const id=this.selected,branches=fieldBranches[id],lit=new Set([id]);
    for(const kind of tierBranchKinds[this.tier])for(const other of branches[kind]){lit.add(other);this.tube(id,other,0.034,fieldColors[fieldProfiles[other].dominant],1);}
    const opposite=fieldOpposites[id],master=this.tier==='master';
    if(master){
      const drawn=new Set();
      for(const route of oppositeRoutes[id])for(let i=1;i<route.length-1;i++){
        const key=[route[i],route[i+1]].sort().join(':');lit.add(route[i+1]);
        if(!drawn.has(key)){drawn.add(key);this.tube(route[i],route[i+1],0.016,'#d8dee9',0.6);}
      }
    }
    this.selectedHalo.position.copy(vector(solidPositions[id]));
    this.oppositeHalo.visible=master;this.oppositeHalo.position.copy(vector(solidPositions[opposite]));
    this.oppositeHalo.material.color.set(fieldColors[fieldProfiles[opposite].dominant]);
    for(const [pointId,p] of this.points){p.mesh.material.opacity=lit.has(pointId)?1:0.3;p.label.classList.toggle('dim',!lit.has(pointId));p.label.classList.toggle('selected',pointId===id);}
  }
  frame(){
    if(!this.viewport.clientWidth||!this.viewport.clientHeight)return;
    this.controls.update();this.camera.updateMatrixWorld();
    const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1),view=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,2);
    const occluded=getOccludedVertexIds([...this.points].map(([id,p])=>({id,x:p.mesh.position.dot(right),y:p.mesh.position.dot(up),depth:p.mesh.position.dot(view)})));
    for(const [id,p] of this.points){
      const screen=p.mesh.position.clone().project(this.camera);
      p.label.hidden=occluded.has(id);
      p.label.style.left=`${(screen.x+1)*this.viewport.clientWidth/2}px`;
      p.label.style.top=`${(1-screen.y)*this.viewport.clientHeight/2-19}px`;
    }
    this.renderer.render(this.scene,this.camera);
  }
}

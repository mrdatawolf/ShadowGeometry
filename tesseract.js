import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {nodes,vertexColors,tesseractEdges,flatPositions,vertexW,getOccludedVertexIds} from './geometry.js';
import {getLabel,subscribe} from './labels.js';

const colors={primal:'#78aaff',derived:'#f19886',synthesis:'#e5d18c'};
const pointColor=id=>vertexColors[id]??colors.synthesis;
// Perspective divide on w: a fixed focal distance beyond the +-1 range gives
// visible size contrast between the two w layers without either blowing up.
const FOCAL=2.5;
// One full revolution roughly every 36s at rest; purely a pleasant default.
const AUTO_SPEED=Math.PI*2/36000;

export class TesseractViewer{
  constructor(viewport,card,status){
    this.viewport=viewport;this.card=card;this.status=status;this.active=false;
    this.theta=0;this.autoRotate=true;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#000000');
    this.camera=new THREE.OrthographicCamera(-4,4,3,-3,0.01,100);
    this.camera.position.set(0,2.2,7.5);this.camera.up.set(0,1,0);this.camera.lookAt(0,0,0);
    this.renderer=new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.domElement.setAttribute('aria-label',"Three-dimensional shadow of the fourteen points' four-dimensional figure");
    viewport.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.enableZoom=false;this.controls.enabled=false;
    this.points=[];this.lines=[];
    const sphere=new THREE.SphereGeometry(0.095,20,14);
    for(const node of nodes){
      const color=pointColor(node.id);
      const mesh=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color,depthWrite:true}));
      this.scene.add(mesh);
      const label=document.createElement('span');label.className='point-label';label.style.color=color;
      document.getElementById('tesseract-labels').append(label);
      this.points.push({node,mesh,label,position4:[...flatPositions[node.id],vertexW[node.id]]});
    }
    for(const edge of tesseractEdges){
      const fromFamily=nodes.find(n=>n.id===edge.from).family;
      const dashed=edge.group==='dualityAxes'||edge.group.endsWith('Hidden')||(edge.group==='triangles'&&fromFamily==='derived');
      const color=edge.group==='synthesis'?colors.synthesis:edge.group==='dualityAxes'?'#a1aec3':edge.group.startsWith('hexRing')?'#69778d':colors[fromFamily];
      const material=dashed?new THREE.LineDashedMaterial({color,transparent:true,dashSize:0.07,gapSize:0.05,depthWrite:false}):new THREE.LineBasicMaterial({color,transparent:true,depthWrite:false});
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
      const line=new THREE.Line(geometry,material);this.scene.add(line);
      this.lines.push({edge,line});
    }
    this.unsubscribe=subscribe(()=>this.refreshLabels());this.refreshLabels();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(viewport);
    this.lastTime=performance.now();
    this.renderer.setAnimationLoop(now=>{const dt=Math.min(now-this.lastTime,60);this.lastTime=now;if(this.active)this.frame(dt);});
  }
  refreshLabels(){for(const p of this.points)p.label.textContent=getLabel(p.node.id);}
  setActive(active){this.active=active;this.controls.enabled=active;if(active)this.resize();}
  resize(){
    const w=this.viewport.clientWidth,h=this.viewport.clientHeight;if(!w||!h)return;
    this.renderer.setSize(w,h);const halfHeight=Math.max(3,2.35*h/w);
    this.camera.top=halfHeight;this.camera.bottom=-halfHeight;this.camera.left=-halfHeight*w/h;this.camera.right=halfHeight*w/h;this.camera.updateProjectionMatrix();
  }
  setTheta(value){this.theta=value;this.autoRotate=false;}
  setAutoRotate(value){this.autoRotate=value;}
  reset(){this.theta=0;this.autoRotate=true;this.controls.enableDamping=false;this.controls.target.set(0,0,0);this.camera.position.set(0,2.2,7.5);this.camera.up.set(0,1,0);this.controls.update();this.controls.enableDamping=true;}
  // Rotating (z,w) by theta: at rest z is 0 for every point, so it stays a
  // flat pair of nested hexagons until theta moves it off zero - the classic
  // tesseract-turning-inside-out look, driven by the real fourth coordinate.
  project(position4){
    const [x,y,z,w]=position4,cos=Math.cos(this.theta),sin=Math.sin(this.theta);
    const z2=z*cos-w*sin,w2=z*sin+w*cos,scale=FOCAL/(FOCAL-w2);
    return new THREE.Vector3(x*scale,y*scale,z2*scale);
  }
  frame(dt){
    if(!this.viewport.clientWidth||!this.viewport.clientHeight)return;
    if(this.autoRotate)this.theta=(this.theta+AUTO_SPEED*dt)%(Math.PI*2);
    this.onThetaChange?.(this.theta);
    this.controls.update();this.camera.updateMatrixWorld();
    const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1),view=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,2);
    const projected=new Map();
    for(const p of this.points){const pos=this.project(p.position4);p.mesh.position.copy(pos);projected.set(p.node.id,{pos,x:pos.dot(right),y:pos.dot(up),depth:pos.dot(view)});}
    const occluded=getOccludedVertexIds([...projected].map(([id,v])=>({id,x:v.x,y:v.y,depth:v.depth})));
    for(const p of this.points){
      const occ=occluded.has(p.node.id);p.mesh.visible=!occ;
      const screen=p.mesh.position.clone().project(this.camera);
      p.label.hidden=occ||screen.z<-1||screen.z>1;
      p.label.style.left=`${(screen.x+1)*this.viewport.clientWidth/2}px`;
      p.label.style.top=`${(1-screen.y)*this.viewport.clientHeight/2-19}px`;
    }
    for(const {edge,line} of this.lines){
      const from=projected.get(edge.from).pos,to=projected.get(edge.to).pos;
      const positions=line.geometry.attributes.position;
      positions.setXYZ(0,from.x,from.y,from.z);positions.setXYZ(1,to.x,to.y,to.z);positions.needsUpdate=true;
      line.geometry.computeBoundingSphere();if(line.material.isLineDashedMaterial)line.computeLineDistances();
    }
    this.renderer.render(this.scene,this.camera);
  }
}

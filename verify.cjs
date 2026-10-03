// Run: node --experimental-vm-modules verify.cjs
// Browser-free checks; no dependencies or build step.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
async function run() {
  for (const name of ['geometry.js', 'labels.js', 'app.js', 'stereo.js']) {
    new vm.SourceTextModule(fs.readFileSync(name, 'utf8'));
  }
  const geometry = new vm.SourceTextModule(fs.readFileSync('geometry.js', 'utf8'));
  await geometry.link(() => {}); await geometry.evaluate();
  const g = geometry.namespace;
  assert.equal(g.nodes.length, 14);
  assert.equal(new Set(Object.values(g.vertexColors)).size,12,'Every active vertex must have a distinct identity color');
  for(const id of g.outerIds)assert.equal((g.vertexHues[`${id}Prime`]-g.vertexHues[id]+360)%360,180,'Each prime must use its partner’s complementary hue');
  assert.equal(g.icosahedronEdges.length, 30);
  assert.equal(new Set(g.activeNodes.map(n=>JSON.stringify(g.solidPositions[n.id]))).size,12,'Use every physical corner once');
  const expectedRadius=Math.sqrt(1+((1+Math.sqrt(5))/2)**2);
  for(const node of g.activeNodes)assert(Math.abs(Math.hypot(...g.solidPositions[node.id])-expectedRadius)<1e-10);
  for(const node of g.nodes)assert.equal(g.nodes.find(n=>n.id===node.pairId).pairId,node.id,'Logical pair IDs must remain reciprocal');
  for (const id of Object.keys(g.solidPositions).filter(id => !id.startsWith('g'))) {
    assert.equal(g.icosahedronEdges.filter(e => e.includes(id)).length, 5);
  }
  const counts = Object.fromEntries([...new Set(g.edges.map(e => e.group))].map(group => [group, g.edges.filter(e => e.group === group).length]));
  assert.equal(counts.hexRing, 6); assert.equal(counts.triangles, 6);
  assert.equal(counts.hexRingHidden, 6); assert.equal(counts.trianglesHidden, 6);
  assert.equal(counts.dualityAxes, 7); assert.equal(counts.synthesis, 6);
  const key = ([a,b]) => [a,b].sort().join(':');
  const familiar = new Set(g.edges.filter(e => /hexRing|triangles/.test(e.group)).map(e => key([e.from,e.to])));
  const extras = g.edges.filter(e => e.group === 'icosahedronExtra');
  assert(extras.every(e => !familiar.has(key([e.from,e.to]))));
  assert.equal(extras.length, g.icosahedronEdges.filter(e => !familiar.has(key(e))).length);
  assert.equal(extras.length,18);
  const beforeSnap=JSON.stringify(g.solidPositions);
  const snapped=g.findVisualSnap([0,0.03,1],90);
  assert(snapped, 'Nearby projected points should attract the camera');
  assert(snapped.angle<=Math.PI/36 && snapped.gap<=18);
  const delta=g.solidPositions[snapped.from].map((v,i)=>v-g.solidPositions[snapped.to][i]);
  const cross=[delta[1]*snapped.direction[2]-delta[2]*snapped.direction[1],delta[2]*snapped.direction[0]-delta[0]*snapped.direction[2],delta[0]*snapped.direction[1]-delta[1]*snapped.direction[0]];
  assert(Math.hypot(...cross)<1e-10,'Snapped points must project to exactly the same position');
  const opposite=g.findVisualSnap([0,-0.03,-1],90);
  assert(opposite && opposite.direction[2]<0,'Snapping must keep the camera on its existing side');
  assert.equal(g.findVisualSnap([0,0.03,1],90,0),null,'A zero capture radius must reject near misses');
  assert.equal(g.findVisualSnap([1,2,3],90,18,1e-9),null,'Distant viewing angles must not snap');
  assert.equal(g.findVisualSnap([0,0,0],90),null);
  assert.equal(JSON.stringify(g.solidPositions),beforeSnap,'Visual snapping must preserve the solid');
  const projectShadow=view=>{
    const norm=v=>{const length=Math.hypot(...v);return v.map(x=>x/length);};
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const direction=norm(view),right=norm(cross(direction,Math.abs(direction[1])<0.9?[0,1,0]:[1,0,0])),up=cross(direction,right);
    const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
    return g.nodes.filter(n=>n.family!=='synthesis').map(n=>({id:n.id,x:dot(g.solidPositions[n.id],right),y:dot(g.solidPositions[n.id],up),depth:dot(g.solidPositions[n.id],direction)}));
  };
  const pairEdges=new Set(g.icosahedronEdges.map(key));
  assert.equal(g.activeNodes.length,12);
  assert(g.activeNodes.every(n=>n.family!=='synthesis'));
  const visibleEdges=new Set(g.stage3Edges.map(e=>key([e.from,e.to])));
  for(const edge of g.icosahedronEdges)assert(visibleEdges.has(key(edge)),'Every physical outer edge must remain visible');
  for(const edge of g.edges.filter(e=>e.group==='triangles'))assert(visibleEdges.has(key([edge.from,edge.to])),'Both original triangles must remain visible');
  assert(g.stage3Edges.every(e=>pairEdges.has(key([e.from,e.to]))||/^(hexRing|triangles)(Hidden)?$/.test(e.group)),'The solid must preserve the familiar ring/triangle layers');
  assert(g.stage3Edges.every(e=>!['g','gPrime'].includes(e.from)&&!['g','gPrime'].includes(e.to)));
  const [faceA,faceB]=g.icosahedronEdges[0];
  const faceC=g.nodes.find(n=>pairEdges.has(key([faceA,n.id]))&&pairEdges.has(key([faceB,n.id]))).id;
  const faceNormal=g.solidPositions[faceA].map((v,i)=>v+g.solidPositions[faceB][i]+g.solidPositions[faceC][i]);
  const hex=g.analyzeShadow(projectShadow(faceNormal));
  assert.equal(hex.corners,6);assert.equal(hex.kind,'hexagon','Face-axis view must form a regular hexagon silhouette');
  const faceAlignment=g.getShadowAlignment(projectShadow(faceNormal),hex.corners);
  assert.equal(faceAlignment.alignedPairs,0);
  assert.equal(faceAlignment.kind,'other','A regular-looking hexagonal outline without aligned vertices must stay black');
  const ten=g.analyzeShadow(projectShadow(g.solidPositions.a));
  assert.equal(ten.corners,10);assert.equal(ten.kind,'ten','Vertex-axis view must form ten silhouette corners');
  const irregular=g.analyzeShadow(projectShadow([0,0,1]));
  assert.equal(irregular.corners,6);assert.equal(irregular.kind,'other','An irregular six-corner outline must not count as a proper hexagon');
  assert.equal(g.analyzeShadow([]).kind,'other');
  const regularHex=Array.from({length:6},(_,i)=>{const angle=Math.PI/2-i*Math.PI/3;return {id:`corner${i}`,x:Math.cos(angle),y:Math.sin(angle)};});
  const hexDiagram=g.getShadowDiagram([...regularHex,{id:'inside',x:0,y:0}]);
  assert.equal(hexDiagram.ring.length,6);assert.equal(hexDiagram.triangles.length,2);
  assert.equal(hexDiagram.triangles[0][0].id,'corner0','First triangle starts at the top vertex');
  assert(hexDiagram.triangles[1].some(p=>p.id==='corner3'),'Second triangle includes the bottom vertex');
  const firstIds=new Set(hexDiagram.triangles[0].map(p=>p.id));
  assert(hexDiagram.triangles[1].every(p=>!firstIds.has(p.id)),'Triangles use separate alternating corner sets');
  assert.equal(new Set(hexDiagram.triangles.flat().map(p=>p.id)).size,6);
  const flatTopHex=Array.from({length:6},(_,i)=>{const angle=Math.PI/3-i*Math.PI/3;return {id:`flat${i}`,x:Math.cos(angle),y:Math.sin(angle)};});
  const flatTopDiagram=g.getShadowDiagram(flatTopHex);
  assert.equal(flatTopDiagram.triangles[0][0].id,'flat5','Tied top heights must start at the leftmost corner');
  assert.equal(g.getShadowDiagram(Array.from({length:10},(_,i)=>({id:`ten${i}`,x:Math.cos(i*Math.PI/5),y:Math.sin(i*Math.PI/5)}))).triangles.length,0);
  assert.equal(g.getShadowDiagram([]).triangles.length,0);
  const homeAlignment=g.getShadowAlignment(projectShadow(g.solidHomeDirection),6);
  assert.equal(homeAlignment.alignedPairs,4);assert.equal(homeAlignment.kind,'hexagon','The aligned opening hexagon must be green');
  const unaligned=g.solidHomeDirection.map((v,i)=>v+(i===0?0.025:0));
  assert.equal(g.getShadowAlignment(projectShadow(unaligned),6).kind,'other','A nearby unsnapped view must not turn green');
  assert.equal(g.getShadowAlignment(projectShadow(g.solidHomeDirection),8).kind,'other','Alignment must also have a six-corner silhouette');
  const hiddenHome=g.getOccludedVertexIds(projectShadow(g.solidHomeDirection));
  assert.deepEqual([...hiddenHome].sort(),['aPrime','dPrime','ePrime','fPrime']);
  assert.equal(g.getOccludedVertexIds([{id:'rear',x:0,y:0,depth:-1},{id:'front',x:0,y:0,depth:1}]).has('rear'),true);
  assert.equal(g.getOccludedVertexIds([{id:'left',x:-1,y:0,depth:0},{id:'right',x:1,y:0,depth:1}]).size,0);
  assert.equal(g.getOccludedVertexIds([{id:'one',x:0,y:0,depth:1},{id:'two',x:0,y:0,depth:1}]).size,0,'Equal-depth vertices must not arbitrarily hide one another');
  const defaults = JSON.parse(fs.readFileSync('labels.default.json', 'utf8'));
  assert.deepEqual(JSON.parse(fs.readFileSync('slices.default.json', 'utf8')), []);
  let stored = null, confirmation = true;
  const context = vm.createContext({
    structuredClone, Blob, Date, Math, JSON, Set, Object, Error,
    document: {querySelector: () => ({textContent: JSON.stringify(defaults)})},
    fetch: async url => ({ok: true, json: async () => url.startsWith('labels') ? defaults : []}),
    localStorage: {getItem: () => stored, setItem: (key, value) => {stored = value;}},
    confirm: () => confirmation
  });
  const model = new vm.SourceTextModule(fs.readFileSync('geometry.js', 'utf8'), {context});
  await model.link(() => {}); await model.evaluate();
  const labels = new vm.SourceTextModule(fs.readFileSync('labels.js', 'utf8'), {context});
  await labels.link(() => model); await labels.evaluate();
  const l = labels.namespace;
  await l.loadConfig(); assert.equal(l.getLabel('a'), defaults.a);
  // Execute the real app's shadow drawing and reveal clock with a mock canvas.
  // Only browser boot is omitted; the production projection and edge-alpha
  // functions run unchanged. No WebGL renderer is needed for these checks.
  class Vector3 {
    constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
    clone(){return new Vector3(this.x,this.y,this.z);}
    copy(v){Object.assign(this,{x:v.x,y:v.y,z:v.z});return this;}
    lerp(v,t){this.x+=(v.x-this.x)*t;this.y+=(v.y-this.y)*t;this.z+=(v.z-this.z)*t;return this;}
    sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
    dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
    cross(v){const x=this.y*v.z-this.z*v.y,y=this.z*v.x-this.x*v.z,z=this.x*v.y-this.y*v.x;Object.assign(this,{x,y,z});return this;}
    multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
    addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
    normalize(){return this.multiplyScalar(1/Math.hypot(this.x,this.y,this.z));}
    toArray(){return [this.x,this.y,this.z];}
    setFromMatrixColumn(matrix,index){return this.copy(matrix.columns[index]);}
    project(camera){const p=this.clone();this.x=p.dot(camera.matrixWorld.columns[0])/4;this.y=p.dot(camera.matrixWorld.columns[1])/3;this.z=0;return this;}
  }
  const canvasContext={strokes:[],strokeStyles:[],dots:[],labels:[],setTransform(){},clearRect(){this.strokes=[];this.strokeStyles=[];this.dots=[];this.labels=[];},setLineDash(dash){this.dash=dash;},beginPath(){this.segment=[];},moveTo(x,y){this.segment.push([x,y]);},lineTo(x,y){this.segment.push([x,y]);},closePath(){this.segment.push(this.segment[0]);},stroke(){this.strokes.push(this.segment);this.strokeStyles.push({color:this.strokeStyle,dash:[...this.dash]});},arc(x,y){this.dots.push([x,y]);},fill(){},fillText(label){this.labels.push(label);}};
  const canvas={clientWidth:320,clientHeight:280,style:{},getContext:()=>canvasContext};
  const dom={viewport:{clientHeight:560},shadow:canvas,'shadow-shape':{textContent:''},'scene-card':{dataset:{}}};
  context.document.getElementById=id=>dom[id];context.devicePixelRatio=1;
  const three=new vm.SyntheticModule(['Vector3','MathUtils'],function(){this.setExport('Vector3',Vector3);this.setExport('MathUtils',{clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),lerp:(a,b,t)=>a+(b-a)*t});},{context});
  const orbit=new vm.SyntheticModule(['OrbitControls'],function(){this.setExport('OrbitControls',class {});},{context});
  const appSource=fs.readFileSync('app.js','utf8');
  const testHooks=`
    export function initHomeCheck(){
      stage=2;solidTime=SOLID_END;extraTime=0;extraRevealed=false;transition=null;
      orbitStartView.copy(vector(solidHomeDirection));
      const direction=vector(solidHomeDirection),right=new THREE.Vector3(
        homeUp.y*direction.z-homeUp.z*direction.y,
        homeUp.z*direction.x-homeUp.x*direction.z,
        homeUp.x*direction.y-homeUp.y*direction.x).normalize();
      camera={position:homePosition.clone(),matrixWorld:{columns:[right,homeUp,direction]}};
      controls={target:homeTarget.clone(),update(){}};scene={background:{set(){}}};
      for(const node of activeNodes)objects.set(node.id,{node,mesh:{position:vector(solidPositions[node.id]),visible:true},label:{hidden:false},alpha:1});
      for(const edge of edges){if(!objects.has(edge.from)||!objects.has(edge.to))continue;
        lines.set(edge.id,{edge,color:colors[objects.get(edge.from).node.family],line:{material:{isLineDashedMaterial:edge.group.endsWith('Hidden')||edge.group==='dualityAxes'||(edge.group==='triangles'&&objects.get(edge.from).node.family==='derived')}}});
      }
      applyVertexOcclusion();return homePosition.toArray();
    }
    export function drawHomeCheck(){
      for(const obj of lines.values())obj.alpha=getEdgeAlpha(obj.edge,1,solidTime,extraTime);
      shadow();return [...lines.values()].filter(obj=>obj.alpha>0.001).map(obj=>obj.edge.group);
    }
    export function advanceRevealCheck(direction,gesture,dt){
      camera.position=vector(direction).normalize().multiplyScalar(8);orbitGesture=gesture;tickMotion(dt);
      return extraTime;
    }
    export function getPointStateCheck(){
      return [...objects].map(([id,obj])=>({id,occluded:obj.occluded,meshVisible:obj.mesh.visible,labelHidden:obj.label.hidden,x:obj.mesh.position.dot(camera.matrixWorld.columns[0]),y:obj.mesh.position.dot(camera.matrixWorld.columns[1]),depth:obj.mesh.position.dot(camera.matrixWorld.columns[2])}));
    }
    export function setShadowViewCheck(direction){
      const view=vector(direction).normalize();
      let up=homeUp.clone().addScaledVector(view,-homeUp.dot(view)).normalize();
      const right=up.clone().cross(view).normalize();
      camera.matrixWorld={columns:[right,up,view]};
      for(const obj of objects.values())obj.label.hidden=false;
      applyVertexOcclusion();
    }
  `;
  const app=new vm.SourceTextModule(appSource.slice(0,appSource.lastIndexOf('\nmain().catch'))+testHooks,{context});
  const stereo=new vm.SourceTextModule(fs.readFileSync('stereo.js','utf8'),{context});
  await stereo.link(specifier=>specifier==='three'?three:specifier.includes('OrbitControls')?orbit:specifier==='./geometry.js'?model:labels);
  await stereo.evaluate();
  const fakeCamera=()=>({left:-4,right:4,position:new Vector3(),up:new Vector3(0,1,0),matrixWorld:{columns:[]},lookAt(target){const direction=this.position.clone().sub(target).normalize(),right=this.up.clone().cross(direction).normalize();this.matrixWorld.columns=[right,direction.clone().cross(right),direction];},updateMatrixWorld(){},updateProjectionMatrix(){}});
  const stereoInstance=Object.create(stereo.namespace.StereoViewer.prototype);
  Object.assign(stereoInstance,{viewport:{clientWidth:800,clientHeight:400,style:{setProperty(){}}},card:{dataset:{}},camera:fakeCamera(),eyeCameras:[fakeCamera(),fakeCamera()],scene:{},extraTime:0,extraEnd:1815,revealing:false,dragging:false});
  stereoInstance.camera.position.copy(new Vector3(...g.solidHomeDirection).multiplyScalar(8));
  const stereoUp=new Vector3(...g.solidPositions.a),stereoDirection=new Vector3(...g.solidHomeDirection);
  stereoInstance.camera.up.copy(stereoUp.addScaledVector(stereoDirection,-stereoUp.dot(stereoDirection)).normalize());
  stereoInstance.camera.lookAt(new Vector3());
  stereoInstance.controls={target:new Vector3(),update(){}};stereoInstance.snap=()=>{};
  stereoInstance.points=g.activeNodes.map(node=>({node,mesh:{position:new Vector3(...g.solidPositions[node.id])},labels:[{style:{}},{style:{}}]}));
  stereoInstance.lines=g.stage3Edges.map(edge=>({edge,index:edge.group==='icosahedronExtra'?extras.findIndex(e=>e.id===edge.id):-1,line:{material:{}}}));
  const stereoRenders=[],stereoRects=[];
  stereoInstance.renderer={setScissorTest(){},setViewport(...rect){stereoRects.push(rect);},setScissor(){},render(scene,camera){stereoRenders.push({camera,visible:stereoInstance.points.filter(p=>p.mesh.visible).map(p=>p.node.id)});}};
  stereoInstance.frame(16);
  assert.equal(stereoRenders.length,2,'One frame must render both eye cameras');
  assert.deepEqual(stereoRects,[[0,0,400,400],[400,0,400,400]]);
  assert.notEqual(stereoRenders[0].camera,stereoRenders[1].camera);
  for(let eye=0;eye<2;eye++){
    const expectedHidden=g.getOccludedVertexIds(stereoInstance.project(stereoInstance.eyeCameras[eye]));
    assert.deepEqual(stereoRenders[eye].visible,Array.from(g.activeNodes.filter(n=>!expectedHidden.has(n.id)),n=>n.id),'Each eye must use its own occlusion');
  }
  assert(stereoInstance.lines.filter(l=>l.edge.group==='icosahedronExtra').every(l=>!l.line.visible),'Stereo entry must preserve orbit-triggered reveal');
  stereoInstance.status={textContent:''};stereoInstance.snapPending=true;stereoInstance.tween={};
  const savedStereo={position:[3,4,5],target:[0.1,0.2,0.3]};
  stereoInstance.visit(savedStereo,'Alignment');
  assert.deepEqual(JSON.parse(JSON.stringify(stereoInstance.getView())),savedStereo,'Stereo bookmark recall must restore the saved central camera exactly');
  assert.equal(stereoInstance.snapPending,false,'Bookmark recall must cancel queued snapping');
  assert.equal(stereoInstance.tween,null);
  assert.equal(stereoInstance.revealing,false,'Bookmark recall must not trigger extra-edge reveal');
  assert.equal(stereoInstance.status.textContent,'Bookmark: Alignment');
  for(let eye=0;eye<2;eye++){
    const c=stereoInstance.eyeCameras[eye],span=c.right-c.left;
    const targetX=-((c.left+c.right)/2)/span*400+200;
    assert(Math.abs(targetX-200)<1e-10,'Default 29em spacing must cap to 400px on this viewport, centering each image in its half');
  }
  const dotStereo=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  for(const view of [[0,0,8],[3,4,5],Array.from(g.solidHomeDirection,v=>v*8)]){
    const pair=stereo.namespace.getStereoFrames(view,[0,0,0],[0,1,0],4);
    const left=pair.screenLeft,right=pair.screenRight;
    assert(Math.abs(Math.hypot(...left.position)-Math.hypot(...view))<1e-10);
    assert(Math.abs(Math.hypot(...right.position)-Math.hypot(...view))<1e-10);
    for(const node of g.activeNodes){
      const p=g.solidPositions[node.id];
      assert(Math.abs(dotStereo(p,left.up)-dotStereo(p,right.up))<1e-10,'Stereo eyes must have no vertical disparity');
    }
    assert(dotStereo(left.position,right.right)>0,'Screen-left camera must be the right eye for crossed-eye viewing');
    const zero=stereo.namespace.getStereoFrames(view,[0,0,0],[0,1,0],0);
    assert.deepEqual(Array.from(zero.screenLeft.position),Array.from(zero.screenRight.position));
  }
  await app.link(specifier=>specifier==='three'?three:specifier.includes('OrbitControls')?orbit:specifier==='./geometry.js'?model:specifier==='./stereo.js'?stereo:labels);
  await app.evaluate();const appTest=app.namespace;
  const clockwiseOrder=points=>{
    const center={x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length};
    const sorted=[...points].sort((a,b)=>Math.atan2(a.x-center.x,a.y-center.y)-Math.atan2(b.x-center.x,b.y-center.y));
    const at=sorted.findIndex(p=>p.id==='a');return [...sorted.slice(at),...sorted.slice(0,at)].map(p=>p.id);
  };
  for(const fold of [0,0.1,0.25,0.5,0.75,0.9,1]){
    const target=new Vector3(0,-0.15*(1-fold),0);
    const position=new Vector3(0,-0.15,8).lerp(new Vector3(...g.solidHomeDirection).multiplyScalar(8),fold);
    const direction=position.sub(target).normalize();
    const up=appTest.getFoldCameraUp(fold);
    const top=appTest.getFoldPosition('a',fold).sub(target);
    const right=new Vector3(up.y*direction.z-up.z*direction.y,up.z*direction.x-up.x*direction.z,up.x*direction.y-up.y*direction.x);
    assert(Math.abs(top.dot(right))<1e-10&&top.dot(up)>0,'a must remain upright and centered throughout the direct fold');
    const projected=g.outerIds.map(id=>{const p=appTest.getFoldPosition(id,fold).sub(target);return {id,x:p.dot(right),y:p.dot(up)};});
    assert.deepEqual(clockwiseOrder(projected),Array.from(g.outerIds),'The flat ring order must survive every part of the fold');
    assert.equal(g.analyzeShadow(projected,1e-8).corners,6,'The ring must remain convex throughout the fold');
  }
  const home=appTest.initHomeCheck();assert(home.every((v,i)=>Math.abs(v-8*g.solidHomeDirection[i])<1e-12));
  const entryGroups=appTest.drawHomeCheck();
  assert.equal(canvas.style.backgroundColor,'#000000','Viewing background must stay black');
  assert.equal(dom['scene-card'].dataset.alignment,'hexagon','Aligned hexagons must select the green outer border');
  assert.equal(entryGroups.length,12);assert.equal(canvasContext.strokes.length,3,'Six-corner shadow draws only its ring and two triangles');assert.equal(canvasContext.dots.length,6,'Hexagon shadows must show only their six outline vertices');
  assert.deepEqual([...canvasContext.labels].sort(),g.outerIds.map(id=>defaults[id]).sort());
  assert.deepEqual([...new Set(entryGroups)].sort(),['hexRing','triangles']);
  assert.deepEqual(canvasContext.strokes.map(s=>s.length),[7,4,4]);
  assert(canvasContext.strokes.every(s=>s.every(p=>p.every(Number.isFinite))));
  assert.deepEqual(canvasContext.strokeStyles.map(s=>s.color),['#91a0b5','#78aaff','#f19886']);
  assert.deepEqual(canvasContext.strokeStyles.map(s=>s.dash.length),[0,0,2]);
  const pointStates=appTest.getPointStateCheck(),homePoints=new Map(pointStates.map(p=>[p.id,p]));
  const a=homePoints.get('a'),aPrime=homePoints.get('aPrime'),e=homePoints.get('e'),ePrime=homePoints.get('ePrime');
  assert(Math.abs(canvasContext.strokes[1][0][0]-(160+a.x*280/5.4))<1e-10&&Math.abs(canvasContext.strokes[1][0][1]-(140-a.y*280/5.4))<1e-10,'Opening first triangle must start at the top corner');
  assert(Math.abs(a.x)<1e-10&&pointStates.filter(p=>!p.occluded).every(p=>p.y<=a.y+1e-10),'The top visible point must be a');
  assert(Math.hypot(a.x-aPrime.x,a.y-aPrime.y)<1e-10&&a.depth>aPrime.depth,'aPrime must be directly behind a');
  assert(Math.hypot(e.x-ePrime.x,e.y-ePrime.y)<1e-10&&e.depth>ePrime.depth,'ePrime must be directly behind e');
  const outerPoints=Array.from(g.outerIds,id=>homePoints.get(id));
  assert.deepEqual(clockwiseOrder(outerPoints),Array.from(g.outerIds));
  const hull=g.analyzeShadow(pointStates.filter(p=>!p.occluded),1e-8).hull;
  assert.deepEqual(Array.from(hull,p=>p.id).sort(),Array.from(g.outerIds).sort(),'Only the six original identities may occupy the opening silhouette');
  const inside=pointStates.filter(p=>p.id.endsWith('Prime')&&!['aPrime','ePrime'].includes(p.id));
  assert.equal(inside.length,4);assert(inside.every(p=>Math.abs(p.y)<1e-10&&Math.abs(p.x)<1.1),'Other primes must occupy the interior');
  assert(Math.hypot(homePoints.get('bPrime').x-homePoints.get('dPrime').x,homePoints.get('bPrime').y-homePoints.get('dPrime').y)<1e-10);
  assert(Math.hypot(homePoints.get('cPrime').x-homePoints.get('fPrime').x,homePoints.get('cPrime').y-homePoints.get('fPrime').y)<1e-10);
  assert.deepEqual(Array.from(pointStates.filter(p=>p.occluded),p=>p.id).sort(),['aPrime','dPrime','ePrime','fPrime']);
  assert(pointStates.filter(p=>p.occluded).every(p=>!p.meshVisible&&p.labelHidden),'Rear meshes and labels must both be hidden');
  assert.equal(pointStates.filter(p=>p.meshVisible).length,8,'Interior vertices must remain visible in the 3D solid');
  const drawnPoints=pointStates.filter(p=>!p.occluded&&g.outerIds.includes(p.id));
  for(let i=0;i<drawnPoints.length;i++){assert(Math.abs(canvasContext.dots[i][0]-(160+drawnPoints[i].x*280/5.4))<1e-10);assert(Math.abs(canvasContext.dots[i][1]-(140-drawnPoints[i].y*280/5.4))<1e-10);}
  const away=g.solidHomeDirection.map((v,i)=>v+(i===0?0.05:0));
  assert.equal(appTest.advanceRevealCheck(g.solidHomeDirection,false,60000),0,'Idle time must not reveal extra edges');
  assert.equal(appTest.advanceRevealCheck(away,false,60000),0,'A scripted camera move must not reveal extra edges');
  assert.equal(appTest.advanceRevealCheck(g.solidHomeDirection,true,16),0,'Pointer-down without motion must not reveal edges');
  assert.equal(appTest.drawHomeCheck().length,12);
  assert(appTest.advanceRevealCheck(away,true,80)>0,'Actual orbit movement must begin the reveal');
  assert(appTest.drawHomeCheck().includes('icosahedronExtra'));
  assert.equal(appTest.drawHomeCheck().filter(group=>group==='icosahedronExtra').length,1,'Initial extra-edge reveal must be staggered');
  appTest.advanceRevealCheck(away,false,5000);
  assert.equal(appTest.drawHomeCheck().filter(group=>group==='icosahedronExtra').length,18);
  assert.equal(canvasContext.strokes.length,3,'Revealed 3D edges must not appear as extra shadow lines');
  appTest.initHomeCheck();assert.equal(appTest.drawHomeCheck().length,12,'Reentry must reset the extra-edge reveal');
  appTest.setShadowViewCheck(faceNormal);appTest.drawHomeCheck();
  assert.equal(canvas.style.backgroundColor,'#000000','Unaligned face-axis hexagonal silhouette must be black in the actual drawing path');
  assert.equal(dom['scene-card'].dataset.alignment,'other','Unaligned views must clear the colored border');
  appTest.setShadowViewCheck(unaligned);appTest.drawHomeCheck();
  assert.equal(canvas.style.backgroundColor,'#000000','Small rotations away from alignment must clear the green background');
  appTest.setShadowViewCheck(g.solidPositions.a);appTest.drawHomeCheck();
  assert.equal(canvas.style.backgroundColor,'#000000','Ten-corner background must also stay black');
  assert.equal(dom['scene-card'].dataset.alignment,'ten','Ten-corner feedback must select the yellow border');
  assert.equal(canvasContext.dots.length,11,'Non-hexagon shadows retain their visible interior vertices');
  assert.equal(canvasContext.strokes.length,1,'Ten-corner shadows must show only the outer ring');
  assert.equal(canvasContext.strokes[0].length,11);
  const synthesisProjection=model.namespace.solidPositions.g.map((v,i)=>v-model.namespace.solidPositions.gPrime[i]);
  assert(synthesisProjection.every((v,i)=>Math.abs(v-0.18*g.solidHomeDirection[i])<1e-12));
  assert.equal(l.getPreferences().snapDistancePixels,18);
  assert.equal(l.getPreferences().stereoSeparationDegrees,4);
  assert.equal(l.getPreferences().stereoSpacingEm,29);
  l.setPreferences({stereoSpacingEm:20});await l.loadConfig();
  assert.equal(l.getPreferences().stereoSpacingEm,20);
  assert.throws(()=>l.setPreferences({stereoSpacingEm:0}));
  l.setPreferences({stereoSeparationDegrees:6.5,stereoLabelsEnabled:true});
  await l.loadConfig();
  assert.equal(l.getPreferences().stereoSeparationDegrees,6.5);
  assert.equal(l.getPreferences().stereoLabelsEnabled,true);
  assert.throws(()=>l.setPreferences({stereoSeparationDegrees:13}));
  assert.throws(()=>l.setPreferences({stereoSeparationDegrees:'4'}));
  l.setPreferences({snapDistancePixels:42,snapEnabled:false});
  assert.equal(JSON.parse(stored).preferences.snapDistancePixels,42);
  await l.loadConfig();assert.equal(l.getPreferences().snapDistancePixels,42);assert.equal(l.getPreferences().snapEnabled,false);
  const exported=l.getExportData();assert.equal(exported.preferences.snapDistancePixels,42);
  assert.equal(exported.preferences.stereoSeparationDegrees,6.5);
  assert.throws(()=>l.setPreferences({snapDistancePixels:81}));
  assert.throws(()=>l.setPreferences({snapDistancePixels:'20'}));
  assert.equal(l.getPreferences().snapDistancePixels,42);
  l.renameLabel('a', 'Origin'); assert.equal(l.getLabel('a'), 'Origin');
  assert.equal(JSON.parse(stored).labels.a, 'Origin');
  const camera = {position: [0,0,8], target: [0,0,0]};
  l.saveSlice('Front', camera); assert.equal(l.getSlices().length, 1);
  const id = l.getSlices()[0].id;
  l.renameSlice(id, 'Renamed'); assert.equal(l.getSlices()[0].name, 'Renamed');
  await l.loadConfig(); assert.equal(l.getLabel('a'), 'Origin'); assert.equal(l.getSlices().length, 1);
  l.deleteSlice(id); await l.loadConfig(); assert.equal(l.getSlices().length, 0);
  confirmation = false;
  await l.importConfig({text: async () => JSON.stringify({labels: defaults, slices: []})});
  assert.equal(l.getLabel('a'), 'Origin');
  assert.equal(l.getPreferences().snapDistancePixels,42,'Cancelled import must preserve preferences');
  confirmation = true;
  await l.importConfig({text:async()=>JSON.stringify(exported)});
  assert.equal(l.getPreferences().snapDistancePixels,42);
  assert.equal(l.getPreferences().snapEnabled,false);
  assert.equal(l.getPreferences().stereoSeparationDegrees,6.5);
  await assert.rejects(l.importConfig({text:async()=>JSON.stringify({...exported,preferences:{snapDistancePixels:-5}})}));
  assert.equal(l.getPreferences().snapDistancePixels,42,'Invalid import must preserve preferences');
  await l.importConfig({text: async () => JSON.stringify({labels: defaults, slices: []})});
  assert.equal(l.getLabel('a'), defaults.a);
  assert.equal(l.getPreferences().snapDistancePixels,18,'Legacy exports use default preferences');
  assert.equal(l.getPreferences().snapEnabled,true);
  assert.equal(l.getPreferences().stereoSeparationDegrees,4);
  assert.equal(l.getPreferences().stereoLabelsEnabled,false);
  await assert.rejects(l.importConfig({text: async () => JSON.stringify({labels: defaults, slices: [{id:'bad'}]})}));
  context.localStorage.setItem = () => {throw Error('Storage disabled');};
  l.renameLabel('b', 'Another'); assert.equal(l.getLabel('b'), 'Another');
  assert(l.persistenceMessage.includes('unavailable'));
  assert(appSource.includes('stage+direction>2')&&!appSource.includes("kind:'layer'"),'Stepper must go directly from flat to solid');
  const pageHtml=fs.readFileSync('index.html','utf8');
  assert(pageHtml.includes('id="flat-tab"')&&pageHtml.includes('>3D</button>'));
  assert(!pageHtml.includes('class="stepper"'),'Stage title strip must be removed above the canvas');
  console.log('PASS: stereo camera ordering, vertical alignment, paired rendering and per-eye occlusion; border feedback, geometry, fold order, shadow triangles, reveal, saved preferences and bookmarks.');
  console.log('Edge counts:', counts);
}
run().catch(error => {console.error(error); process.exitCode = 1;});

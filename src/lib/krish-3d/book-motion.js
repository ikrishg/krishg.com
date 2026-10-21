import * as THREE from 'three';

export class LeafMotion {
 constructor(angle=0,{stiffness=36,damping=8,gravity=5,upright=false}={}){this.angle=angle;this.target=angle;this.velocity=0;this.dragging=false;this.stiffness=stiffness;this.damping=damping;this.gravity=gravity;this.upright=upright;}
 drag(angle,dt){const next=THREE.MathUtils.clamp(angle,0,Math.PI);this.velocity=THREE.MathUtils.clamp((next-this.angle)/Math.max(dt,.016),-10,10);this.angle=next;this.dragging=true;}
 release(){this.dragging=false;const predicted=this.angle+this.velocity*.12;if(this.upright&&predicted>Math.PI/4&&predicted<2.2)this.target=Math.PI/2;else this.target=predicted>Math.PI/2?Math.PI:0;}
 step(dt){if(this.dragging)return;const steps=Math.ceil(Math.min(dt,.1)/.008),h=Math.min(dt,.1)/Math.max(steps,1);for(let i=0;i<steps;i++){const torque=this.stiffness*(this.target-this.angle)-this.damping*this.velocity-this.gravity*Math.cos(this.angle);this.velocity+=torque*h;this.angle+=this.velocity*h;if(this.angle<0){this.angle=0;this.velocity=Math.max(0,-this.velocity*.08);}if(this.angle>Math.PI){this.angle=Math.PI;this.velocity=Math.min(0,-this.velocity*.08);}if(Math.abs(this.angle-this.target)<.0006&&Math.abs(this.velocity)<.02){this.angle=this.target;this.velocity=0;}}}
}

export function attachBookMotion(root,{reducedMotion=false}={}){
 const cover=root.getObjectByName('Cover_Hinge'),coverState=new LeafMotion(0,{stiffness:28,damping:8,gravity:8,upright:true}),coverFlat=2.5;
 const leaves=[];
 root.traverse(object=>{if(!object.name.startsWith('Page_Hinge_'))return;const surfaces=object.children.filter(child=>child.isMesh);for(const surface of surfaces){surface.geometry=surface.geometry.clone();surface.userData.restPosition=surface.geometry.attributes.position.array.slice();surface.material=surface.material.clone();surface.material.side=THREE.FrontSide;}leaves.push({node:object,state:new LeafMotion(),surfaces,restZ:object.userData.stackZ??object.position.z,gutterZ:object.userData.gutterZ??object.position.z});});
 leaves.sort((a,b)=>a.node.userData.pageIndex-b.node.userData.pageIndex);
 const edgeShell=['Page_Block_Fore_Edge','Page_Block_Top_Edge','Page_Block_Bottom_Edge'].map(name=>root.getObjectByName(name)).filter(Boolean),pageGrooves=[];root.traverse(object=>{if(object.name.startsWith('Page_Edge_'))pageGrooves.push(object);});
 let active=null,startX=0,startAngle=0,span=300,lastTime=0,finished=false,closingDelay=0,pendingFlip=0,rightStackThickness=.405;
 const settled=state=>!state.dragging&&Math.abs(state.angle-state.target)<.015&&Math.abs(state.velocity)<.08;
 const allLeavesSettled=()=>leaves.every(leaf=>settled(leaf.state));
 const nextLeaf=()=>leaves.find(leaf=>leaf.state.target<Math.PI/2);
 const previousLeaf=()=>[...leaves].reverse().find(leaf=>leaf.state.target>Math.PI/2);

 function begin(hit,event,camera,rect){
  if(active)return false;
  let part=hit.object;while(part&&part!==root&&!part.name.startsWith('Page_Hinge_')&&part!==cover)part=part.parent;
  if(part===cover)active={node:cover,state:coverState};
  else if(coverState.angle>coverFlat){const candidate=leaves.find(leaf=>leaf.node===part),forward=nextLeaf(),backward=previousLeaf();if(candidate&&(candidate===forward||candidate===backward))active=candidate;}
  if(!active)return false;
  startX=event.clientX;startAngle=active.state.angle;lastTime=event.timeStamp;active.state.dragging=true;pendingFlip=0;
  const right=root.localToWorld(new THREE.Vector3(1.04,0,.23)).project(camera),left=root.localToWorld(new THREE.Vector3(-3.09,0,.23)).project(camera);span=Math.max(150,Math.abs(right.x-left.x)*rect.width/2);return true;
 }
 function move(event){if(!active)return;const angle=startAngle-(event.clientX-startX)/span*Math.PI;active.state.drag(angle,(event.timeStamp-lastTime)/1000);lastTime=event.timeStamp;}
 function end(){if(!active)return;const pagesOpen=leaves.some(leaf=>leaf.state.angle>.4||leaf.state.target>.4);if(active.state===coverState&&pagesOpen){active.state.upright=false;active.state.release();if(coverState.target===0){for(const leaf of leaves)leaf.state.target=0;}else coverState.target=Math.PI;}else{if(active.state===coverState)coverState.upright=true;active.state.release();}active=null;}
 function startFlip(direction){const leaf=direction>0?nextLeaf():previousLeaf();if(!leaf)return;leaf.state.target=direction>0?Math.PI:0;leaf.state.velocity=direction>0?2.4:-2.4;}
 function flip(direction){if(finished)return;if(coverState.angle<coverFlat||!settled(coverState)){coverState.target=Math.PI;pendingFlip=direction;return;}if(!allLeavesSettled()){pendingFlip=direction;return;}startFlip(direction);}
 function tap(hit){
  let part=hit?.object;while(part&&part!==root&&part!==cover&&!part.name.startsWith('Page_Hinge_'))part=part.parent;
  if(part===cover){if(coverState.angle>coverFlat){coverState.target=0;for(const leaf of leaves)leaf.state.target=0;}else if(coverState.angle>1)coverState.target=Math.PI;else coverState.target=Math.PI/2;pendingFlip=0;return true;}
  if(!part?.name.startsWith('Page_Hinge_'))return false;
  if(coverState.angle<=coverFlat){coverState.target=Math.PI;pendingFlip=1;return true;}
  const candidate=leaves.find(leaf=>leaf.node===part);if(candidate===previousLeaf()&&candidate.state.target>Math.PI/2)flip(-1);else if(candidate===nextLeaf())flip(1);return true;
 }
 function deformLeaf(leaf,index){
  const {angle,velocity}=leaf.state,width=leaf.node.userData.pageWidth||2.13,bend=reducedMotion?0:Math.sin(angle)*.34+Math.min(.12,Math.abs(velocity)*.012)*Math.sin(angle),skew=reducedMotion?0:Math.min(.08,Math.abs(velocity)*.008)*Math.sin(angle);
  const progress=THREE.MathUtils.smoothstep(angle,0,Math.PI);
  // Every leaf shares the spine crease. Stack depth is reached inside the gutter,
  // before the type, so buried sheets stay behind the page being read. A crease
  // nudged toward the camera did the opposite and piled text on itself.
  const spacing=leaf.node.userData.stackSpacing||.39/11,crease=leaf.gutterZ;
  leaf.node.position.z=crease;
  const foreZ=THREE.MathUtils.lerp(leaf.restZ,-.15+index*spacing,progress);
  const onLeft=angle>Math.PI/2,bias=onLeft?leaves.length-1-index:index;
  for(const surface of leaf.surfaces){surface.material.polygonOffset=true;surface.material.polygonOffsetFactor=bias;surface.material.polygonOffsetUnits=bias;surface.renderOrder=onLeft?index:-index;}
  const changed=leaf.lastAngle===undefined||Math.abs(leaf.lastAngle-angle)>.0001||Math.abs((leaf.lastVelocity||0)-velocity)>.001;
  if(changed){leaf.lastAngle=angle;leaf.lastVelocity=velocity;for(const surface of leaf.surfaces){const position=surface.geometry.attributes.position,rest=surface.userData.restPosition;for(let i=0;i<position.count;i++){const x=rest[i*3],y=rest[i*3+1],u=THREE.MathUtils.clamp(x/width,0,1),ease=u*u*(3-2*u),tuck=THREE.MathUtils.smoothstep(u,0,.1),localAngle=bend*u,bx=Math.abs(bend)>.001?Math.sin(localAngle)*width/bend:x,bz=Math.abs(bend)>.001?(1-Math.cos(localAngle))*width/bend:0,lift=Math.cos(angle)*(foreZ-crease)*tuck;position.setXYZ(i,bx,y,rest[i*3+2]+bz+lift+skew*(y/2.77)*u*u);}position.needsUpdate=true;surface.geometry.computeVertexNormals();surface.geometry.computeBoundingSphere();}}
 }
 function update(dt){
  coverState.step(dt);cover.rotation.y=-coverState.angle;
  for(const [index,leaf] of leaves.entries()){
   leaf.state.step(dt);
   if(leaf.state.angle>coverState.angle){leaf.state.angle=coverState.angle;leaf.state.velocity=Math.min(leaf.state.velocity,coverState.velocity);if(coverState.target===0)leaf.state.target=0;}
   leaf.node.rotation.y=-leaf.state.angle;deformLeaf(leaf,index);
  }
  const transferred=leaves.reduce((sum,leaf)=>sum+THREE.MathUtils.clamp(leaf.state.angle/Math.PI,0,1),0),bottom=-.215,top=THREE.MathUtils.clamp(.19-transferred*(.39/11),bottom,.19);rightStackThickness=Math.max(.004,top-bottom);for(const edge of edgeShell){edge.scale.z=rightStackThickness/.405;edge.position.z=bottom+rightStackThickness/2;}for(const groove of pageGrooves)groove.visible=groove.position.z<=top+.006;
  const lastLeaf=leaves.at(-1);
  if(!finished&&lastLeaf?.state.target>Math.PI/2&&settled(lastLeaf.state)){finished=true;closingDelay=1.2;pendingFlip=0;}
  if(finished&&closingDelay>0){closingDelay=Math.max(0,closingDelay-dt);if(closingDelay===0){coverState.target=0;for(const leaf of leaves)leaf.state.target=0;}}
  if(!finished&&pendingFlip&&settled(coverState)&&coverState.angle>coverFlat&&allLeavesSettled()){const direction=pendingFlip;pendingFlip=0;startFlip(direction);}
 }
 function reset(){active=null;finished=false;closingDelay=0;pendingFlip=0;for(const state of [coverState,...leaves.map(leaf=>leaf.state)]){state.angle=0;state.target=0;state.velocity=0;state.dragging=false;}update(0);}
 return {begin,move,end,flip,tap,update,reset,get state(){const pages=leaves.map(leaf=>leaf.state.angle),closed=finished&&coverState.angle<.01&&pages.every(angle=>angle<.01);return {cover:coverState.angle,pages,dragging:!!active,finished,closing:finished&&closingDelay===0&&!closed,closed,rightStackThickness};},dispose(){leaves.forEach(leaf=>leaf.surfaces.forEach(surface=>{surface.geometry.dispose();surface.material.dispose();}));}};
}

import * as THREE from 'three';
const GROUPS={frame:['Frame_Finish'],trim:['Inner_Lip'],housing:['Housing_Finish'],stand:['Stand_Finish'],keys:['Keys_Finish'],cover:['Cover_Finish'],pages:['Paper_Edges']};
/** Text is a separate decal: editing the finish never tints the text. */
export function attachAppearance(root){
 const ownedMaterials=new Set(),ownedTextures=new Set(),slots=new Map();let disposed=false;
 function slot(name){const mesh=root.getObjectByName(name);if(!mesh?.isMesh)throw Error('Missing image/text slot: '+name);return mesh;}
 function material(mesh){if(!ownedMaterials.has(mesh.material)){mesh.material=mesh.material.clone();ownedMaterials.add(mesh.material);}return mesh.material;}
 function apply(name,texture,transparent){
  if(disposed){texture.dispose();return;}
  const mesh=slot(name),mat=material(mesh),previous=slots.get(name);if(previous){previous.dispose();ownedTextures.delete(previous);}
  mat.name='Editable_'+name;mat.map=texture;mat.color.set('#ffffff');mat.transparent=transparent;mat.depthWrite=!transparent;mat.needsUpdate=true;
  texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;slots.set(name,texture);ownedTextures.add(texture);
  if(name==='Page_Image_00')root.traverse(o=>{if(o.name.startsWith('Printed_Line_'))o.visible=false;});
  return texture;
 }
 function setColor(group,color){
  const names=GROUPS[group];if(!names)throw Error('Unknown finish group: '+group);let count=0;
  root.traverse(mesh=>{if(mesh.isMesh&&names.includes(mesh.material.name)){material(mesh).color.set(color);count++;}});
  if(!count)throw Error('No editable '+group+' finish on this model');return count;
 }
 function setText(name,text,{color='#f4e8c7',background=null,font='Georgia, serif',fontSize=84,align='left',padding=90,lineHeight=1.25,width=1024}={}){
  const mesh=slot(name),c=document.createElement('canvas');c.width=width;c.height=Math.round(width/(mesh.userData.aspectRatio||1));const ctx=c.getContext('2d');
  if(background){ctx.fillStyle=background;ctx.fillRect(0,0,c.width,c.height);}
  ctx.fillStyle=color;ctx.font=`${fontSize}px ${font}`;ctx.textBaseline='top';ctx.textAlign=align;
  const lines=[];for(const paragraph of String(text).split('\n')){let line='';for(const word of paragraph.split(' ')){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>width-padding*2){lines.push(line);line=word;}else line=next;}lines.push(line);}
  lines.forEach((line,i)=>ctx.fillText(line,align==='center'?width/2:align==='right'?width-padding:padding,padding+i*fontSize*lineHeight));
  return apply(name,new THREE.CanvasTexture(c),!background);
 }
 async function setImage(name,url){slot(name);const texture=await new THREE.TextureLoader().loadAsync(url);return apply(name,texture,false);}
function setBookTitle({title='Keith Knotsworth',author='',color='#f4e8c7'}={}){
  const c=document.createElement('canvas');c.width=1024;c.height=1356;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.textBaseline='top';ctx.textAlign='center';ctx.font='86px Georgia, serif';
  let y=126;for(const paragraph of (title==='Keith Knotsworth'?'Keith\nKnotsworth':title).split('\n')){let line='';for(const word of paragraph.split(' ')){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>840){ctx.fillText(line,512,y);y+=100;line=word;}else line=next;}ctx.fillText(line,512,y);y+=100;}
  ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(457,1270);ctx.lineTo(567,1270);ctx.stroke();
  if(author){ctx.font='30px sans-serif';ctx.fillText(author,100,1195);}return apply('Book_Title',new THREE.CanvasTexture(c),true);
 }
 return {setColor,setText,setImage,setBookTitle,dispose(){disposed=true;ownedTextures.forEach(t=>t.dispose());ownedMaterials.forEach(m=>m.dispose());ownedTextures.clear();ownedMaterials.clear();}};
}

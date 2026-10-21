import * as THREE from 'three';

const BUILTIN_TRACKS=[
 {name:'Still, Somewhere',artist:'Field Notes',notes:[220,261.63,329.63,392,329.63,261.63,196,261.63]},
 {name:'Blue Hour',artist:'Field Notes',notes:[196,246.94,293.66,369.99,293.66,246.94,174.61,246.94]},
 {name:'Soft Focus',artist:'Field Notes',notes:[174.61,220,261.63,329.63,261.63,220,164.81,220]}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function attachInteractions(gltf,{kind,element,camera,onState=()=>{},orbitControls=null,engagementShell=null}){
 // The upstream book is a closed display volume with no gestures or animation.
 if(kind==='book'){
  const state={kind:'book',closed:true,static:true};
  onState(state);
  return {update(){},reset(){onState(state);},get state(){return {...state};},dispose(){}};
 }
 const root=gltf.scene,ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),listeners=[],keys=new Map();
 const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
 const on=(target,event,fn,options)=>{target.addEventListener(event,fn,options);listeners.push(()=>target.removeEventListener(event,fn,options));};
 const book=null;
 const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;const ctx=canvas.getContext('2d');
 const screenTexture=new THREE.CanvasTexture(canvas);screenTexture.flipY=false;screenTexture.colorSpace=THREE.SRGBColorSpace;
 const screen=root.getObjectByName('Screen_Image');
 let originalScreen=null,screenMaterial=null,portraitImage=null,frameMaterial=null;
 const crackCanvas=document.createElement('canvas');crackCanvas.width=1000;crackCanvas.height=1200;const cctx=crackCanvas.getContext('2d'),crackTexture=new THREE.CanvasTexture(crackCanvas);crackTexture.flipY=false;crackTexture.colorSpace=THREE.SRGBColorSpace;let crackMesh=null,crackMaterial=null,crackImpacts=[],lastCrackPercent=0;
 let caption='',text='',activeApp='Photos',lastReport='',start=null,suppressClick=false,engaged=false;
 const setEngaged=value=>{engaged=Boolean(value);if(engagementShell){engagementShell.dataset.krishEngaged=engaged?'true':'false';if(!engaged&&engagementShell.contains(document.activeElement))engagementShell.blur();}};
 const isEngaged=()=>engaged||document.activeElement===element||(engagementShell!=null&&engagementShell.contains(document.activeElement));
 const disengage=()=>{setEngaged(false);};
 if(engagementShell){on(engagementShell,'focusin',()=>setEngaged(true));on(engagementShell,'focusout',event=>{if(!engagementShell.contains(event.relatedTarget))setEngaged(false);});}
 on(document,'pointerdown',event=>{if(engagementShell&&!engagementShell.contains(event.target)&&!element.contains(event.target))disengage();},{capture:true});
 const appState=(open=false)=>({open,minimized:false,maximized:false,progress:open?1:0,target:open?1:0,maxProgress:0,maxTarget:0});
 const apps={Photos:appState(true),Music:appState(false)};
 const tracks=[...BUILTIN_TRACKS.map(track=>({...track,builtin:true,duration:180}))];let trackIndex=0,playing=false,volume=.72,musicTime=0,clockTime=0,lastMusicDraw=0,audioContext=null,audioGain=null,synthTimer=null,stepIndex=0;
 let uploadedAudio=null,uploadedURLs=[];
 let menuBar=[],menuItems=[],openMenu=null,notice='',noticeUntil=0,clockLabel='';
 if(kind==='frame'){
  const portraitMesh=root.getObjectByName('Portrait_Image');
  if(portraitMesh){frameMaterial=portraitMesh.material.clone();portraitMesh.material=frameMaterial;portraitMesh.visible=true;}
  const geometry=new THREE.PlaneGeometry(2.25,2.69);const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
  crackMaterial=new THREE.MeshBasicMaterial({map:crackTexture,transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:false});crackMesh=new THREE.Mesh(geometry,crackMaterial);crackMesh.name='Runtime_Cracks';crackMesh.position.z=.166;crackMesh.visible=false;crackMesh.raycast=()=>{};root.add(crackMesh);
 }
 function hits(event){const r=element.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);root.updateMatrixWorld(true);camera.updateMatrixWorld(true);ray.setFromCamera(pointer,camera);return ray.intersectObject(root,true).filter(h=>{let o=h.object;while(o){if(!o.visible||o.scale.lengthSq()===0)return false;o=o.parent;}return true;});}
 function crackFade(){return crackImpacts.reduce((max,impact)=>Math.max(max,Math.max(0,1-impact.age/5)),0);}
 function paintCracks(){
  cctx.clearRect(0,0,1000,1200);
  for(const impact of crackImpacts){const alpha=Math.max(0,1-impact.age/5);if(alpha<=0)continue;cctx.save();cctx.globalAlpha=alpha;for(const stroke of impact.strokes){for(const [color,w] of [['rgba(25,38,40,.5)',stroke.width+1.5],['rgba(241,250,248,.9)',stroke.width]]){cctx.beginPath();cctx.moveTo(...stroke.path[0]);stroke.path.slice(1).forEach(p=>cctx.lineTo(...p));cctx.strokeStyle=color;cctx.lineWidth=w;cctx.lineJoin='round';cctx.stroke();}}cctx.restore();}
  crackTexture.needsUpdate=true;const live=crackFade()>0;if(crackMesh)crackMesh.visible=live;if(crackMaterial)crackMaterial.opacity=live?1:0;
 }
 function crack(hit){
  if(!hit?.uv||crackImpacts.length>=12)return;const x=hit.uv.x*1000,y=hit.uv.y*1200;let seed=Math.floor(x*77+y*93)+(crackImpacts.length+1)*123;const strokes=[];
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const stroke=(path,width)=>strokes.push({path,width});
  for(let arm=0;arm<11;arm++){const angle=arm*Math.PI*2/11+(rand()-.5)*.3;let path=[[x,y]],px=x,py=y;for(let step=0;step<9;step++){const distance=45+rand()*75;px+=Math.cos(angle)*distance+(rand()-.5)*28;py+=Math.sin(angle)*distance+(rand()-.5)*28;path.push([px,py]);if(step===2||step===5){const a=angle+(rand()>.5?.7:-.7);stroke([[px,py],[px+Math.cos(a)*60,py+Math.sin(a)*60],[px+Math.cos(a)*115,py+Math.sin(a)*115]],.65);}if(px<0||px>1000||py<0||py>1200)break;}stroke(path,.85+rand()*.7);}
  for(let ring=0;ring<3;ring++){const p=[];for(let i=0;i<12;i++){const a=i*Math.PI*2/11,r=14+ring*20+rand()*8;p.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}stroke(p,.65);}
  crackImpacts.push({age:0,strokes});lastCrackPercent=100;paintCracks();report();
 }
 function rounded(x,y,w,h,r,fill,stroke=null){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
 function wallpaper(){
  const bg=ctx.createLinearGradient(0,0,800,600);bg.addColorStop(0,'#829da9');bg.addColorStop(.48,'#c8a89d');bg.addColorStop(1,'#e5cba8');ctx.fillStyle=bg;ctx.fillRect(0,0,800,600);
  const glow=ctx.createRadialGradient(570,244,10,570,244,360);glow.addColorStop(0,'rgba(255,228,191,.66)');glow.addColorStop(1,'rgba(255,228,191,0)');ctx.fillStyle=glow;ctx.fillRect(200,20,600,510);
  ctx.fillStyle='rgba(61,84,88,.18)';ctx.beginPath();ctx.moveTo(0,390);ctx.quadraticCurveTo(196,250,394,369);ctx.quadraticCurveTo(603,472,800,306);ctx.lineTo(800,540);ctx.lineTo(0,540);ctx.fill();
 }
 function drawDock(){
  rounded(306,531,188,51,17,'rgba(245,246,243,.68)','rgba(255,255,255,.58)');
  for(const [app,cx,active,color]of [['Photos',356,apps.Photos.open&&!apps.Photos.minimized,'#e4a671'],['Music',449,apps.Music.open&&!apps.Music.minimized,'#bc6980']]){
   const gradient=ctx.createLinearGradient(cx-20,539,cx+20,575);gradient.addColorStop(0,color);gradient.addColorStop(1,app==='Music'?'#694d87':'#9c6059');rounded(cx-20,537,40,40,12,gradient);
   ctx.fillStyle='rgba(255,255,255,.9)';if(app==='Photos'){ctx.beginPath();ctx.arc(cx,557,10,0,Math.PI*2);ctx.fill();for(let i=0;i<6;i++){ctx.fillStyle=['#df8a83','#e7c46c','#83b699','#83aeca','#b28cbe','#e5a578'][i];ctx.beginPath();ctx.arc(cx+Math.cos(i*Math.PI/3)*8,557+Math.sin(i*Math.PI/3)*8,4.5,0,Math.PI*2);ctx.fill();}}else{ctx.beginPath();ctx.arc(cx,557,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8c5471';ctx.fillRect(cx-2,541,4,18);ctx.beginPath();ctx.arc(cx-5,560,4,0,Math.PI*2);ctx.arc(cx+5,555,4,0,Math.PI*2);ctx.fill();}
   if(active){ctx.fillStyle='#34464d';ctx.beginPath();ctx.arc(cx,584,2,0,Math.PI*2);ctx.fill();}
  }
 }
 function drawPhotoWindow(x,y,w,h){
  const left=x+112,right=x+w-14,contentW=right-left;
  ctx.fillStyle='#f1f2ef';ctx.fillRect(x+1,y+33,112,h-34);ctx.fillStyle='#858b85';ctx.font='bold 10px system-ui';ctx.fillText('LIBRARY',x+14,y+57);
  rounded(x+8,y+67,96,25,7,'rgba(103,142,126,.2)');ctx.fillStyle='#34483e';ctx.font='12px system-ui';ctx.fillText('▦  All Photos',x+15,y+84);ctx.fillStyle='#606861';ctx.fillText('◷  Recents',x+16,y+116);ctx.fillText('♡  Favourites',x+16,y+146);ctx.fillText('ALBUMS',x+14,y+190);ctx.fillText('▧  Portraits',x+16,y+216);
  ctx.fillStyle='#fbfcf9';ctx.fillRect(left,y+33,contentW,h-34);ctx.fillStyle='#323a36';ctx.font='600 16px system-ui';ctx.fillText('All Photos',left+15,y+59);ctx.fillStyle='#858b85';ctx.font='10px system-ui';ctx.fillText('Library  ·  '+(portraitImage?'1 item':'Sample image'),left+15,y+76);
  rounded(right-82,y+43,70,25,7,'#e8ece7');ctx.fillStyle='#425048';ctx.font='11px system-ui';ctx.fillText('＋ Import',right-72,y+60);
  const px=left+16,py=y+88,pw=contentW-34,ph=Math.min(180,h-180);rounded(px-1,py-1,pw+2,ph+2,5,'#e5e8e2');ctx.save();ctx.beginPath();ctx.roundRect(px,py,pw,ph,4);ctx.clip();
  if(portraitImage){const iw=portraitImage.naturalWidth||portraitImage.width,ih=portraitImage.naturalHeight||portraitImage.height,s=Math.min(pw/iw,ph/ih),dw=iw*s,dh=ih*s;ctx.drawImage(portraitImage,px+(pw-dw)/2,py+(ph-dh)/2,dw,dh);}
  else {const sky=ctx.createLinearGradient(px,py,px,py+ph);sky.addColorStop(0,'#9bbdd0');sky.addColorStop(.55,'#ecc9a7');sky.addColorStop(1,'#cc8068');ctx.fillStyle=sky;ctx.fillRect(px,py,pw,ph);ctx.fillStyle='#76817a';ctx.beginPath();ctx.moveTo(px,py+ph*.73);ctx.lineTo(px+pw*.23,py+ph*.27);ctx.lineTo(px+pw*.42,py+ph*.62);ctx.lineTo(px+pw*.62,py+ph*.2);ctx.lineTo(px+pw*.83,py+ph*.68);ctx.lineTo(px+pw,py+ph*.38);ctx.lineTo(px+pw,py+ph);ctx.lineTo(px,py+ph);ctx.fill();ctx.fillStyle='#526a60';ctx.beginPath();ctx.moveTo(px,py+ph*.8);ctx.quadraticCurveTo(px+pw*.4,py+ph*.6,px+pw*.65,py+ph*.82);ctx.quadraticCurveTo(px+pw*.85,py+ph*.97,px+pw,py+ph*.68);ctx.lineTo(px+pw,py+ph);ctx.lineTo(px,py+ph);ctx.fill();}
  ctx.restore();
  const stripY=py+ph+8;for(let i=0;i<5;i++){const tx=px+i*38;rounded(tx,stripY,33,24,3,i===0?'#c4d3c7':'#e4e7e2');if(i===0&&portraitImage){ctx.save();ctx.beginPath();ctx.roundRect(tx,stripY,33,24,3);ctx.clip();const iw=portraitImage.naturalWidth||portraitImage.width,ih=portraitImage.naturalHeight||portraitImage.height,s=Math.max(33/iw,24/ih);ctx.drawImage(portraitImage,tx+(33-iw*s)/2,stripY+(24-ih*s)/2,iw*s,ih*s);ctx.restore();}}
  ctx.fillStyle='#38423c';ctx.font='600 11px system-ui';ctx.fillText(caption||'Add a caption',px,stripY+43);ctx.fillStyle='#858b85';ctx.font='9px system-ui';ctx.fillText(portraitImage?'Personal library':'Today  ·  Sample landscape',px,stripY+58);
 }
 function drawMusicWindow(x,y,w,h){
  const left=x+16,top=y+46;ctx.fillStyle='#31383b';ctx.font='600 16px system-ui';ctx.fillText('Listen now',left,top+3);ctx.fillStyle='#8a8c89';ctx.font='10px system-ui';ctx.fillText('Your music, right here.',left,top+20);
  rounded(x+w-101,y+39,88,24,7,'rgba(255,255,255,.14)');ctx.fillStyle='#f1ede7';ctx.font='10px system-ui';ctx.fillText('＋ Add tracks',x+w-93,y+55);
  const ax=left+4,ay=top+40,size=126;const art=ctx.createLinearGradient(ax,ay,ax+size,ay+size);art.addColorStop(0,'#d3a47d');art.addColorStop(.5,'#b87d81');art.addColorStop(1,'#5b607d');rounded(ax,ay,size,size,12,art);ctx.fillStyle='rgba(255,238,196,.8)';ctx.beginPath();ctx.arc(ax+88,ay+37,22,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(33,45,60,.65)';ctx.beginPath();ctx.moveTo(ax,ay+105);ctx.lineTo(ax+46,ay+56);ctx.lineTo(ax+72,ay+91);ctx.lineTo(ax+103,ay+63);ctx.lineTo(ax+size,ay+106);ctx.lineTo(ax+size,ay+size);ctx.lineTo(ax,ay+size);ctx.fill();
  ctx.fillStyle='#f4f1ec';ctx.font='600 12px system-ui';ctx.fillText(tracks[trackIndex]?.name||'Still, Somewhere',left,top+186);ctx.fillStyle='#c3c4c0';ctx.font='10px system-ui';ctx.fillText(tracks[trackIndex]?.artist||'Field Notes',left,top+202);
  const listX=left+166,listY=top+38;ctx.fillStyle='#9c9f9a';ctx.font='bold 9px system-ui';ctx.fillText('UP NEXT',listX,listY-4);
  tracks.slice(0,4).forEach((track,i)=>{const ry=listY+12+i*39;if(i===trackIndex)rounded(listX-7,ry-16,w-205,32,7,'rgba(255,255,255,.12)');ctx.fillStyle=i===trackIndex?'#ffffff':'#d2d3cf';ctx.font='11px system-ui';ctx.fillText(`${String(i+1).padStart(2,'0')}   ${track.name.slice(0,22)}`,listX,ry+2);ctx.fillStyle='#9da09c';ctx.font='9px system-ui';ctx.fillText(track.artist,listX+24,ry+14);});
  const controlsY=y+h-73;ctx.strokeStyle='rgba(255,255,255,.16)';ctx.beginPath();ctx.moveTo(x+1,controlsY-14);ctx.lineTo(x+w-1,controlsY-14);ctx.stroke();
  ctx.fillStyle='#aeb4b3';ctx.font='16px system-ui';ctx.textAlign='center';ctx.fillText('|◀',x+w/2-48,controlsY+5);rounded(x+w/2-16,controlsY-14,32,32,16,'rgba(255,255,255,.9)');ctx.fillStyle='#41454c';ctx.font='13px system-ui';ctx.fillText(playing?'Ⅱ':'▶',x+w/2,controlsY+7);ctx.fillStyle='#aeb4b3';ctx.font='16px system-ui';ctx.fillText('▶|',x+w/2+48,controlsY+5);ctx.textAlign='left';
  const duration=tracks[trackIndex]?.duration||180,p=clamp(musicTime/duration,0,1),barX=x+22,barY=controlsY+29,barW=w-44;rounded(barX,barY,barW,3,2,'rgba(255,255,255,.27)');rounded(barX,barY,barW*p,3,2,'#f3e4d2');ctx.fillStyle='#bdc0bb';ctx.font='8px system-ui';ctx.fillText(formatTime(musicTime),barX,barY+15);ctx.textAlign='right';ctx.fillText(formatTime(duration),barX+barW,barY+15);ctx.textAlign='left';
  ctx.fillStyle='#c4c7c2';ctx.font='10px system-ui';ctx.fillText('−',x+w-102,controlsY+6);rounded(x+w-86,controlsY-1,62,3,2,'rgba(255,255,255,.3)');rounded(x+w-86,controlsY-1,62*volume,3,2,'#f2eee7');ctx.fillText('＋',x+w-18,controlsY+6);
 }
 function formatTime(value){const s=Math.max(0,Math.floor(value));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
 function drawWindow(name){
  const app=apps[name],p=clamp(app.progress,0,1);if(p<=.002)return;
  const mp=clamp(app.maxProgress,0,1),x=THREE.MathUtils.lerp(92,20,mp),y=THREE.MathUtils.lerp(57,36,mp),w=THREE.MathUtils.lerp(616,760,mp),h=THREE.MathUtils.lerp(424,468,mp),dockX=name==='Photos'?356:449,dockY=557,cx=x+w/2,cy=y+h/2,scale=.16+.84*(1-(1-p)**3);
  ctx.save();ctx.globalAlpha=p;ctx.translate(THREE.MathUtils.lerp(dockX,cx,p),THREE.MathUtils.lerp(dockY,cy,p));ctx.scale(scale,scale);ctx.translate(-cx,-cy);
  rounded(x+2,y+4,w,h,12,'rgba(30,37,38,.22)');rounded(x,y,w,h,12,name==='Photos'?'rgba(249,250,247,.97)':'rgba(36,42,47,.98)','rgba(255,255,255,.82)');rounded(x,y,w,34,12,name==='Photos'?'rgba(241,243,239,.98)':'rgba(55,61,66,.98)');ctx.fillStyle=name==='Photos'?'rgba(241,243,239,.98)':'rgba(55,61,66,.98)';ctx.fillRect(x,y+22,w,12);
  for(const [buttonX,color]of [[x+18,'#e47f79'],[x+36,'#e4c06f'],[x+54,'#87b591']]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(buttonX,y+17,5,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle=name==='Photos'?'#535c57':'#e8e9e5';ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.fillText(name,x+w/2,y+21);ctx.textAlign='left';
  if(name==='Photos')drawPhotoWindow(x,y,w,h);else drawMusicWindow(x,y,w,h);
  ctx.strokeStyle='rgba(72,80,74,.18)';ctx.beginPath();ctx.roundRect(x+.5,y+.5,w-1,h-1,12);ctx.stroke();ctx.restore();
 }
 function menuSpec(){
  return activeApp==='Photos'
   ?[['File','Import Photo','Close Window'],['Edit','Clear Caption'],['View','Full Screen'],['Window','Minimize','Switch to Music'],['Help','About Photos']]
   :[['File','Add Tracks','Close Window'],['Song','Previous Track','Next Track'],['Playback','Play or Pause'],['Window','Minimize','Switch to Photos'],['Help','About Music']];
 }
 function drawMenuBar(){
  menuBar=[];ctx.fillStyle='rgba(248,248,242,.84)';ctx.fillRect(0,0,800,25);ctx.fillStyle='#293330';ctx.font='700 11px system-ui';ctx.fillText('K',14,17);ctx.fillText(activeApp,35,17);ctx.font='11px system-ui';let x=108;
  for(const [title,...items] of menuSpec()){const w=ctx.measureText(title).width+18;if(openMenu===title){ctx.fillStyle='rgba(41,70,92,.14)';ctx.beginPath();ctx.roundRect(x-8,4,w,18,5);ctx.fill();ctx.fillStyle='#293330';}ctx.fillText(title,x,17);menuBar.push({title,items,x:x-8,w});x+=w+10;}
  clockLabel=new Date().toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit'});ctx.textAlign='right';ctx.fillText(`Wi-Fi     82%     ${clockLabel}`,786,17);ctx.textAlign='left';
 }
 function drawOpenMenu(){
  menuItems=[];if(!openMenu)return;const menu=menuBar.find(entry=>entry.title===openMenu);if(!menu){openMenu=null;return;}
  const h=menu.items.length*26+12;rounded(menu.x,26,176,h,8,'#fbfaf6','#d7dbd6');
  menu.items.forEach((label,index)=>{const y=32+index*26;menuItems.push({label,x:menu.x,y,w:176,h:26});ctx.fillStyle='#2c3330';ctx.font='12px system-ui';ctx.fillText(label,menu.x+12,y+17);});
 }
 function drawNotice(){
  if(!notice)return;ctx.font='12px system-ui';const w=ctx.measureText(notice).width+24;rounded(108,32,w,26,8,'#fbfaf6','#d7dbd6');ctx.fillStyle='#2c3330';ctx.fillText(notice,120,49);
 }
 function runMenu(label){
  const app=apps[activeApp];
  if(label==='Import Photo')document.querySelector('#portrait-file')?.click();
  else if(label==='Add Tracks')document.querySelector('#audio-file')?.click();
  else if(label==='Close Window')closeApp();
  else if(label==='Clear Caption'){caption='';text='';}
  else if(label==='Full Screen'&&app){app.maximized=!app.maximized;app.maxTarget=app.maximized?1:0;if(reducedMotion)app.maxProgress=app.maxTarget;}
  else if(label==='Minimize')minimizeApp();
  else if(label==='Switch to Music')openApp('Music');
  else if(label==='Switch to Photos')openApp('Photos');
  else if(label==='Next Track')chooseTrack(trackIndex+1);
  else if(label==='Previous Track')chooseTrack(trackIndex-1);
  else if(label==='Play or Pause')playPause();
  else if(label.startsWith('About')){notice=activeApp==='Photos'?'Photos keeps one library on this desk.':'Music plays the tracks on this desk.';noticeUntil=clockTime+3.2;}
  openMenu=null;draw();report();
 }
 function draw(){
  if(kind!=='computer'||!screen)return;
  wallpaper();drawMenuBar();
  const other=activeApp==='Photos'?'Music':'Photos';drawWindow(other);drawWindow(activeApp);
  drawDock();drawOpenMenu();if(!openMenu)drawNotice();
  if(!screenMaterial){originalScreen=screen.material;screenMaterial=new THREE.MeshBasicMaterial({map:screenTexture,color:'#ffffff',toneMapped:false,side:THREE.DoubleSide});screen.material=screenMaterial;}screenMaterial.map=screenTexture;screenMaterial.needsUpdate=true;screenTexture.needsUpdate=true;
 }
 function ensureAudio(){
  if(audioContext)return audioContext;
  const AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AudioContextClass)return null;
  audioContext=new AudioContextClass();audioGain=audioContext.createGain();audioGain.gain.value=volume;audioGain.connect(audioContext.destination);return audioContext;
 }
 function playDemoNote(){
  if(!playing||uploadedAudio)return;const ac=ensureAudio();if(!ac)return;const seq=tracks[trackIndex]?.notes||BUILTIN_TRACKS[0].notes,frequency=seq[stepIndex++%seq.length],now=ac.currentTime;
  for(const [hz,level]of [[frequency,.11],[frequency*1.5,.025],[frequency/2,.035]]){const oscillator=ac.createOscillator(),gain=ac.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(hz,now);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,level*volume),now+.035);gain.gain.exponentialRampToValueAtTime(.0001,now+.36);oscillator.connect(gain);gain.connect(audioGain);oscillator.start(now);oscillator.stop(now+.38);}
  synthTimer=setTimeout(playDemoNote,420);
 }
 function stopMusic(){playing=false;if(synthTimer){clearTimeout(synthTimer);synthTimer=null;}if(uploadedAudio)uploadedAudio.pause();draw();report();}
 function playPause(){
  if(playing){stopMusic();return;}
  playing=true;const ac=ensureAudio();if(ac?.state==='suspended')ac.resume();
  if(uploadedAudio){uploadedAudio.play().catch(()=>{playing=false;draw();report();});}else {stepIndex=0;playDemoNote();}
  draw();report();
 }
 function chooseTrack(index){trackIndex=(index+tracks.length)%tracks.length;musicTime=0;if(uploadedAudio)uploadedAudio.pause();uploadedAudio=tracks[trackIndex]?.builtin?null:tracks[trackIndex]?.audio||null;if(uploadedAudio){uploadedAudio.volume=volume;uploadedAudio.currentTime=0;}playing=false;if(synthTimer){clearTimeout(synthTimer);synthTimer=null;}draw();report();}
 function loadAudioFiles(files){
  for(const file of files){if(!file.type.startsWith('audio/'))continue;const url=URL.createObjectURL(file);uploadedURLs.push(url);const audio=new Audio(url);audio.preload='metadata';audio.onended=()=>{if(uploadedAudio===audio){chooseTrack(trackIndex+1);playPause();}};const index=tracks.push({name:file.name.replace(/\.[^.]+$/,''),artist:'Local audio',file,audio,url,builtin:false,duration:180})-1;audio.onloadedmetadata=()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)tracks[index].duration=audio.duration;draw();};if(index===0)trackIndex=0;}
  if(files.length)chooseTrack(Math.max(0,tracks.length-files.length));draw();report();
 }
 function openApp(name){const app=apps[name];if(!app)return;app.open=true;app.minimized=false;app.target=1;if(reducedMotion)app.progress=1;activeApp=name;draw();report();}
 function closeApp(name=activeApp){const app=apps[name];if(!app)return;app.open=false;app.minimized=false;app.target=0;if(reducedMotion)app.progress=0;if(name==='Music')stopMusic();const other=name==='Music'?'Photos':'Music';if(apps[other].open&&!apps[other].minimized)activeApp=other;draw();report();}
 function minimizeApp(name=activeApp){const app=apps[name];if(!app)return;app.minimized=true;app.target=0;if(reducedMotion)app.progress=0;const other=name==='Music'?'Photos':'Music';if(apps[other].open&&!apps[other].minimized)activeApp=other;draw();report();}
 function loadFramePortrait(url){
  const mesh=root.getObjectByName('Portrait_Image');if(!mesh)return Promise.resolve();
  return new THREE.TextureLoader().loadAsync(url).then(texture=>{texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;const previous=frameMaterial.map;frameMaterial.map=texture;frameMaterial.needsUpdate=true;if(previous)previous.dispose();mesh.visible=true;report();});
 }
 function screenAction(hit){
  const uv=hit?.uv;if(!uv)return;const x=uv.x*800,y=uv.y*600;
  if(y<=25){const menu=menuBar.find(entry=>x>=entry.x&&x<=entry.x+entry.w);openMenu=menu&&openMenu!==menu.title?menu.title:null;draw();return;}
  if(openMenu){const item=menuItems.find(entry=>x>=entry.x&&x<=entry.x+entry.w&&y>=entry.y&&y<=entry.y+entry.h);if(item){runMenu(item.label);return;}openMenu=null;draw();}
  const app=apps[activeApp],win=app?.maximized?{x:20,y:36,w:760,h:468}:{x:92,y:57,w:616,h:424};
  if(app?.open&&!app.minimized&&x>=win.x&&x<=win.x+win.w&&y>=win.y&&y<=win.y+win.h){
   if(y<win.y+34){if(x<win.x+27){closeApp();return;}if(x<win.x+46){minimizeApp();return;}if(x<win.x+65){app.maximized=!app.maximized;app.maxTarget=app.maximized?1:0;if(reducedMotion)app.maxProgress=app.maxTarget;draw();return;}}
   if(activeApp==='Photos'){
    if(x>win.x+win.w-104&&y<win.y+100){document.querySelector('#portrait-file')?.click();return;}
   }else{
    const controlsY=win.y+win.h-73;
    if(x>win.x+win.w-112&&y>controlsY-8&&y<controlsY+18){volume=clamp((x-(win.x+win.w-86))/62,0,1);if(audioGain)audioGain.gain.value=volume;if(uploadedAudio)uploadedAudio.volume=volume;draw();return;}
    if(y>controlsY-18&&y<controlsY+14){if(x<win.x+win.w/2-23)chooseTrack(trackIndex-1);else if(x>win.x+win.w/2+23)chooseTrack(trackIndex+1);else playPause();return;}
    if(y>controlsY+20&&y<controlsY+54){const barX=win.x+22,barW=win.w-44;musicTime=clamp((x-barX)/barW,0,1)*(tracks[trackIndex]?.duration||180);if(uploadedAudio&&Number.isFinite(uploadedAudio.duration))uploadedAudio.currentTime=musicTime;draw();return;}
    const listX=win.x+182,listY=win.y+99;if(x>listX-8&&x<win.x+win.w-18&&y>=listY&&y<listY+tracks.length*39){chooseTrack(Math.floor((y-listY)/39));return;}
    if(y<win.y+100&&x>win.x+win.w-94){document.querySelector('#audio-file')?.click();return;}
   }
  }
  // The dock is the launcher and app switcher; it contains exactly two apps.
  if(y>=531&&y<=584){if(x>=332&&x<=381)openApp('Photos');else if(x>=425&&x<=474)openApp('Music');}
 }
 function animateKey(key){
  const names={' ':'SPACE',Enter:'ENTER',Backspace:'BACKSPACE',Escape:'ESC',Tab:'TAB',ArrowLeft:'LEFT',ArrowRight:'RIGHT'};const obj=root.getObjectByName('Key_'+(names[key]||key.toUpperCase()));
  if(obj){if(obj.userData.restY===undefined)obj.userData.restY=obj.position.y;obj.position.y=obj.userData.restY-(obj.userData.travel||.035)*(reducedMotion ? .5 : 1);keys.set(obj,reducedMotion ? .08 : .12);}
 }
 function pressKey(key){
  animateKey(key);
  if(key==='Escape'){closeApp(activeApp);return;}
  if(activeApp==='Music'&&apps.Music.open&&!apps.Music.minimized){if(key===' '){playPause();return;}if(key==='ArrowRight'){chooseTrack(trackIndex+1);return;}if(key==='ArrowLeft'){chooseTrack(trackIndex-1);return;}}
  if(kind==='computer'&&activeApp==='Photos'&&apps.Photos.open&&!apps.Photos.minimized){
   if(key==='Backspace')caption=caption.slice(0,-1);else if(key==='Enter')caption+='\n';else if(key==='Tab')caption+='  ';else if(key.length===1&&!key.match(/[\u0000-\u001f]/))caption+=key;caption=caption.slice(-600);text=caption;draw();report();
  }
 }
 function typePhysicalKey(key){pressKey(key);}
 function update(dt){
  if(kind==='frame'&&crackImpacts.length){for(const impact of crackImpacts)impact.age+=dt;const before=crackImpacts.length;for(let i=crackImpacts.length-1;i>=0;i--)if(crackImpacts[i].age>=5)crackImpacts.splice(i,1);paintCracks();const percent=Math.round(crackFade()*100);if(percent!==lastCrackPercent&&(percent%10===0||crackImpacts.length!==before)){lastCrackPercent=percent;report();}if(!crackImpacts.length){lastCrackPercent=0;report();}}
  if(book){book.update(dt);const state=book.state,signature=Math.round(state.cover*10)+':'+state.pages.map(a=>Math.round(a*10)).join(',')+':'+state.finished;if(signature!==lastReport){lastReport=signature;report();}}
  if(kind==='computer'){let redraw=false;for(const app of Object.values(apps)){for(const [value,target]of [['progress','target'],['maxProgress','maxTarget']]){if(Math.abs(app[value]-app[target])>.002){app[value]=THREE.MathUtils.damp(app[value],app[target],reducedMotion?100:13,dt);if(Math.abs(app[value]-app[target])<.004)app[value]=app[target];redraw=true;}}}clockTime+=dt;const nextClock=new Date().toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit'});if(nextClock!==clockLabel)redraw=true;if(notice&&clockTime>noticeUntil){notice='';redraw=true;}if(playing){musicTime+=dt;if(!uploadedAudio)musicTime%=tracks[trackIndex]?.duration||180;else if(Number.isFinite(uploadedAudio.duration))musicTime=uploadedAudio.currentTime;if(clockTime-lastMusicDraw>.3){lastMusicDraw=clockTime;redraw=true;}}if(redraw)draw();}
  for(const [key,time]of keys){if(time<=dt){key.position.y=key.userData.restY;keys.delete(key);}else keys.set(key,time-dt);}
 }
 function release(event,cancel=false){
  const previous=start;start=null;if(book){const tap=!cancel&&previous&&Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<=6;const hit=tap?hits(event)[0]:null;book.end();if(hit)book.tap(hit);if(element.hasPointerCapture?.(event.pointerId))element.releasePointerCapture(event.pointerId);return;}
 }
 function activate(event){
  const intersections=hits(event);
  if(kind==='frame'){crack(intersections.find(hit=>hit.object.name==='Glass_Intact'));return;}
  if(kind==='computer'){
   const screenHit=intersections.find(hit=>hit.object.name==='Screen_Image');if(screenHit){screenAction(screenHit);return;}
   let object=intersections[0]?.object;while(object&&object!==root&&!object.userData.key)object=object.parent;if(object?.userData.key)typePhysicalKey(object.userData.key);
  }
 }
 if(kind==='computer')draw();report();
 on(element,'pointerdown',event=>{if(event.button!==0)return;const intersection=hits(event);if(intersection.length)setEngaged(true);start={x:event.clientX,y:event.clientY,id:event.pointerId};if(book&&intersection.length){if(book.begin(intersection[0],event,camera,element.getBoundingClientRect())){element.setPointerCapture?.(event.pointerId);event.preventDefault();return;}const hit=intersection[0];if(hitIsInteractive(hit)){suppressClick=true;book.tap(hit);start=null;}return;}});
 function hitIsInteractive(hit){const name=hit.object.name;if(name==='Glass_Intact'||name==='Screen_Image'||name==='Cover_Hinge')return true;if(name.startsWith('Key_')||name.startsWith('Page_Hinge_'))return true;let node=hit.object;while(node){if(node.userData?.key)return true;node=node.parent;}return false;}
 on(element,'pointermove',event=>{if(engagementShell){const list=hits(event);engagementShell.dataset.cursorHint=list.some(hitIsInteractive)?'pointer':'auto';}if(book&&start){book.move(event);event.preventDefault();}});
 on(element,'pointerup',event=>release(event));on(element,'pointercancel',event=>release(event,true));
 on(element,'click',event=>{if(suppressClick){suppressClick=false;return;}activate(event);});
 on(element,'lostpointercapture',event=>{if(start)release({pointerId:event.pointerId,clientX:start.x??0,clientY:start.y??0},true);});
 on(window,'blur',()=>{if(start)release({pointerId:start.id,clientX:start.x??0,clientY:start.y??0},true);});
 let wheel=0;on(element,'wheel',event=>{if(!book||!isEngaged()||!hits(event).length)return;if(book.state.cover<2.4)return;const delta=(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY),direction=Math.sign(delta);if(!direction)return;if(!book.canFlip(direction))return;event.preventDefault();wheel+=delta;if(Math.abs(wheel)>65){book.flip(direction);wheel=0;}},{passive:false});
 const keyTarget=engagementShell||element;
 on(keyTarget,'keydown',event=>{
  if(!isEngaged())return;
  if(event.key==='Escape'){
   event.preventDefault();event.stopPropagation();
   if(book){book.reset();disengage();report();return;}
   if(kind==='computer'){disengage();return;}
   disengage();return;
  }
  if(kind!=='computer')return;
  if(event.key===' '){event.preventDefault();typePhysicalKey(' ');return;}
  if(['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)||event.target?.isContentEditable){if(!event.ctrlKey&&!event.metaKey&&!event.altKey)animateKey(event.key);return;}
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.key.length===1||['Enter','Backspace','Tab','ArrowLeft','ArrowRight'].includes(event.key)){if(event.key.length===1)event.preventDefault();typePhysicalKey(event.key);}
 });
 const audioInput=document.querySelector('#audio-file');if(audioInput)on(audioInput,'change',()=>loadAudioFiles(audioInput.files||[]));
 function report(){onState(kind==='computer'?{kind,text,caption,activeApp,apps,playing,track:tracks[trackIndex]?.name}:kind==='book'?{kind,...book.state}:{kind,impacts:crackImpacts.length,crackFade:crackFade()});}
 function reset(){
  book?.reset();crackImpacts.length=0;cctx.clearRect(0,0,1000,1200);crackTexture.needsUpdate=true;lastCrackPercent=0;if(crackMaterial)crackMaterial.opacity=0;if(crackMesh)crackMesh.visible=false;text='';caption='';if(frameMaterial)root.getObjectByName('Portrait_Image').visible=true;
  keys.forEach((time,key)=>key.position.y=key.userData.restY);keys.clear();if(kind==='computer'){stopMusic();apps.Photos=appState(true);apps.Music=appState(false);activeApp='Photos';}
  draw();report();
 }
 return {
  setPortrait(url){return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>{portraitImage=image;draw();resolve();};image.onerror=reject;image.src=url;});},
  setFramePortrait:loadFramePortrait,
  setCaption(value){caption=String(value).slice(-600);text=caption;draw();report();},
  openApp,closeApp,playPause,nextTrack(){chooseTrack(trackIndex+1);},previousTrack(){chooseTrack(trackIndex-1);},
  update,reset,
  get state(){return book?book.state:kind==='computer'?{text,caption,activeApp,apps,playing,track:tracks[trackIndex]?.name,trackCount:tracks.length}:{impacts:crackImpacts.length,crackFade:crackFade(),portraitVisible:root.getObjectByName('Portrait_Image')?.visible??false};},
  dispose(){listeners.forEach(remove=>remove());book?.dispose();screenTexture.dispose();crackTexture.dispose();if(crackMesh){root.remove(crackMesh);crackMesh.geometry.dispose();crackMesh.material.dispose();}if(screenMaterial){screen.material=originalScreen;screenMaterial.dispose();}if(frameMaterial){root.getObjectByName('Portrait_Image').material.dispose();}if(uploadedAudio)uploadedAudio.pause();if(synthTimer)clearTimeout(synthTimer);audioContext?.close();for(const url of uploadedURLs)URL.revokeObjectURL(url);}
 };
}

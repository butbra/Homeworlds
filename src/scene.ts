import * as THREE from 'three';
import {SVGRenderer} from 'three/addons/renderers/SVGRenderer.js';
import {paintCosmos,clearCosmos} from './cosmos';
import type {Color} from './game';

/** The board's HTML remains the source of truth for layout, actions and
 * accessibility. This renderer draws actual 3D pieces at those hit targets. */
const palette:Record<Color,number>={red:0xef473b,yellow:0xf5c43b,green:0x35dc77,blue:0x397cff};
const vertices=[
 new THREE.Vector3(-.48,0,.48),new THREE.Vector3(.48,0,.48),
 new THREE.Vector3(.48,0,-.48),new THREE.Vector3(-.48,0,-.48),
 new THREE.Vector3(0,1.25,0)
];
const faces=[[0,1,4],[1,2,4],[2,3,4],[3,0,4],[3,2,1],[3,1,0]];
const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const ray=new THREE.Raycaster();
const cameraPosition=new THREE.Vector3(7,17,25);
const shipYaw=Math.atan2(cameraPosition.x,cameraPosition.z);
const shipPitch=(owner:number)=>owner===0?Math.PI-Math.atan2(1.25,.48):-Math.PI*75/180;
// Determine one projection envelope for the physical pyramid, regardless of
// how it is oriented. Fitting each orientation independently made ships 23%
// larger than their same-size stars in actual 3D geometry.
const cameraAxes=new THREE.OrthographicCamera(-1,1,1,-1,.1,180);
cameraAxes.position.copy(cameraPosition);cameraAxes.lookAt(0,0,0);cameraAxes.updateMatrixWorld();
const projectedExtents=[-1,0,1].map(owner=>{
 const points=vertices.map(v=>{
  const p=v.clone();
  if(owner!==-1)p.applyAxisAngle(new THREE.Vector3(1,0,0),shipPitch(owner)).applyAxisAngle(new THREE.Vector3(0,1,0),shipYaw);
  return p.project(cameraAxes);
 });
 return {width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),height:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))};
});
const sharedWidth=Math.max(...projectedExtents.map(p=>p.width));
const sharedHeight=Math.max(...projectedExtents.map(p=>p.height));
export function tabletopPieceScale(width:number,height:number,pixelsPerUnit:number):number {
 return Math.min(width*.94/sharedWidth,height*.98/sharedHeight)/pixelsPerUnit;
}
let renderer:THREE.WebGLRenderer|SVGRenderer|undefined;
let scene:THREE.Scene|undefined;
let unavailable=false;
type VisualPiece={key:string;signature:string;color:Color;size:number;star:boolean;owner:number;position:THREE.Vector3;scale:number};
type AnimatedPiece={piece:VisualPiece;group:THREE.Group;from:THREE.Vector3;fromScale:number;leaving:boolean};
let lastPieces=new Map<string,VisualPiece>();
let animationFrame=0,hasRendered=false;

function release():void {
 scene?.traverse(object=>{
  if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){
   object.geometry.dispose();
   for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();
  }
 });
 scene=undefined;
}

export function pieceModel(color:Color,size:number,star:boolean,owner:number):{group:THREE.Group;points:THREE.Vector3[]} {
 const group=new THREE.Group(),body=new THREE.Group();
 group.add(body);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(face=>face.flatMap(i=>vertices[i].toArray())),3));
 geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({color:palette[color],roughness:.27,metalness:.15});
 const mesh=new THREE.Mesh(geometry,material);
 body.add(mesh);
 const border=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:palette[color],transparent:true,opacity:.45}));
 body.add(border);
 // Pips lie on the real triangular faces, rather than an icon painted in screen space.
 for(const indices of faces.slice(0,4)){
  const [a,b,c]=indices.map(i=>vertices[i]);
  const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  for(let i=0;i<size;i++){
   const pip=new THREE.Mesh(new THREE.CircleGeometry(.045,18),new THREE.MeshStandardMaterial({color:0x112033,roughness:.45}));
   pip.position.copy(a.clone().lerp(b,.5+(i-(size-1)/2)*.17).lerp(c,.17)).addScaledVector(normal,.004);
   pip.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
   pip.userData.pip=true;
   body.add(pip);
  }
 }
 if(!star){
  // Keep the north-facing profile. Pitch away-facing ships up a little so
  // their pointed nose is visible rather than only the square rear face.
  body.rotation.x=shipPitch(owner);
  const floor=Math.min(...vertices.map(v=>v.clone().applyEuler(body.rotation).y));
  body.position.y=-floor;
  // Face straight along the board's depth, in opposing directions.
  group.rotation.y=shipYaw;
 }
 group.updateMatrixWorld(true);
 return {group,points:vertices.map(v=>body.localToWorld(v.clone()))};
}

export function renderTableScene(space:HTMLElement):void {
 if(animationFrame)cancelAnimationFrame(animationFrame);animationFrame=0;
 if(!space.classList.contains('table-view')){
  renderer?.domElement.remove();space.querySelector('.table-cosmos')?.remove();space.querySelector('.table-cosmos-out')?.remove();clearCosmos();release();lastPieces.clear();hasRendered=false;space.classList.remove('scene-ready');return;
 }
 if(unavailable)return;
 const w=space.clientWidth,h=space.clientHeight;
 if(!w||!h)return;
 try{
  paintCosmos(space);
  if(!renderer){
   try{
    const gpu=new THREE.WebGLRenderer({alpha:true,antialias:true});
    gpu.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    gpu.toneMapping=THREE.ACESFilmicToneMapping;gpu.toneMappingExposure=1.1;
    renderer=gpu;
   }catch{
    // Render the exact same geometry, camera and lights in software.
    const cpu=new SVGRenderer();cpu.setQuality('high');cpu.setPrecision(2);cpu.overdraw=.1;renderer=cpu;
   }
   renderer.domElement.setAttribute('class','table-scene');
   renderer.domElement.setAttribute('aria-hidden','true');
   renderer.domElement.addEventListener('webglcontextlost',()=>{
    renderer?.domElement.parentElement?.classList.remove('scene-ready');renderer?.domElement.remove();
    renderer=new SVGRenderer();renderer.domElement.setAttribute('class','table-scene');renderer.domElement.setAttribute('aria-hidden','true');
   });
  }
  release();
  scene=new THREE.Scene();
  const ratio=w/h,view=12;
  // An orthographic camera at tabletop height preserves readability at both
  // ends of the board without the miniature far-away pieces of a wide-angle lens.
  const camera=new THREE.OrthographicCamera(-view*ratio/2,view*ratio/2,view/2,-view/2,.1,180);
  camera.position.copy(cameraPosition);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const frame=space.getBoundingClientRect();
  const map=space.querySelector<HTMLElement>('#universe');
  const boardScale=map&&map.offsetWidth?map.getBoundingClientRect().width/map.offsetWidth:1;
  const ground=(x:number,y:number)=>{
   ray.setFromCamera(new THREE.Vector2((x-frame.left)/w*2-1,1-(y-frame.top)/h*2),camera);
   return ray.ray.intersectPlane(plane,new THREE.Vector3())!;
  };
  const screen=(v:THREE.Vector3)=>{const p=v.clone().project(camera);return new THREE.Vector2(p.x*w/2,-p.y*h/2);};
  const gpu=renderer instanceof THREE.WebGLRenderer;
  if(gpu)scene.add(new THREE.HemisphereLight(0xcce6ff,0x18283d,1.7));
  else scene.add(new THREE.AmbientLight(0x6c7d99,1));
  const key=new THREE.DirectionalLight(0xfff3df,gpu?2.5:1.1);key.position.set(-9,19,10);scene.add(key);
  const rim=new THREE.DirectionalLight(0x7ca9ff,gpu?1.35:.45);rim.position.set(12,8,-16);scene.add(rim);
  const incoming:{piece:VisualPiece;group:THREE.Group}[]=[];
  const occurrences=new Map<string,number>();
  for(const card of space.querySelectorAll<HTMLElement>('.system')){
   const area=card.querySelector<HTMLElement>('.system-pieces')!;
   for(const button of area.querySelectorAll<HTMLElement>('.piece-button')){
    const icon=button.querySelector<SVGElement>('.pyramid');if(!icon)continue;
    const color=icon.dataset.meshColor as Color;
    if(!palette[color])continue;
    const size=Number(icon.dataset.meshSize),star=icon.classList.contains('star');
    const owner=icon.classList.contains('owner-0')?0:1;
    const rect=icon.getBoundingClientRect();
    const {group,points}=pieceModel(color,size,star,owner);
    const projected=points.map(screen);
    const minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x));
    const minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y));
    const origin=screen(new THREE.Vector3());
    // Use the layout dimensions, not transformed screen bounds: a CSS
    // animation, hover or rotation must never permanently resize a model.
    const width=icon.clientWidth*boardScale,height=icon.clientHeight*boardScale;
    const scale=tabletopPieceScale(width,height,h/view);
    group.scale.setScalar(scale);
    const x=rect.x+rect.width/2-((maxX+minX)/2-origin.x)*scale;
    const y=rect.y+rect.height/2-((maxY+minY)/2-origin.y)*scale;
    group.position.copy(ground(x,y));
    const signature=`${star?'star':'ship'}:${owner}:${color}:${size}`;
    const base=`${card.dataset.system}:${signature}`,occurrence=occurrences.get(base)??0;
    occurrences.set(base,occurrence+1);
    incoming.push({group,piece:{key:`${base}:${occurrence}`,signature,color,size,star,owner,position:group.position.clone(),scale}});
    group.traverse(o=>{o.renderOrder=o.userData.pip?4:3;});scene.add(group);
   }
  }
  // Preserve identities at existing systems, then pair matching pieces that
  // changed systems so travel visibly glides to the next destination.
  const remaining=new Map(lastPieces),animations:AnimatedPiece[]=[];
  const matched=new Map<string,VisualPiece>();
  for(const {piece} of incoming){const old=remaining.get(piece.key);if(old){matched.set(piece.key,old);remaining.delete(piece.key);}}
  for(const {piece,group} of incoming){
   let old=matched.get(piece.key);
   if(!old&&!piece.star){old=[...remaining.values()].find(p=>p.signature===piece.signature);if(old)remaining.delete(old.key);}
   animations.push({piece,group,from:old?.position.clone()??piece.position.clone(),fromScale:old?.scale??piece.scale*(hasRendered?.88:1),leaving:false});
  }
  for(const old of remaining.values()){
   const {group}=pieceModel(old.color,old.size,old.star,old.owner);group.traverse(o=>{o.renderOrder=o.userData.pip?4:3;});scene.add(group);
   animations.push({piece:{...old,scale:0},group,from:old.position.clone(),fromScale:old.scale,leaving:true});
  }
  if(gpu)renderer.setSize(w,h,false);else renderer.setSize(w,h);
  space.append(renderer.domElement);
  space.classList.add('scene-ready');
  const activeScene=scene,activeRenderer=renderer;
  const animate=hasRendered&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&animations.some(a=>a.from.distanceTo(a.piece.position)>.001||Math.abs(a.fromScale-a.piece.scale)>.001);
  hasRendered=true;
  const draw=(progress:number)=>{
   const eased=progress*progress*(3-2*progress),next=new Map<string,VisualPiece>();
   for(const a of animations){
    a.group.position.lerpVectors(a.from,a.piece.position,eased);
    const scale=THREE.MathUtils.lerp(a.fromScale,a.piece.scale,eased);a.group.scale.setScalar(Math.max(.0001,scale));
    a.group.visible=scale>.001;
    if(!a.leaving)next.set(a.piece.key,{...a.piece,position:a.group.position.clone(),scale});
   }
   lastPieces=next;activeRenderer.render(activeScene,camera);
   if(!gpu)activeRenderer.domElement.style.backgroundColor='transparent';
  };
  if(animate){
   const start=performance.now();draw(0);
   const tick=(now:number)=>{const progress=Math.min(1,(now-start)/260);draw(progress);animationFrame=progress<1?requestAnimationFrame(tick):0;};
   animationFrame=requestAnimationFrame(tick);
  }else draw(1);
 }catch(error){
  // A GPU-disabled browser still has a usable perspective view.
  console.warn('Tabletop renderer unavailable',error);unavailable=true;
  renderer?.domElement.remove();space.classList.remove('scene-ready');release();
 }
}

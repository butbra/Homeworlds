import * as THREE from 'three';
import {SVGRenderer} from 'three/addons/renderers/SVGRenderer.js';
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
let renderer:THREE.WebGLRenderer|SVGRenderer|undefined;
let scene:THREE.Scene|undefined;
let unavailable=false;

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
 mesh.castShadow=true;mesh.receiveShadow=true;body.add(mesh);
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
  // A ship lies on one triangular face. Opponents point in opposite directions.
  body.rotation.x=(Math.PI-Math.atan2(1.25,.48))*(owner===0?1:-1);
  const floor=Math.min(...vertices.map(v=>v.clone().applyEuler(body.rotation).y));
  body.position.y=-floor;
  // Align with the camera's horizontal axis: opposing ships point directly
  // left/right on screen instead of diagonally across their system.
  group.rotation.y=Math.PI/2+Math.atan2(7,25);
 }
 group.updateMatrixWorld(true);
 return {group,points:vertices.map(v=>body.localToWorld(v.clone()))};
}

export function renderTableScene(space:HTMLElement):void {
 if(!space.classList.contains('table-view')){
  renderer?.domElement.remove();release();space.classList.remove('scene-ready');return;
 }
 if(unavailable)return;
 const w=space.clientWidth,h=space.clientHeight;
 if(!w||!h)return;
 try{
  if(!renderer){
   try{
    const gpu=new THREE.WebGLRenderer({alpha:true,antialias:true});
    gpu.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    gpu.shadowMap.enabled=true;gpu.shadowMap.type=THREE.PCFSoftShadowMap;
    gpu.toneMapping=THREE.ACESFilmicToneMapping;gpu.toneMappingExposure=1.1;
    renderer=gpu;
   }catch{
    // Render the exact same geometry, camera and lights in software.
    const cpu=new SVGRenderer();cpu.setQuality('high');cpu.setPrecision(2);renderer=cpu;
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
  camera.position.set(7,17,25);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const frame=space.getBoundingClientRect();
  const ground=(x:number,y:number)=>{
   ray.setFromCamera(new THREE.Vector2((x-frame.left)/w*2-1,1-(y-frame.top)/h*2),camera);
   return ray.ray.intersectPlane(plane,new THREE.Vector3())!;
  };
  const screen=(v:THREE.Vector3)=>{const p=v.clone().project(camera);return new THREE.Vector2(p.x*w/2,-p.y*h/2);};
  const gpu=renderer instanceof THREE.WebGLRenderer;
  if(gpu)scene.add(new THREE.HemisphereLight(0xcce6ff,0x18283d,1.7));
  else scene.add(new THREE.AmbientLight(0x6c7d99,1));
  const key=new THREE.DirectionalLight(0xfff3df,gpu?2.5:1.1);key.position.set(-9,19,10);key.castShadow=true;
  const span=Math.max(22,view*ratio*1.3);
  key.shadow.camera.left=-span;key.shadow.camera.right=span;
  key.shadow.camera.top=span;key.shadow.camera.bottom=-span;
  key.shadow.camera.far=100;key.shadow.mapSize.set(2048,2048);
  key.shadow.bias=-.0004;key.shadow.normalBias=.025;scene.add(key);
  const rim=new THREE.DirectionalLight(0x7ca9ff,gpu?1.35:.45);rim.position.set(12,8,-16);scene.add(rim);
  const grid=new THREE.GridHelper(150,100,0x3c5975,0x273e58);
  grid.position.y=-.35;grid.material.transparent=true;grid.material.opacity=.15;grid.renderOrder=-1;scene.add(grid);
  if(gpu){
   const floor=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.ShadowMaterial({opacity:.36}));
   floor.rotation.x=-Math.PI/2;floor.position.y=-.25;floor.receiveShadow=true;scene.add(floor);
  }
  const right=camera.getWorldDirection(new THREE.Vector3()).cross(new THREE.Vector3(0,1,0)).normalize();
  const yaw=Math.atan2(-right.z,right.x);
  for(const card of space.querySelectorAll<HTMLElement>('.system')){
   const area=card.querySelector<HTMLElement>('.system-pieces')!;
   const r=area.getBoundingClientRect();
   // Each star system is a low metallic platform, lit by the same scene.
   const center=ground(r.x+r.width/2,r.y+r.height*.62);
   const width=view/h*r.width*.53,depth=view/h*r.height*.52/Math.sin(Math.atan2(17,Math.hypot(7,25)));
   const selected=card.classList.contains('selected'),destination=card.classList.contains('destination');
   const pad=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.14,64),new THREE.MeshStandardMaterial({color:0x17283a,metalness:.48,roughness:.54}));
   pad.scale.set(width,1,depth);pad.position.copy(center);pad.position.y=-.14;pad.rotation.y=yaw;pad.receiveShadow=true;pad.renderOrder=0;scene.add(pad);
   const band=new THREE.Mesh(new THREE.RingGeometry(.96,1,64),new THREE.MeshBasicMaterial({color:selected?0xc6e9ff:destination?0x64efbd:0x496d91,transparent:true,opacity:selected?.95:.76,side:THREE.DoubleSide}));
   band.rotation.set(-Math.PI/2,0,yaw);band.scale.set(width,depth,1);band.position.copy(center);band.position.y=-.063;band.renderOrder=1;scene.add(band);
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
    const scale=Math.min(rect.width*.94/(maxX-minX),rect.height*.98/(maxY-minY));
    group.scale.setScalar(scale);
    const x=rect.x+rect.width/2-((maxX+minX)/2-origin.x)*scale;
    const y=rect.y+rect.height/2-((maxY+minY)/2-origin.y)*scale;
    group.position.copy(ground(x,y));
    // Contact shadows also make the software renderer's pieces feel grounded.
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(1,28),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.36,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;shadow.position.copy(group.position);shadow.position.y=-.052;
    shadow.scale.set(scale*.57,scale*(star?.55:.8),1);shadow.renderOrder=2;scene.add(shadow);
    group.traverse(o=>{o.renderOrder=o.userData.pip?4:3;});scene.add(group);
   }
  }
  if(gpu)renderer.setSize(w,h,false);else renderer.setSize(w,h);
  space.append(renderer.domElement);
  renderer.render(scene,camera);
  if(!gpu)renderer.domElement.style.backgroundColor='transparent';
  space.classList.add('scene-ready');
 }catch(error){
  // A GPU-disabled browser still has a usable perspective view.
  console.warn('Tabletop renderer unavailable',error);unavailable=true;
  renderer?.domElement.remove();space.classList.remove('scene-ready');release();
 }
}

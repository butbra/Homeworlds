import type {Piece} from './game';

/** A small CPU 3D renderer: mesh vertices, face normals, camera projection,
 *  directional light, depth sorting and ground shadows. No WebGL dependency. */
type V=[number,number,number];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(v:V):V=>{const l=Math.hypot(...v);return [v[0]/l,v[1]/l,v[2]/l];};
const mix=(a:V,b:V,t:number):V=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const camera=unit([.28,.52,1]), right=unit(cross([0,1,0],camera)), up=cross(camera,right), light=unit([-.7,1,.45]);
const palette:Record<Piece['color'],V>={red:[239,58,48],yellow:[245,202,45],green:[60,214,89],blue:[53,126,255]};
const faces=[[0,1,4],[1,2,4],[2,3,4],[3,0,4],[3,2,1,0]];
const fmt=(n:number)=>n.toFixed(2);
const project=(v:V):[number,number]=>{const k=92/(92-dot(v,camera));return [32+dot(v,right)*k,46-dot(v,up)*k];};
const points=(vs:V[])=>vs.map(v=>project(v).map(fmt).join(',')).join(' ');
const color=(p:Piece,amount:number)=>'rgb('+palette[p.color].map(c=>Math.min(255,Math.round(c*amount))).join(',')+')';

export function physicalPyramid(p:Piece,star:boolean,owner:number):string {
  const b=16,h=34;
  let vertices:V[]=[[-b,0,b],[b,0,b],[b,0,-b],[-b,0,-b],[0,h,0]];
  if(!star){
    // Tip along the tabletop. Rotate until a triangular face rests on it.
    const angle=Math.atan2(h,b)*(owner===0?1:-1);
    const c=Math.cos(angle),s=Math.sin(angle);
    vertices=vertices.map(([x,y,z])=>[x,y*c-z*s,y*s+z*c]);
    const floor=Math.min(...vertices.map(v=>v[1]));
    vertices=vertices.map(([x,y,z])=>[x,y-floor,z]);
  }
  // Center the footprint so the piece stays under the original clickable button.
  const centerZ=(Math.min(...vertices.map(v=>v[2]))+Math.max(...vertices.map(v=>v[2])))/2;
  vertices=vertices.map(([x,y,z])=>[x,y,z-centerZ]);
  const shadow=vertices.map(([x,y,z]):V=>[x+y*.48,0,z-y*.35]);
  const shadowPoints=shadow.map(project);
  const sx=shadowPoints.reduce((a,v)=>a+v[0],0)/shadowPoints.length,sy=shadowPoints.reduce((a,v)=>a+v[1],0)/shadowPoints.length;
  const visible=faces.map(indices=>{
    const vs=indices.map(i=>vertices[i]);
    // Face winding is outward: the square base normal points down.
    const normal=unit(cross(sub(vs[1],vs[0]),sub(vs[2],vs[0])));
    const depth=vs.reduce((a,v)=>a+dot(v,camera),0)/vs.length;
    return {vs,normal,depth};
  }).filter(f=>dot(f.normal,camera)>0).sort((a,b)=>a.depth-b.depth);
  const body=visible.map(({vs,normal})=>{
    const brightness=.48+.75*Math.max(0,dot(normal,light));
    const face='<polygon points="'+points(vs)+'" fill="'+color(p,brightness)+'" stroke="'+color(p,Math.min(1.25,brightness+.15))+'" stroke-width=".65" stroke-linejoin="round"/>';
    if(vs.length!==3)return face;
    const marks=Array.from({length:p.size},(_,i)=>{
      const t=.5+(i-(p.size-1)/2)*.17;
      const center=mix(mix(vs[0],vs[1],t),vs[2],.18);
      const [x,y]=project(center);
      return '<ellipse cx="'+fmt(x)+'" cy="'+fmt(y)+'" rx="1.5" ry="1.25" fill="#10151a" stroke="#fff" stroke-opacity=".27" stroke-width=".3"/>';
    }).join('');
    return face+marks;
  }).join('');
  return '<svg class="table-mesh" viewBox="0 0 64 72" aria-hidden="true"><ellipse cx="'+fmt(sx)+'" cy="'+fmt(sy)+'" rx="19" ry="5.5" fill="#000" opacity=".22"/><ellipse cx="'+fmt(sx)+'" cy="'+fmt(sy)+'" rx="15" ry="3.4" fill="#000" opacity=".35"/>'+body+'</svg>';
}

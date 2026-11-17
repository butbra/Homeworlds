/** A deterministic, screen-space deep-sky backdrop. All game pieces are
 * still rendered by the 3D scene above this decorative layer. */
function randomSource(seed:number):()=>number {
 return ()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
}

function star(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,light:number,tint:string,flare=false):void {
 ctx.globalAlpha=light;
 if(r>1||flare){
  const glow=ctx.createRadialGradient(x,y,0,x,y,r*5);
  glow.addColorStop(0,tint);glow.addColorStop(.13,tint+'80');glow.addColorStop(1,tint+'00');
  ctx.fillStyle=glow;ctx.fillRect(x-r*5,y-r*5,r*10,r*10);
 }
 ctx.fillStyle=tint;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
 if(flare){
  ctx.globalAlpha=light*.35;ctx.strokeStyle=tint;ctx.lineWidth=.55;
  ctx.beginPath();ctx.moveTo(x-r*5,y);ctx.lineTo(x+r*5,y);ctx.moveTo(x,y-r*5);ctx.lineTo(x,y+r*5);ctx.stroke();
  ctx.globalAlpha=light*.13;ctx.beginPath();ctx.moveTo(x-r*3,y-r*3);ctx.lineTo(x+r*3,y+r*3);ctx.moveTo(x+r*3,y-r*3);ctx.lineTo(x-r*3,y+r*3);ctx.stroke();
 }
 ctx.globalAlpha=1;
}

let previousCanvas:HTMLCanvasElement|undefined,previousLayout='';
export function clearCosmos():void {previousCanvas=undefined;previousLayout='';}

export function paintCosmos(space:HTMLElement):void {
 let canvas=space.querySelector<HTMLCanvasElement>('.table-cosmos');
 if(!canvas){canvas=document.createElement('canvas');canvas.className='table-cosmos';canvas.setAttribute('aria-hidden','true');space.append(canvas);}
 const w=space.clientWidth,h=space.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.scale(dpr,dpr);
 const random=randomSource(8314),tints=['#e4e6e9','#c8d6fa','#fff7dc','#f1d8bf'];
 // A broad range of star brightnesses creates depth without a blue wash.
 const count=Math.max(250,Math.min(2200,Math.round(w*h/675)));
 for(let i=0;i<count;i++){
  const x=random()*w,y=random()*h,bright=random(),tint=tints[Math.floor(random()*tints.length)];
  const r=bright>.991?1.7:bright>.963?.95:bright>.8?.62:.28+random()*.26;
  star(ctx,x,y,r,bright>.963?.55+random()*.4:.13+random()*.42,tint,bright>.991);
 }
 // Each system is only a localized concentration of stars. No filled disk,
 // halo, ring, or light haze: particle density alone defines its shape.
 const frame=space.getBoundingClientRect();
 const cards=Array.from(space.querySelectorAll<HTMLElement>('.system'));
 const layout=cards.map(card=>{const r=card.querySelector<HTMLElement>('.system-pieces')!.getBoundingClientRect();return `${card.dataset.system}:${Math.round(r.x-frame.x)}:${Math.round(r.y-frame.y)}:${Math.round(r.width)}:${Math.round(r.height)}`;}).join('|');
 for(const [i,card] of cards.entries()){
  const r=card.querySelector<HTMLElement>('.system-pieces')!.getBoundingClientRect();
  const x=r.x-frame.x+r.width*.5,y=r.y-frame.y+r.height*.53,rx=r.width*.56,ry=r.height*.66;
  const seed=[...(card.dataset.system??String(i))].reduce((value,c)=>(value*31+c.charCodeAt(0))%2147483647,1321);
  const local=randomSource(seed||1321),n=Math.floor(Math.max(110,r.width*1.30));
  for(let j=0;j<n;j++){
   const angle=local()*Math.PI*2,d=Math.pow(local(),.67)*.97;
   const lx=x+rx*d*Math.cos(angle),ly=y+ry*d*Math.sin(angle),bright=local();
   const tint=tints[Math.floor(local()*tints.length)],size=bright>.96?.95:bright>.75?.68:.30+local()*.25;
   star(ctx,lx,ly,size,Math.pow(1-d,.58)*(.32+bright*.56),tint);
  }
 }
 // Crossfade the old cluster field when system positions change, keeping the
 // stationary background and the moving 3D pieces independent.
 if(previousCanvas&&previousCanvas!==canvas&&previousLayout!==layout&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  const old=previousCanvas;old.className='table-cosmos-out';space.append(old);
  const fade=old.animate([{opacity:1},{opacity:0}],{duration:260,easing:'ease-out',fill:'forwards'});
  fade.finished.then(()=>old.remove()).catch(()=>old.remove());
 }
 previousCanvas=canvas;previousLayout=layout;
}

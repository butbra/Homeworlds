import {type Action,type GameState,type Piece} from './game';
import {pyramid} from './tabletop';
const card=(id:string)=>Array.from(document.querySelectorAll<HTMLElement>('.system')).find(e=>e.dataset.system===id);
const shipElement=(id:string,index:number)=>card(id)?.querySelector<HTMLElement>(`[data-ship="${index}"]`);
export interface ActionVisual {rect?:DOMRect;piece?:Piece;owner?:number}
export function beforeAction(state:GameState,action:Action):ActionVisual {
 if(!('system'in action))return {};
 const s=state.systems.find(s=>s.id===action.system);
 const ship='ship'in action?s?.ships[action.ship]:undefined;
 return {rect:('ship'in action?shipElement(action.system,action.ship):card(action.system))?.getBoundingClientRect(),piece:ship,owner:ship?.owner};
}
function run(element:HTMLElement,keyframes:Keyframe[],duration=440):void {
 const a=element.animate(keyframes,{duration,easing:'cubic-bezier(.2,.7,.3,1)'});
 a.finished.then(()=>element.remove()).catch(()=>element.remove());
}
/** Effects only decorate committed actions; they never delay turns or mutate game state. */
export function animateAction(before:ActionVisual,next:GameState,action:Action,durationScale=1):void {
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||!('system'in action))return;
 const old=before.rect;
 if(action.type==='catastrophe'&&old) {
  const x=old.x+old.width/2,y=old.y+old.height/2;
  const color={red:'#ff6c58',blue:'#65b0ff',yellow:'#ffe17c',green:'#8fea81'}[action.color];
  const spawn=(className:string,style='')=>{const element=document.createElement('div');element.className=className;element.setAttribute('aria-hidden','true');element.style.cssText=`left:${x}px;top:${y}px;${style}`;document.body.append(element);return element;};
  // A short, local fireball with overlapping flame lobes, smoke and hot fragments.
  const core=spawn('explosion-core');
  run(core,[{transform:'translate(-50%,-50%) scale(.12)',opacity:1},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.22},{transform:'translate(-50%,-50%) scale(1.35)',opacity:.6,offset:.55},{transform:'translate(-50%,-50%) scale(1.6)',opacity:0}],700*durationScale);
  const ring=spawn('catastrophe-ring',`border-color:${color};color:${color}`);
  run(ring,[{transform:'translate(-50%,-50%) scale(.2)',opacity:.7},{transform:'translate(-50%,-50%) scale(1.5)',opacity:0}],720*durationScale);
  for(let i=0;i<8;i++) {
   const angle=i*Math.PI/4,dx=Math.cos(angle),dy=Math.sin(angle);
   const flame=spawn('explosion-flame',`width:${28+i%3*7}px;height:${28+i%3*7}px`);
   run(flame,[{transform:'translate(-50%,-50%) scale(.2)',opacity:0},{transform:`translate(calc(-50% + ${dx*22}px),calc(-50% + ${dy*20}px)) scale(1)`,opacity:.95,offset:.25},{transform:`translate(calc(-50% + ${dx*42}px),calc(-50% + ${dy*36}px)) scale(.7)`,opacity:0}],650*durationScale);
   const shard=spawn('catastrophe-spark',`background:${color};box-shadow:0 0 5px #ff9a43`);
   run(shard,[{transform:'translate(-50%,-50%) rotate(0deg)',opacity:1},{transform:`translate(${dx*(65+i%3*9)}px,${dy*(50+i%3*9)}px) rotate(${i*53+100}deg) scale(.2)`,opacity:0}],760*durationScale);
   if(i%2===0){const smoke=spawn('explosion-smoke');run(smoke,[{transform:'translate(-50%,-50%) scale(.3)',opacity:0},{transform:`translate(calc(-50% + ${dx*25}px),calc(-50% + ${dy*20-10}px)) scale(.8)`,opacity:.6,offset:.45},{transform:`translate(calc(-50% + ${dx*40}px),calc(-50% + ${dy*30-25}px)) scale(1.3)`,opacity:0}],850*durationScale);}
  }
  return;
 }
 let target:HTMLElement|undefined;
 if(action.type==='move'||action.type==='discover') {
  const id=action.type==='move'?action.destination:`system-${next.nextSystem-1}`;
  const destination=next.systems.find(s=>s.id===id);
  if(destination)target=shipElement(id,destination.ships.length-1)??undefined;
  if(target&&old&&before.piece) {
   const end=target.getBoundingClientRect();
   const ghost=document.createElement('div');ghost.className='moving-ship';ghost.innerHTML=pyramid(before.piece,false,before.owner);ghost.style.cssText=`left:${old.x}px;top:${old.y}px;width:${old.width}px;height:${old.height}px`;document.body.append(ghost);
   const dx=end.x-old.x,dy=end.y-old.y;
   run(ghost,[{transform:'translate(0,0)',opacity:.9},{transform:`translate(${dx/2}px,${dy/2-12}px)`,opacity:.85,offset:.5},{transform:`translate(${dx}px,${dy}px)`,opacity:0}],480*durationScale);
   target.animate([{opacity:0},{opacity:0,offset:.65},{opacity:1}],{duration:480*durationScale});
  }
 } else if(action.type==='build') {
  const s=next.systems.find(s=>s.id===action.system);if(s)target=shipElement(s.id,s.ships.length-1)??undefined;
  target?.animate([{transform:'scale(.35)',opacity:0,filter:'brightness(2)'},{transform:'scale(1.08)',opacity:1,offset:.7},{transform:'scale(1)',filter:'brightness(1)'}],{duration:400*durationScale,easing:'ease-out'});
 } else if(action.type==='capture'||action.type==='trade') {
  target=shipElement(action.system,action.ship)??undefined;
  target?.animate([{filter:'brightness(2.4)',transform:'scale(.85)'},{filter:'brightness(1)',transform:'scale(1)'}],{duration:420*durationScale,easing:'ease-out'});
  if(action.type==='capture')target?.querySelector('svg')?.animate([{transform:`rotate(${before.owner===0?180:0}deg)`},{transform:`rotate(${before.owner===0?0:180}deg)`}],{duration:420*durationScale,easing:'ease-in-out'});
 } else if(action.type==='sacrifice'&&old&&before.piece) {
  const ghost=document.createElement('div');ghost.className='moving-ship';ghost.innerHTML=pyramid(before.piece,false,before.owner);ghost.style.cssText=`left:${old.x}px;top:${old.y}px`;document.body.append(ghost);run(ghost,[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.1)'}],300*durationScale);
 }
}

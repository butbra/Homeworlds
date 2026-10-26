import {applyAction,type Action,type Color,type GameState,type Piece,type Player} from './game';
import type {Setup} from './setup';
const names:Record<string,Color>={r:'red',y:'yellow',g:'green',b:'blue',red:'red',yellow:'yellow',green:'green',blue:'blue'};
const code=(p:Piece)=>p.color[0]+p.size;
export function quuxPosition(state:GameState):{text:string;names:Map<string,string>} {
  const names=new Map(state.systems.map((s,i)=>[`N${i}`,s.id]));
  return {names,text:state.systems.map((s,i)=>`N${i} (${s.homeworld===undefined?'':s.homeworld+', '}${s.stars.map(code).join('')}) ${s.ships.filter(p=>p.owner===0).map(code).join('')}-${s.ships.filter(p=>p.owner===1).map(code).join('')}`).join('\n')+'\n'};
}
export function quuxSetupPosition(draft:Setup):string {
  return draft.flatMap((p,i)=>p.length===3?[`N${i} (${i}, ${code(p[0])+code(p[1])}) ${i===0?code(p[2]):''}-${i===1?code(p[2]):''}`]:[]).join('\n');
}
export function decodeQuuxSetup(text:string):Piece[] {
  const match=/^\w+ \([01], ([rygb][123])([rygb][123])\) ((?:[rygb][123])*)-((?:[rygb][123])*)$/.exec(text.trim());
  if(!match)throw Error('Quux Bot returned an invalid homeworld.');
  const pieces=[match[1],match[2],match[3]||match[4]];
  if(!/^[rygb]3$/.test(pieces[2]))throw Error('Quux Bot must choose a large starting ship.');
  return pieces.map(p=>({color:names[p[0]],size:Number(p[1])as Piece['size']}));
}
/** Translate the entire proposed turn transactionally before any UI state changes. */
export function quuxActions(initial:GameState,text:string):Action[] {
  let state=initial;const mapping=quuxPosition(state).names,actions:Action[]=[];
  const system=(name:string)=>{const id=mapping.get(name);if(!id)throw Error('Quux Bot selected an unknown system.');return id;};
  const ship=(id:string,piece:string,enemy=false)=>{
    const ships=state.systems.find(s=>s.id===id)?.ships??[];
    const index=ships.findIndex(p=>code(p)===piece&&(enemy?p.owner!==state.player:p.owner===state.player));
    if(index<0)throw Error('Quux Bot selected an unavailable ship.');return index;
  };
  const add=(action:Action)=>{state=applyAction(state,action);actions.push(action);};
  for(const part of text.split(';').map(p=>p.trim()).filter(Boolean)) {
    let match:RegExpExecArray|null;
    if(part==='pass')continue;
    if((match=/^(build|capture|sacrifice) ([rygb][123]) at (\w+)$/.exec(part))) {
      const [,kind,piece,name]=match,id=system(name);
      if(kind==='build') {
        const smallest=state.bank.filter(p=>p.color===names[piece[0]]).sort((a,b)=>a.size-b.size)[0];
        if(!smallest||code(smallest)!==piece)throw Error('Quux Bot selected an invalid build size.');
        add({type:'build',system:id,color:names[piece[0]]});
      } else add({type:kind as 'capture'|'sacrifice',system:id,ship:ship(id,piece,kind==='capture')});
    } else if((match=/^convert ([rygb][123]) to ([rygb][123]) at (\w+)$/.exec(part))) {
      const [,old,piece,name]=match,id=system(name);
      if(old[1]!==piece[1])throw Error('Quux Bot selected an invalid trade size.');
      add({type:'trade',system:id,ship:ship(id,old),color:names[piece[0]]});
    } else if((match=/^move ([rygb][123]) from (\w+) to (\w+)(?: \(([rygb][123])\))?$/.exec(part))) {
      const [,piece,from,to,star]=match,id=system(from),index=ship(id,piece);
      if(star){if(mapping.has(to))throw Error('Quux Bot reused a system name.');mapping.set(to,`system-${state.nextSystem}`);add({type:'discover',system:id,ship:index,star:{color:names[star[0]],size:Number(star[1])as Piece['size']}});}
      else add({type:'move',system:id,ship:index,destination:system(to)});
    } else if((match=/^catastrophe (red|yellow|green|blue|r|y|g|b) at (\w+)$/.exec(part)))add({type:'catastrophe',system:system(match[2]),color:names[match[1]]});
    else throw Error('Quux Bot returned an unrecognized order.');
  }
  if(!text.trim())throw Error('Quux Bot returned an empty turn.');
  add({type:'end'});
  return actions;
}

let worker:Worker|null=null;
let rejectPending:((reason:Error)=>void)|null=null;
export function stopQuux():void {
  worker?.terminate();worker=null;
  rejectPending?.(Error('Quux Bot request cancelled.'));rejectPending=null;
}
export function askQuux(kind:'move'|'setup'|'coach',text:string,player:Player,difficulty=10):Promise<string> {
  stopQuux();
  return new Promise((resolve,reject)=>{
    const active=new Worker(new URL('./quux-worker.ts',import.meta.url),{type:'module'});worker=active;
    const timer=setTimeout(()=>finish(Error('Quux Bot needs more time. Retry its turn or start a new game.')),60_000);
    function finish(error:Error|null,result?:string):void {
      clearTimeout(timer);active.terminate();if(worker===active){worker=null;rejectPending=null;}
      if(error)reject(error);else resolve(result!);
    }
    rejectPending=error=>finish(error);
    active.onmessage=event=>event.data.ok?finish(null,event.data.result):finish(Error(event.data.error));
    active.onerror=()=>finish(Error('Could not run Quux Bot. Please retry.'));
    const seed=new Uint32Array(1);crypto.getRandomValues(seed);
    active.postMessage({kind,text,player,seed:seed[0],difficulty});
  });
}

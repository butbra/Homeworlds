import {applyAction,createInitialState,type Player} from './game';
import type {Session} from './session';

/** Replay identity alongside the rules, so identical ships and shifted indexes
 * cannot make the highlight point at the wrong piece. */
export function lastOpponentMove(session:Session,viewer:Player):{system:string;ship:number|null;description:string}|null {
 let state=createInitialState(session.opening,session.starter),nextId=0;
 const ids=new Map(state.systems.map(s=>[s.id,s.ships.map(()=>nextId++)]));
 type Mark={id:number|null;system:string;description:string};
 let pending:Mark|null=null,previous:Mark|null=null;
 for(const action of session.actions){
  const next=applyAction(state,action);
  if(action.type==='end'){
   if(state.player!==viewer&&pending)previous=pending;
   pending=null;
  }else if('system' in action){
   const system=state.systems.find(s=>s.id===action.system)!;
   const list=ids.get(system.id)!;
   let id:number|null='ship' in action?list[action.ship]:null;
   let destination=system.id;
   switch(action.type){
    case 'build':id=nextId++;list.push(id);break;
    case 'move':case 'discover':{
     destination=action.type==='move'?action.destination:`system-${state.nextSystem}`;
     list.splice(action.ship,1);
     if(!ids.has(destination))ids.set(destination,[]);
     ids.get(destination)!.push(id!);break;
    }
    case 'sacrifice':list.splice(action.ship,1);break;
    case 'catastrophe':{
     const survivor=next.systems.find(s=>s.id===system.id);
     ids.set(system.id,survivor?.stars.length?list.filter((_,i)=>system.ships[i].color!==action.color):[]);break;
    }
   }
   const name=next.systems.find(s=>s.id===destination)?.name??system.name;
   pending={id,system:destination,description:`${action.type[0].toUpperCase()+action.type.slice(1)} at ${name}`};
  }
  for(const key of ids.keys())if(!next.systems.some(s=>s.id===key))ids.delete(key);
  state=next;
 }
 if(!previous)return null;
 for(const [system,list] of ids){const ship=previous.id===null?-1:list.indexOf(previous.id);if(ship>=0)return {system,ship,description:previous.description};}
 return {system:previous.system,ship:null,description:previous.description};
}

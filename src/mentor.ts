import {applyAction,colors,type Action,type GameState,type Piece,type Player,type StarSystem} from './game';
import {coachPosition,describeTurn,type PositionReview} from './coach';
import {quuxActions} from './quux';
import type {ShipSelection} from './tabletop';

export interface GuideChoice {move:string;review:PositionReview;actions:Action[]}
export interface GuideResult {choices:GuideChoice[];current:PositionReview;baseline:PositionReview|null;baselineMove:string;checked:number;limited:boolean}
export function guideRequest(start:GameState,current:GameState):string {
  const {sacrificed,color,remaining}=current.allowance;
  return coachPosition(start)+'\n===GUIDE===\n'+`${sacrificed?1:0} ${color===null?-1:colors.indexOf(color)} ${remaining}\n`+coachPosition(current);
}
const pieceKey=(p:Piece)=>p.color+':'+p.size;
const list=(p:Piece[])=>p.map(pieceKey).sort().join(',');
const systemKey=(s:StarSystem)=>list(s.stars)+'|'+([0,1]as Player[]).map(owner=>list(s.ships.filter(p=>p.owner===owner))).join('|');
/** Identify equivalent boards without treating array ordering or discovered-star
 * names as game rules. Allowance is essential for correct sacrifice guidance. */
function correspondence(expected:GameState,current:GameState):Map<string,string>|null {
  if(expected.player!==current.player||expected.allowance.sacrificed!==current.allowance.sacrificed||expected.allowance.color!==current.allowance.color||expected.allowance.remaining!==current.allowance.remaining||list(expected.bank)!==list(current.bank)||expected.systems.length!==current.systems.length)return null;
  const unused=[...current.systems],mapping=new Map<string,string>();
  for(const s of expected.systems) {
    const i=unused.findIndex(t=>t.homeworld===s.homeworld&&systemKey(t)===systemKey(s));
    if(i<0)return null;
    mapping.set(s.id,unused[i].id);unused.splice(i,1);
  }
  return mapping;
}
function rebase(expected:GameState,current:GameState,actions:Action[],mapping:Map<string,string>):Action[] {
  const result:Action[]=[];
  for(const action of actions) {
    const next={...action};
    if('system'in next) {
      const target=mapping.get(next.system);if(!target)throw Error('Advice refers to a removed system.');
      next.system=target;
      if('ship'in next&&'ship'in action) {
        const ship=expected.systems.find(s=>s.id===action.system)?.ships[action.ship];
        const index=current.systems.find(s=>s.id===target)?.ships.findIndex(p=>ship&&p.owner===ship.owner&&pieceKey(p)===pieceKey(ship))??-1;
        if(index<0)throw Error('Advice refers to an unavailable ship.');next.ship=index;
      }
    }
    if(next.type==='move') {const target=mapping.get(next.destination);if(!target)throw Error('Advice destination is missing.');next.destination=target;}
    if(action.type==='discover')mapping.set(`system-${expected.nextSystem}`,`system-${current.nextSystem}`);
    expected=applyAction(expected,action);current=applyAction(current,next);result.push(next);
  }
  return result;
}
/** Continue a complete recommended turn from the user's actual intermediate
 * position. Never grant a new action, sacrifice, or color access. */
export function remainingPlan(start:GameState,actions:Action[],current:GameState):Action[]|null {
  let prefix=start;
  for(let i=0;i<actions.length;i++) {
    const mapping=correspondence(prefix,current);
    if(mapping)try{return rebase(prefix,current,actions.slice(i),mapping);}catch{return null;}
    if(actions[i].type==='end')break;
    prefix=applyAction(prefix,actions[i]);
  }
  return null;
}
export function decodeGuide(start:GameState,current:GameState,text:string):GuideResult {
  const data=JSON.parse(text)as GuideResult;
  const valid=(r:PositionReview)=>r&&Number.isFinite(r.score)&&[-1,0,1,2].includes(r.outcome)&&typeof r.losesNext==='boolean'&&typeof r.winningReply==='string';
  if(!Array.isArray(data.choices)||data.choices.length>3||!valid(data.current)||(data.baseline!==null&&!valid(data.baseline))||typeof data.baselineMove!=='string'||!Number.isInteger(data.checked)||typeof data.limited!=='boolean')throw Error('Invalid teaching analysis.');
  if(data.baseline)try{quuxActions(start,data.baselineMove);}catch{data.baseline=null;}
  data.choices=data.choices.flatMap(choice=>{
    if(typeof choice.move!=='string'||!valid(choice.review)||choice.review.losesNext)return [];
    try {
      const actions=quuxActions(start,choice.move),remaining=remainingPlan(start,actions,current);
      if(!remaining)return [];
      const end=remaining.reduce(applyAction,current),outcome=end.outcome==='playing'?-1:end.outcome==='draw'?2:end.outcome;
      if(outcome!==choice.review.outcome||outcome===1-current.player)return [];
      return [{...choice,actions}];
    }catch{return [];}
  });
  return data;
}
export function winningConfirmation(state:GameState,hasStagedAction:boolean):{text:string;selector:string}|null {
  return hasStagedAction&&state.outcome==='playing'&&applyAction(state,{type:'end'}).outcome===state.player?
    {text:'Your staged turn already wins. Press End turn to confirm the victory.',selector:'#end'}:null;
}

export interface MoveExplanation {benefits:string[];risks:string[]}
const power={green:'build',yellow:'travel',red:'capture',blue:'trade'};
const size=['','small','medium','large'];
const count=(s:GameState,p:Player)=>s.systems.reduce((n,x)=>n+x.ships.filter(t=>t.owner===p).length,0);
const homeCount=(s:GameState,p:Player)=>s.systems.find(x=>x.homeworld===p)?.ships.filter(t=>t.owner===p).length??0;
export function explainPlan(current:GameState,actions:Action[],review:PositionReview):MoveExplanation {
  const player=current.player,enemy=(1-player)as Player,after=actions.reduce(applyAction,current);
  const benefits:string[]=[],risks:string[]=[];
  if(after.outcome===player)benefits.push('This line wins when you confirm the turn.');
  const first=actions.find(a=>a.type!=='end');
  if(first?.type==='build') {
    if(current.systems.find(s=>s.id===first.system)?.homeworld===player&&homeCount(current,player)===1)benefits.push('Building a second ship at home lets you later send one out while keeping your homeworld occupied.');
    else benefits.push('Adds another ship without giving up an existing one. More ships give you more pieces to move, capture with, or sacrifice later.');
    if(first.color==='green')benefits.push('Keeping green ships supports future building. Spread your fleet before four green pieces gather in one system.');
  }
  if(first?.type==='trade') {
    const system=current.systems.find(s=>s.id===first.system)!;
    const access=[...system.stars,...system.ships.filter(p=>p.owner===player)];
    if(!access.some(p=>p.color===first.color))benefits.push(`Adds ${first.color} power at ${system.name}, giving your ships there access to ${power[first.color]} on later turns.`);
    else benefits.push(`Adds a ${first.color} ship you can move elsewhere or sacrifice for ${power[first.color]} actions later.`);
    const old=system.ships[first.ship];
    if(old.size===3)benefits.push(`The large ${first.color} ship can later be sacrificed for up to three ${power[first.color]} actions.`);
    if(first.color==='red'&&system.ships.some((p,i)=>i!==first.ship&&p.owner===player&&p.size>old.size))benefits.push('The red ship can supply capture power while a larger friendly ship meets the capture-size requirement.');
    if(old.color==='green'&&old.size===3)risks.push('Trading your large green gives up the option to sacrifice that ship for three builds later.');
    else if(system.ships.some(p=>p.owner===player&&p.color==='green'&&p.size===3))benefits.push('Your large green ship stays available for a future three-build sacrifice.');
    if(![...system.stars,...system.ships.filter((p,i)=>p.owner===player&&i!==first.ship)].some(p=>p.color===old.color))risks.unshift(`Trading this ship removes your local ${power[old.color]} access until you restore ${old.color} power or use a sacrifice.`);
  }
  if(first?.type==='move'||first?.type==='discover') {
    if(first.type==='discover')benefits.push(`Opens a new outpost through a size-${first.star.size} star, giving you another place to operate from.`);
    else benefits.push(`Repositions a ship at ${current.systems.find(s=>s.id===first.destination)?.name}. This is movement, not a capture in the same basic action.`);
    if(homeCount(after,player)>0)benefits.push(`${homeCount(after,player)} of your ships remain at home at the end of the line.`);
    if(first.type==='move'&&current.systems.find(s=>s.id===first.destination)?.ships.some(p=>p.owner===enemy))risks.push('Moving into enemy territory gives the opponent a turn to respond before a later capture.');
  }
  if(first?.type==='capture')benefits.push('Takes a ship away from the opponent and adds that same ship to your fleet, a swing in both fleets at once.');
  if(first?.type==='sacrifice') {
    const ship=current.systems.find(s=>s.id===first.system)!.ships[first.ship];
    benefits.push(`Converts your ${size[ship.size]} ${ship.color} ship into up to ${ship.size} ${power[ship.color]} actions across the board. Follow the whole sequence before ending.`);
    risks.push('The sacrificed ship is gone. Sacrifice actions must stay in its color and unused actions disappear at End turn.');
  }
  if(first?.type==='catastrophe') {
    const own=count(current,player)-count(after,player),opponent=count(current,enemy)-count(after,enemy);
    if(opponent>0)benefits.push(`The complete line removes ${opponent} enemy ship${opponent===1?'':'s'}.`);
    if(own>0)risks.push(`The complete line also costs ${own} of your ships. The catastrophe is optional, not a required move.`);
    if(!opponent)risks.push('This line removes no enemy ships. Consider its cost to your own fleet before choosing it.');
  }
  if(after.outcome===enemy)risks.unshift('Ending this line loses your homeworld. Undo or find a way to restore it before confirming.');
  else if(after.outcome==='draw')risks.unshift('This line eliminates both players and ends in a draw.');
  if(review.losesNext)risks.unshift('Quux found an immediate winning reply for the opponent. This is not a safe recommendation.');
  if(homeCount(after,player)===1&&after.outcome==='playing')risks.push('Only one of your ships will remain at home. Losing it would eliminate you.');
  for(const system of after.systems)for(const color of colors)if([...system.stars,...system.ships].filter(p=>p.color===color).length>=4)risks.push(`${system.name} still has four or more ${color} pieces. The opponent can choose to trigger that catastrophe.`);
  if(!benefits.length&&first)benefits.push('Quux prefers the position at the end of this complete line, balancing fleet strength, powers, and homeworld threats.');
  return {benefits,risks};
}

export function catastropheImpact(state:GameState,action:Extract<Action,{type:'catastrophe'}>) {
  const before=state.systems.find(s=>s.id===action.system)!;
  const after=applyAction(state,action),system=after.systems.find(s=>s.id===action.system);
  const lost=(owner:Player)=>before.ships.filter(p=>p.owner===owner).length-(system?.ships.filter(p=>p.owner===owner).length??0);
  const end=applyAction(after,{type:'end'});
  return {before,system,own:lost(state.player),enemy:lost((1-state.player)as Player),stars:before.stars.length-(system?.stars.length??0),wholeSystem:!system?.stars.length,loses:end.outcome===1-state.player,draws:end.outcome==='draw'};
}

/** Show the next physical click for a legal full-turn plan, not every legal
 * catastrophe or every legal ship as though each were good advice. */
export function nextClick(state:GameState,actions:Action[],selected:string,source:ShipSelection|null,intent:string):{text:string;selector:string}|null {
  const a=actions[0];if(!a)return null;
  if(a.type==='end')return {text:'The suggested line is complete. Review the position, then press End turn.',selector:'#end'};
  if(a.type==='resign'||a.type==='draw')return null;
  const name=state.systems.find(s=>s.id===a.system)!.name;
  const ship='ship'in a?state.systems.find(s=>s.id===a.system)!.ships[a.ship]:null;
  const shipSelector=`[data-source="${a.system}"][data-ship="${'ship'in a?a.ship:0}"]`;
  if(a.type==='build') {
    if(source)return {text:'Cancel the ship selection first, then choose the system where you will build.',selector:'#clear'};
    if(selected!==a.system)return {text:`Select ${name} to build there.`,selector:`[data-select="${a.system}"]`};
    const piece=state.bank.filter(p=>p.color===a.color).sort((a,b)=>a.size-b.size)[0];
    return {text:`Build the ${size[piece.size]} ${a.color} ship at ${name}. Click its gold-marked bank piece.`,selector:`[data-color="${a.color}"][data-size="${piece.size}"]`};
  }
  if(a.type==='capture')return {text:`Capture the ${size[ship!.size]} ${ship!.color} enemy ship at ${name}.`,selector:shipSelector};
  if(a.type==='catastrophe')return {text:`Consider the ${a.color} catastrophe at ${name}. Preview its losses before deciding.`,selector:`[data-cat-system="${a.system}"][data-cat="${a.color}"]`};
  if(source?.system!==a.system||source.ship!==a.ship)return {text:`Select your ${size[ship!.size]} ${ship!.color} ship at ${name}.`,selector:shipSelector};
  if(a.type==='sacrifice')return {text:`Choose Sacrifice for this ${ship!.color} ship, then follow the remaining actions.`,selector:'#sacrifice'};
  if(a.type==='trade')return intent!=='trade'?{text:'Choose Trade beside your selected ship.',selector:'[data-intent="trade"]'}:{text:`Trade for the same-size ${a.color} piece marked in gold in the bank.`,selector:`[data-color="${a.color}"][data-size="${ship!.size}"]`};
  if(a.type==='discover')return intent!=='discover'?{text:'Choose Travel beside your selected ship to discover a new star.',selector:'[data-intent="discover"]'}:{text:`Discover using the size-${a.star.size} ${a.star.color} bank piece marked in gold.`,selector:`[data-color="${a.star.color}"][data-size="${a.star.size}"]`};
  return {text:`Move the selected ship to ${state.systems.find(s=>s.id===a.destination)!.name}.`,selector:`[data-select="${a.destination}"]`};
}

export const planSteps=(state:GameState,actions:Action[])=>actions.every(a=>a.type==='end')?['Press End turn to confirm the actions already staged.']:describeTurn(state,actions);

import {applyAction,areConnected,colors,type Action,type Color,type GameState,type Piece,type Player} from './game';
import {quuxActions,quuxPosition} from './quux';

export interface PositionReview {score:number;outcome:-1|0|1|2;losesNext:boolean;winningReply:string}
export interface CoachAnalysis {bestMove:string;best:PositionReview;candidate:PositionReview|null}
export const coachSeparator='\n===COACH===\n';

/** Evaluate the staged board as if End turn were pressed, not as a fresh turn.
 * Empty destroyed systems are omitted to match the native engine's cleanup.
 * Serializing the legal board also supports interleaved free catastrophes. */
export function coachPosition(state:GameState):string {
  return quuxPosition({...state,systems:state.systems.filter(s=>s.stars.length>0)}).text;
}
export function coachRequest(start:GameState,staged?:GameState):string {
  return coachPosition(start)+(staged?coachSeparator+coachPosition(applyAction(staged,{type:'end'})):'');
}
export function decodeAnalysis(text:string):CoachAnalysis {
  const data=JSON.parse(text) as CoachAnalysis;
  const review=(r:PositionReview)=>r&&Number.isFinite(r.score)&&[-1,0,1,2].includes(r.outcome)&&typeof r.losesNext==='boolean'&&typeof r.winningReply==='string';
  if(!data||typeof data.bestMove!=='string'||!review(data.best)||(data.candidate!==null&&!review(data.candidate)))throw Error('Quux returned an invalid analysis.');
  return data;
}
/** A transparent heuristic scale, not a probability or a solved-game value.
 * Wins/losses and one-turn threats take precedence over the static score gap. */
export function moveRating(best:PositionReview,candidate:PositionReview,player:Player):number {
  if(candidate.outcome===player)return 10;
  if(candidate.outcome===1-player)return 1;
  if(candidate.outcome===2)return best.outcome===player?3:5;
  if(candidate.losesNext)return 2;
  const gap=Math.max(0,best.score-candidate.score);
  const score=Math.max(2,10-Math.ceil(8*gap/(gap+40)));
  return best.outcome===player?Math.min(5,score):score;
}

const sizeName=['','small','medium','large'];
const pieceName=(p:Piece)=>`${sizeName[p.size]} ${p.color}`;
const powerName:Record<Color,string>={red:'capture',yellow:'travel',green:'build',blue:'trade'};
const systemName=(state:GameState,id:string)=>state.systems.find(s=>s.id===id)?.name??id;

export function describeTurn(start:GameState,actions:Action[]):string[] {
  let state=start;
  const steps:string[]=[];
  for(const action of actions) {
    if(action.type==='end')continue;
    if(action.type==='resign'||action.type==='draw')throw Error('Not a playable turn.');
    const system=state.systems.find(s=>s.id===action.system)!;
    const ship='ship'in action?system.ships[action.ship]:null;
    const after=applyAction(state,action);
    switch(action.type) {
      case 'build': {
        const piece=state.bank.filter(p=>p.color===action.color).sort((a,b)=>a.size-b.size)[0];
        steps.push(`Build a ${pieceName(piece)} ship at ${system.name}.`);break;
      }
      case 'trade':steps.push(`Trade the ${pieceName(ship!)} ship at ${system.name} for ${action.color}, keeping the same size.`);break;
      case 'move':steps.push(`Move the ${pieceName(ship!)} ship from ${system.name} to ${systemName(state,action.destination)}.`);break;
      case 'discover':steps.push(`Move the ${pieceName(ship!)} ship from ${system.name} to a new ${pieceName(action.star)} star system (${systemName(after,`system-${state.nextSystem}`)}).`);break;
      case 'capture':steps.push(`Capture the ${pieceName(ship!)} enemy ship at ${system.name}. It joins your fleet.`);break;
      case 'sacrifice':steps.push(`Sacrifice the ${pieceName(ship!)} ship at ${system.name} for up to ${ship!.size} ${powerName[ship!.color]} action${ship!.size===1?'':'s'}.`);break;
      case 'catastrophe': {
        const remaining=after.systems.find(s=>s.id===system.id);
        const lost=(owner:Player)=>system.ships.filter(p=>p.owner===owner).length-(remaining?.ships.filter(p=>p.owner===owner).length??0);
        steps.push(`Trigger a ${action.color} catastrophe at ${system.name}. It destroys ${lost(start.player)} of your ships and ${lost((1-start.player)as Player)} enemy ships.${!remaining?.stars.length?' The last star is destroyed, so the whole system is lost.':''}`);break;
      }
    }
    state=after;
  }
  return steps.length?steps:['Pass this turn. Quux did not select an active move.'];
}

function access(state:GameState,player:Player,color:Color):number {
  return state.systems.filter(s=>s.ships.some(p=>p.owner===player)&&[...s.stars,...s.ships.filter(p=>p.owner===player)].some(p=>p.color===color)).length;
}
export function explainTurn(start:GameState,actions:Action[],review:PositionReview):string[] {
  const player=start.player,enemy=(1-player)as Player;
  const after=actions.reduce(applyAction,start),notes:string[]=[];
  if(review.outcome===player)notes.push('This turn wins the game when confirmed.');
  else if(review.outcome===enemy)notes.push('Ending here loses the game because your homeworld is destroyed or has none of your ships.');
  else if(review.outcome===2)notes.push('Both homeworlds are eliminated, so ending here draws the game.');
  else if(review.losesNext)notes.push('Quux found a winning reply for your opponent next turn. Ending here leaves a one-turn loss.');
  else notes.push('Quux found no immediate winning reply for your opponent. That checks the next turn, not every future threat.');

  const count=(s:GameState,p:Player)=>s.systems.reduce((n,x)=>n+x.ships.filter(ship=>ship.owner===p).length,0);
  const ownDelta=count(after,player)-count(start,player),enemyDelta=count(after,enemy)-count(start,enemy);
  if(ownDelta>0)notes.push(`Your fleet gains ${ownDelta} ship${ownDelta===1?'':'s'}, giving you more pieces to use on later turns.`);
  if(enemyDelta<0)notes.push(`Your opponent loses ${-enemyDelta} ship${enemyDelta===-1?'':'s'}.`);
  if(ownDelta<0)notes.push(`This line costs ${-ownDelta} of your ships, including any sacrifices.`);
  for(const color of colors) {
    const delta=access(after,player,color)-access(start,player,color);
    if(delta>0)notes.push(`You gain ${powerName[color]} access in more systems through ${color} power.`);
    if(delta<0)notes.push(`You lose local ${powerName[color]} access in ${-delta} system${delta===-1?'':'s'}. A ${color} sacrifice can still provide that power elsewhere.`);
  }
  const home=after.systems.find(s=>s.homeworld===player);
  const guards=home?.ships.filter(p=>p.owner===player).length??0;
  if(review.outcome===-1&&guards===1)notes.push('Only one of your ships remains at home. Losing or capturing it would eliminate you.');
  const occupied=(s:GameState)=>s.systems.filter(x=>x.ships.some(p=>p.owner===player)).length;
  if(occupied(after)>occupied(start))notes.push('Your fleet reaches more systems, adding places to operate from.');
  const crowded=after.systems.flatMap(s=>colors.filter(color=>[...s.stars,...s.ships].filter(p=>p.color===color).length>=4).map(color=>`${s.name} has at least four ${color} pieces`));
  if(crowded.length)notes.push(`${crowded.slice(0,2).join('. ')}. Either player can trigger the matching catastrophe on their turn, so leaving those pieces together carries a risk.`);
  if(actions.some(a=>a.type==='move'||a.type==='discover')) {
    const routes=(s:GameState)=>s.systems.filter(x=>x.ships.some(p=>p.owner===player)).reduce((n,x)=>n+s.systems.filter(y=>areConnected(x,y)).length,0);
    if(routes(after)>routes(start))notes.push('Your occupied systems have more direct travel connections. Using them still requires yellow power or a yellow sacrifice.');
  }
  return notes;
}

export function bestTurn(start:GameState,analysis:CoachAnalysis):Action[] {
  return quuxActions(start,analysis.bestMove);
}

/** Winning-reply names are relative to the reviewed board, not the turn start. */
export function describeReply(after:GameState,review:PositionReview):string[] {
  if(!review.losesNext||!review.winningReply)return [];
  const next={...after,systems:after.systems.filter(s=>s.stars.length>0)};
  try {return describeTurn(next,quuxActions(next,review.winningReply));}
  catch {return ['Quux found a legal winning reply, but its steps could not be displayed.'];}
}

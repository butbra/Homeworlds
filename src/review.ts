import {applyAction,createInitialState,type Action,type GameState,type Player} from './game';
import {createLayout,layoutAfter,type MapLayout} from './layout';
import {coachPosition,coachSeparator,decodeAnalysis,describeTurn,type PositionReview} from './coach';
import type {Session} from './session';

export interface ReplayFrame {state:GameState;layout:MapLayout;action:Action|null;actor:Player|null;description:string;completedTurns:number}
export interface ReviewPoint {frame:number;label:string;north:number|null;error?:boolean;request?:{text:string;player:Player}}
export interface GameReview {frames:ReplayFrame[];points:ReviewPoint[]}

export const reviewCacheKey='homeworlds.review.v1';
/** A score is reusable only for precisely the same positions and mover. */
export function evaluationKey(point:ReviewPoint):string|undefined {
 return point.request?JSON.stringify([point.request.player,point.request.text]):undefined;
}
export function readReviewCache(raw:string|null):Map<string,number> {
 try {const items:unknown=JSON.parse(raw??'[]');if(!Array.isArray(items))return new Map();
  return new Map(items.filter((entry):entry is [string,number]=>Array.isArray(entry)&&typeof entry[0]==='string'&&Number.isInteger(entry[1])&&entry[1]>=0&&entry[1]<=100).slice(-512));
 }catch {return new Map();}
}
export function applyReviewCache(review:GameReview,cache:ReadonlyMap<string,number>):void {
 for(const point of review.points){const key=evaluationKey(point);if(key!==undefined&&cache.has(key))point.north=cache.get(key)!;}
}

/** Reconstruct exact board and map snapshots without changing the saved game. */
export function createGameReview(session:Session):GameReview {
 let state=createInitialState(session.opening,session.starter),layout=createLayout(session.opening),turnStart=state,completedTurns=0;
 const frames:ReplayFrame[]=[{state,layout,action:null,actor:null,description:'Starting position — both homeworlds confirmed.',completedTurns}];
 const points:ReviewPoint[]=[{frame:0,label:'Start',north:50}];
 for(const action of session.actions){
  const actor=state.player,after=applyAction(state,action);
  const description=action.type==='end'?'Ended turn.':action.type==='resign'?'Resigned.':action.type==='draw'?'Agreed to a draw.':describeTurn(state,[action])[0];
  if(action.type==='end')completedTurns++;
  layout=layoutAfter(layout,state,action,after);state=after;
  frames.push({state,layout,action,actor,description,completedTurns});
  if(state.outcome!=='playing'){
   points.push({frame:frames.length-1,label:action.type==='end'?`Turn ${completedTurns}`:'Result',north:state.outcome==='draw'?50:state.outcome===0?100:0});
  }else if(action.type==='end'){
   // The candidate is the actual resulting board; Quux's best alternative is
   // not used as a proxy for the move that was really played.
   points.push({frame:frames.length-1,label:`Turn ${completedTurns}`,north:null,request:{text:coachPosition(turnStart)+coachSeparator+coachPosition(state),player:actor}});
   turnStart=state;
  }
 }
 return {frames,points};
}

/** Convert Quux's heuristic points to illustrative, NOT calibrated odds.
 * The player who just moved is the evaluator's perspective. A verified
 * immediate winning reply overrides the static score. */
export function northWinEstimate(review:PositionReview,actor:Player):number {
 const own=review.outcome===actor?100:review.outcome===1-actor?0:review.outcome===2?50:review.losesNext?2:Math.max(1,Math.min(99,Math.round(100/(1+Math.exp(-review.score/160)))));
 return actor===0?own:100-own;
}
export function decodeReviewPoint(text:string,actor:Player):number {
 const candidate=decodeAnalysis(text).candidate;
 if(!candidate)throw Error('Quux did not evaluate the played position.');
 return northWinEstimate(candidate,actor);
}

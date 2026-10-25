import {applyAction, colors, createInitialState, sizes, suggestedOpening, type Action, type GameState, type Opening,type Player} from './game';
import {humanPlayer,type GameMode} from './match';
export interface Session {version: 1; opening: Opening[]; actions: Action[];starter?:Player;mode?:GameMode;humanPlayer?:Player}
export const storageKey = 'homeworlds.session.v1';
export function newSession(opening: Opening[] = suggestedOpening,options:{starter?:Player;mode?:GameMode}={}): Session {
  const starter=options.starter??0,mode=options.mode??'local';
  createInitialState(opening,starter);
  return {version: 1, opening: structuredClone(opening), actions: [],starter,mode,...(mode==='quux'?{humanPlayer}:{})};
}
export function replay(session: Session): GameState {
  return session.actions.reduce((state, action) => applyAction(state, action), createInitialState(session.opening,session.starter));
}
function checkAction(value: unknown): asserts value is Action {
  if (!value || typeof value !== 'object') throw Error('Invalid saved action.');
  const a = value as Record<string, unknown>;
  if (['end','resign','draw'].includes(String(a.type))) return;
  if (typeof a.system !== 'string' || a.system.length > 100) throw Error('Invalid action system.');
  if (['trade','move','discover','capture','sacrifice'].includes(String(a.type)) && (!Number.isInteger(a.ship) || Number(a.ship) < 0)) throw Error('Invalid ship selection.');
  if (['build','trade','catastrophe'].includes(String(a.type)) && !colors.includes(a.color as never)) throw Error('Invalid action color.');
  if (a.type === 'move' && typeof a.destination !== 'string') throw Error('Invalid destination.');
  if (a.type === 'discover') {
    const star = a.star as Record<string, unknown> | undefined;
    if (!star || !colors.includes(star.color as never) || !sizes.includes(star.size as never)) throw Error('Invalid discovered star.');
  }
  if (!['build','trade','move','discover','capture','sacrifice','catastrophe'].includes(String(a.type))) throw Error('Unknown saved action.');
}
/** Saves contain an opening and legal action history, never trusted raw board state. */
export function decodeSession(text: string): Session {
  if (text.length > 2_000_000) throw Error('Save file is too large.');
  const value = JSON.parse(text) as Session;
  if (!value || value.version !== 1 || !Array.isArray(value.opening) || !Array.isArray(value.actions) || value.actions.length > 10000) throw Error('Unsupported or invalid save file.');
  for (const action of value.actions) checkAction(action);
  const starter=value.starter??0,mode=value.mode??'local';
  if((starter!==0&&starter!==1)||(mode!=='local'&&mode!=='quux'))throw Error('Invalid game mode or starting player.');
  if(value.humanPlayer!==undefined&&value.humanPlayer!==0&&value.humanPlayer!==1)throw Error('Invalid human player.');
  let session:Session={version:1,opening:value.opening,actions:value.actions,starter,mode,...(mode==='quux'?{humanPlayer:value.humanPlayer??0}:{})};
  createInitialState(value.opening,starter);
  const state=replay(session);
  const lastEnd=value.actions.map(a=>a.type).lastIndexOf('end');
  if(mode==='quux'&&state.player!==session.humanPlayer&&state.outcome==='playing'&&lastEnd<value.actions.length-1)throw Error('A bot turn must be saved at its turn boundary.');
  // Earlier bot saves placed the human at North. Exchange seats while retaining
  // the exact position, action history, ownership and identity of the starter.
  if(mode==='quux'&&session.humanPlayer===0){
    const swap=(id:string)=>id==='north'?'south':id==='south'?'north':id;
    session={...session,humanPlayer,starter:(1-starter)as Player,opening:[value.opening[1],value.opening[0]],actions:value.actions.map(action=>{
      const next={...action};
      if('system'in next)next.system=swap(next.system);
      if(next.type==='move')next.destination=swap(next.destination);
      return next;
    })};
    replay(session);
  }
  return session;
}

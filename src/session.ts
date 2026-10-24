import {applyAction, colors, createInitialState, sizes, suggestedOpening, type Action, type GameState, type Opening} from './game';
export interface Session {version: 1; opening: Opening[]; actions: Action[]}
export const storageKey = 'homeworlds.session.v1';
export function newSession(opening: Opening[] = suggestedOpening): Session {
  createInitialState(opening);
  return {version: 1, opening: structuredClone(opening), actions: []};
}
export function replay(session: Session): GameState {
  return session.actions.reduce((state, action) => applyAction(state, action), createInitialState(session.opening));
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
  createInitialState(value.opening);
  replay(value);
  return {version:1, opening:value.opening, actions:value.actions};
}

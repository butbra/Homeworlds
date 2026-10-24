import {applyAction, type Action, type GameState, type Piece} from './game';
export interface ShipSelection {system: string; ship: number}
export function legal(state: GameState, action: Action): boolean {
  try {applyAction(state,action);return true;} catch {return false;}
}
/** A bank piece is an exact physical choice, even when the rules choose build size. */
export function bankAction(state: GameState, system: string, piece: Piece, source: ShipSelection | null, intent: 'build'|'trade'|'discover'): Action {
  if (intent === 'trade') {
    if (!source) throw Error('Click your ship first, then a different bank color of the same size.');
    const ship=state.systems.find(s=>s.id===source.system)?.ships[source.ship];
    if (!ship || ship.size!==piece.size) throw Error('Trade requires a bank piece of the same size as your ship.');
    return {type:'trade',...source,color:piece.color};
  }
  if (intent==='discover') {
    if (!source) throw Error('Select the ship that will discover a new star.');
    return {type:'discover',...source,star:piece};
  }
  const smallest=state.bank.filter(p=>p.color===piece.color).reduce((size,p)=>Math.min(size,p.size),4);
  if(piece.size!==smallest) throw Error('Build the smallest available size of that color.');
  return {type:'build',system,color:piece.color};
}
export function pyramid(p: Piece, star=false, owner=-1): string {
  const fill={red:'#ff443e',yellow:'#f2d539',green:'#56e252',blue:'#4187ff'}[p.color];
  const dots=Array.from({length:p.size},(_,i)=>`<circle cx="${24+(i-(p.size-1)/2)*8}" cy="${43}" r="2.4" fill="#091018"/>`).join('');
  return `<svg viewBox="0 0 48 60" class="pyramid size-${p.size} ${star?'star':'ship'} owner-${owner}" aria-hidden="true">${star?`<path d="M5 10H43V48H5Z" fill="${fill}"/><path d="M5 10L24 29L43 10M24 29L5 48M24 29L43 48" fill="none" stroke="#0a152b" stroke-opacity=".35"/>`:`<path d="M24 3L46 55H2Z" fill="${fill}"/><path d="M24 3L24 55H46Z" fill="#000" opacity=".17"/><path d="M24 3L2 55H46Z" fill="none" stroke="${fill}" stroke-width="1.5"/>`}${dots}${star?'<circle cx="24" cy="29" r="6" fill="#e3f4ff" fill-opacity=".8"/>':''}</svg>`;
}

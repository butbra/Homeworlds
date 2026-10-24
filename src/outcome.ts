import {type GameState} from './game';
export function resultDescription(state:GameState):string {
 if(state.outcome==='playing')return '';
 if(state.outcome==='draw')return 'The game is a draw: both homeworlds were lost at turn confirmation, or both players agreed to a draw.';
 const loser=state.outcome===0?1:0;
 const home=state.systems.find(s=>s.homeworld===loser);
 if(!home||home.stars.length===0)return `Player ${loser+1} lost both homeworld stars. Player ${state.outcome+1} wins.`;
 if(!home.ships.some(s=>s.owner===loser))return `Player ${loser+1} has no ships left at their homeworld (captured, destroyed, or abandoned). Player ${state.outcome+1} wins.`;
 return `Player ${loser+1} resigned. Player ${state.outcome+1} wins.`;
}

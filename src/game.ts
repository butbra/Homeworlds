export const colors = ['red', 'yellow', 'green', 'blue'] as const;
export const sizes = [1, 2, 3] as const;
export type Color = typeof colors[number];
export type Size = typeof sizes[number];
export type Player = 0 | 1;
export interface Piece { color: Color; size: Size }
export interface Ship extends Piece { owner: Player }
export interface StarSystem { id: string; name: string; homeworld?: Player; stars: Piece[]; ships: Ship[] }
export interface GameState {
  systems: StarSystem[]; bank: Piece[];
  player: Player; turn: number;
  allowance: { color: Color | null; remaining: number; sacrificed: boolean };
  outcome: 'playing' | 'draw' | Player;
  nextSystem: number;
}

export interface Opening { stars: [Piece, Piece]; shipColor: Color }
export const suggestedOpening: [Opening, Opening] = [
  {stars: [{color: 'blue', size: 3}, {color: 'red', size: 1}], shipColor: 'green'},
  {stars: [{color: 'red', size: 2}, {color: 'blue', size: 1}], shipColor: 'green'},
];
// Rules13, pp. 4–5: choose a binary homeworld and one large ship per player.
export function createInitialState(opening: Opening[] = suggestedOpening, starter:Player=0): GameState {
  requireRule(starter===0||starter===1,'Invalid starting player.');
  requireRule(Array.isArray(opening) && opening.length === 2, 'Choose starting pieces for both players.');
  const systems: StarSystem[] = opening.map((choice, index) => {
    requireRule(choice && Array.isArray(choice.stars) && choice.stars.length === 2 && colors.includes(choice.shipColor), 'Each player needs two stars and a ship color.');
    for (const p of choice.stars) requireRule(p && colors.includes(p.color) && sizes.includes(p.size), 'Invalid starting star.');
    return {id: index === 0 ? 'north' : 'south', name: index === 0 ? 'North homeworld' : 'South homeworld', homeworld: index as Player, stars: structuredClone(choice.stars), ships: [{color: choice.shipColor, size: 3, owner: index as Player}]};
  });
  const bank: Piece[] = colors.flatMap(color => sizes.flatMap(size => Array.from({length: 3}, () => ({color, size}))));
  for (const system of systems) for (const piece of [...system.stars, ...system.ships]) take(bank, piece);
  return { systems, bank, player: starter, turn: 1, allowance: { color: null, remaining: 1, sacrificed: false }, outcome: 'playing', nextSystem: 1 };
}

// Rules13, pp. 3, 6: systems connect only when no star sizes overlap.
export function areConnected(a: StarSystem, b: StarSystem): boolean {
  return a.id !== b.id && a.stars.length > 0 && b.stars.length > 0 && !a.stars.some(x => b.stars.some(y => x.size === y.size));
}

export type Action =
  | { type: 'build'; system: string; color: Color }
  | { type: 'trade'; system: string; ship: number; color: Color }
  | { type: 'move'; system: string; ship: number; destination: string }
  | { type: 'discover'; system: string; ship: number; star: Piece }
  | { type: 'capture'; system: string; ship: number }
  | { type: 'sacrifice'; system: string; ship: number }
  | { type: 'catastrophe'; system: string; color: Color }
  | { type: 'end' }
  | { type: 'resign' }
  | { type: 'draw' };

const power = { build: 'green', trade: 'blue', move: 'yellow', discover: 'yellow', capture: 'red' } as const;
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function take(bank: Piece[], piece: Piece): Piece {
  const index = bank.findIndex(p => p.color === piece.color && p.size === piece.size);
  requireRule(index >= 0, 'That piece is unavailable in the bank.');
  return bank.splice(index, 1)[0];
}
function clean(state: GameState): void {
  state.systems = state.systems.filter(system => {
    if (system.homeworld !== undefined || system.ships.length > 0) return true;
    state.bank.push(...system.stars);
    return false;
  });
}

/** Pure transaction: rejected actions never mutate the supplied position. */
export function applyAction(previous: GameState, action: Action): GameState {
  requireRule(previous.outcome === 'playing', 'The game is over.');
  const state = structuredClone(previous);
  if (action.type === 'resign' || action.type === 'draw') {
    state.outcome = action.type === 'draw' ? 'draw' : state.player === 0 ? 1 : 0;
    return state;
  }
  if (action.type === 'end') {
    const alive = ([0, 1] as Player[]).map(player => state.systems.some(s => s.homeworld === player && s.stars.length > 0 && s.ships.some(ship => ship.owner === player)));
    state.outcome = alive[0] && alive[1] ? 'playing' : !alive[0] && !alive[1] ? 'draw' : alive[0] ? 0 : 1;
    if (state.outcome === 'playing') {
      state.player = state.player === 0 ? 1 : 0;
      state.turn++;
      state.allowance = { color: null, remaining: 1, sacrificed: false };
    }
    return state;
  }
  const system = state.systems.find(s => s.id === action.system);
  requireRule(system, 'Unknown star system.');
  if (action.type === 'catastrophe') {
    const count = [...system.stars, ...system.ships].filter(p => p.color === action.color).length;
    requireRule(count >= 4, 'A catastrophe requires at least four pieces of one color.');
    state.bank.push(...system.stars.filter(p => p.color === action.color));
    system.stars = system.stars.filter(p => p.color !== action.color);
    const destroyed = system.ships.filter(p => system.stars.length === 0 || p.color === action.color);
    state.bank.push(...destroyed.map(({color, size}) => ({color, size})));
    system.ships = system.ships.filter(p => !destroyed.includes(p));
    clean(state);
    return state;
  }
  const own = system.ships.filter(s => s.owner === state.player);
  requireRule(own.length > 0 && system.stars.length > 0, 'You need a ship in a surviving system.');
  const ship = 'ship' in action ? system.ships[action.ship] : undefined;
  if ('ship' in action) requireRule(ship, 'Unknown ship.');
  if (action.type === 'sacrifice') {
    requireRule(!state.allowance.sacrificed && state.allowance.remaining === 1, 'Sacrifice instead of your basic action, once per turn.');
    requireRule(ship!.owner === state.player, 'You can only sacrifice your own ships.');
    system.ships.splice(action.ship, 1);
    state.bank.push({color: ship!.color, size: ship!.size});
    state.allowance = {color: ship!.color, remaining: ship!.size, sacrificed: true};
    clean(state);
    return state;
  }
  const color = power[action.type];
  requireRule(state.allowance.remaining > 0, 'No actions remain. End your turn or invoke a catastrophe.');
  if (state.allowance.sacrificed) requireRule(state.allowance.color === color, 'Use the color of your sacrificed ship.');
  else requireRule([...system.stars, ...own].some(p => p.color === color), `You need access to ${color} in this system.`);
  if (action.type === 'build') {
    requireRule(own.some(p => p.color === action.color), 'Build a color you already control in this system.');
    const available = state.bank.filter(p => p.color === action.color).sort((a, b) => a.size - b.size);
    requireRule(available.length > 0, 'No pieces of that color remain.');
    system.ships.push({...take(state.bank, available[0]), owner: state.player});
  } else if (action.type === 'capture') {
    requireRule(ship!.owner !== state.player, 'Choose an enemy ship.');
    requireRule(own.some(p => p.size >= ship!.size), 'Your fleet needs a ship at least as large as the target.');
    ship!.owner = state.player;
  } else {
    requireRule(ship!.owner === state.player, 'Choose one of your ships.');
    if (action.type === 'trade') {
      requireRule(action.color !== ship!.color, 'Trade for a different color.');
      take(state.bank, {color: action.color, size: ship!.size});
      state.bank.push({color: ship!.color, size: ship!.size});
      ship!.color = action.color;
    } else {
      let destination: StarSystem;
      if (action.type === 'move') {
        const found = state.systems.find(s => s.id === action.destination);
        requireRule(found, 'Unknown destination.');
        destination = found;
      } else {
        destination = {id: `system-${state.nextSystem}`, name: `Frontier ${state.nextSystem}`, stars: [{...action.star}], ships: []};
      }
      requireRule(areConnected(system, destination), 'Stars must have no sizes in common to connect.');
      if (action.type === 'discover') {
        take(state.bank, action.star);
        state.nextSystem++;
        state.systems.push(destination);
      }
      system.ships.splice(action.ship, 1);
      destination.ships.push(ship!);
    }
  }
  state.allowance.remaining--;
  clean(state);
  return state;
}

export interface Choice { action: Exclude<Action, {type: 'end' | 'resign' | 'draw'}>; label: string }
const sizeNames = ['', 'small', 'medium', 'large'];
export function legalChoices(state: GameState, systemId: string): Choice[] {
  const system = state.systems.find(s => s.id === systemId);
  if (!system || state.outcome !== 'playing') return [];
  const candidates: Choice[] = [];
  for (const color of colors) {
    candidates.push({action: {type: 'build', system: systemId, color}, label: `Build ${color} (smallest available)`});
    candidates.push({action: {type: 'catastrophe', system: systemId, color}, label: `Catastrophe: ${color}`});
  }
  system.ships.forEach((ship, index) => {
    const name = `${sizeNames[ship.size]} ${ship.color} ship #${index + 1}`;
    candidates.push({action: {type: 'sacrifice', system: systemId, ship: index}, label: `Sacrifice ${name} for ${ship.size} ${ship.color} action(s)`});
    candidates.push({action: {type: 'capture', system: systemId, ship: index}, label: `Capture ${name}`});
    for (const color of colors) {
      candidates.push({action: {type: 'trade', system: systemId, ship: index, color}, label: `Trade ${name} for ${color}`});
      for (const size of sizes) candidates.push({action: {type: 'discover', system: systemId, ship: index, star: {color, size}}, label: `Discover ${sizeNames[size]} ${color} star with ${name}`});
    }
    for (const destination of state.systems) candidates.push({action: {type: 'move', system: systemId, ship: index, destination: destination.id}, label: `Move ${name} to ${destination.name}`});
  });
  return candidates.filter(({action}) => { try {applyAction(state, action); return true;} catch {return false;} });
}

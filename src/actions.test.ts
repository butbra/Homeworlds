import {describe, expect, it} from 'vitest';
import {applyAction, colors, createInitialState, legalChoices, sizes, type Action, type GameState, type Piece, type Ship, type StarSystem} from './game';
const ship = (color: Piece['color'], size: Piece['size'], owner: 0|1 = 0): Ship => ({color,size,owner});
const star = (color: Piece['color'], size: Piece['size']): Piece => ({color,size});
function position(systems: StarSystem[]): GameState {
  const state = createInitialState();
  state.systems = systems;
  state.bank = colors.flatMap(color => sizes.flatMap(size => Array.from({length:3}, () => ({color,size}))));
  for (const s of systems) for (const p of [...s.stars, ...s.ships]) {
    const index = state.bank.findIndex(b => b.color === p.color && b.size === p.size);
    if (index < 0) throw Error('Invalid fixture inventory');
    state.bank.splice(index,1);
  }
  return state;
}
function system(stars: Piece[], ships: Ship[], id = 'a', homeworld?: 0|1): StarSystem {return {id,name:id,stars,ships,homeworld};}
function conserved(state: GameState): void {
  const pieces = [...state.bank,...state.systems.flatMap(s => [...s.stars,...s.ships])];
  expect(pieces).toHaveLength(36);
  for(const color of colors) for(const size of sizes) expect(pieces.filter(p => p.color === color && p.size === size)).toHaveLength(3);
}
const build: Action = {type:'build',system:'north',color:'green'};
describe('basic actions', () => {
  it('builds the smallest available ship and spends the action', () => {
    const before = createInitialState(), after = applyAction(before,build);
    expect(after.systems[0].ships[1]).toEqual(ship('green',1));
    expect(after.allowance.remaining).toBe(0);
    expect(() => applyAction(after,build)).toThrow('No actions');
    expect(before.systems[0].ships).toHaveLength(1);
    conserved(after);
  });
  it('rejects building a color without a local ship of that color', () => {
    expect(() => applyAction(createInitialState(),{type:'build',system:'north',color:'red'})).toThrow('already control');
  });
  it('trades exact size and returns the old piece', () => {
    const after = applyAction(createInitialState(),{type:'trade',system:'north',ship:0,color:'yellow'});
    expect(after.systems[0].ships[0]).toEqual(ship('yellow',3));
    conserved(after);
  });
  it('rejects a trade for the same color or an unavailable size', () => {
    const state = createInitialState();
    expect(() => applyAction(state,{type:'trade',system:'north',ship:0,color:'green'})).toThrow('different color');
    state.bank = state.bank.filter(p => p.color !== 'yellow' || p.size !== 3);
    expect(() => applyAction(state,{type:'trade',system:'north',ship:0,color:'yellow'})).toThrow('unavailable');
  });
  it('cannot borrow powers from enemy ships', () => {
    const state = position([system([star('blue',1)],[ship('green',2),ship('yellow',1,1)])]);
    expect(() => applyAction(state,{type:'discover',system:'a',ship:0,star:star('red',2)})).toThrow('access to yellow');
  });
  it('discovers a connected system with a bank star and cleans the abandoned basic star', () => {
    const state = position([system([star('yellow',1)],[ship('green',2)])]);
    const after = applyAction(state,{type:'discover',system:'a',ship:0,star:star('red',2)});
    expect(after.systems).toHaveLength(1);
    expect(after.systems[0].id).toBe('system-1');
    expect(after.systems[0].ships).toEqual([ship('green',2)]);
    expect(after.nextSystem).toBe(2);
    conserved(after);
  });
  it('rejects overlapping star sizes and leaves the input untouched', () => {
    const state = position([system([star('yellow',1)],[ship('green',2)])]);
    const copy = structuredClone(state);
    expect(() => applyAction(state,{type:'discover',system:'a',ship:0,star:star('red',1)})).toThrow('no sizes in common');
    expect(state).toEqual(copy);
  });
  it('moves to an existing system, retaining temporarily abandoned homeworlds', () => {
    const state = position([system([star('yellow',1)],[ship('green',2)],'a',0),system([star('red',2)],[ship('blue',1,1)],'b')]);
    const after = applyAction(state,{type:'move',system:'a',ship:0,destination:'b'});
    expect(after.systems[0].ships).toHaveLength(0);
    expect(after.systems[1].ships).toHaveLength(2);
    conserved(after);
  });
  it('captures with local red access using the largest owned ship', () => {
    const state = position([system([star('blue',1)],[ship('red',1),ship('green',3),ship('yellow',2,1)])]);
    const after = applyAction(state,{type:'capture',system:'a',ship:2});
    expect(after.systems[0].ships[2].owner).toBe(0);
    conserved(after);
  });
  it('rejects capturing a larger ship or one you already own', () => {
    const state = position([system([star('red',1)],[ship('green',1),ship('yellow',3,1)])]);
    expect(() => applyAction(state,{type:'capture',system:'a',ship:1})).toThrow('at least as large');
    expect(() => applyAction(state,{type:'capture',system:'a',ship:0})).toThrow('enemy ship');
  });
});
describe('sacrifice turns', () => {
  it('provides size actions of one color with global access, but requires local ships', () => {
    const state = position([system([star('red',1)],[ship('green',3),ship('blue',1)],'a',0),system([star('blue',2)],[ship('red',2)],'b')]);
    let next = applyAction(state,{type:'sacrifice',system:'a',ship:0});
    expect(next.allowance).toEqual({color:'green',remaining:3,sacrificed:true});
    next = applyAction(next,{type:'build',system:'b',color:'red'});
    expect(next.systems[1].ships[1]).toEqual(ship('red',1));
    expect(next.allowance.remaining).toBe(2);
    expect(() => applyAction(next,{type:'trade',system:'a',ship:0,color:'yellow'})).toThrow('sacrificed ship');
    expect(() => applyAction(next,{type:'sacrifice',system:'a',ship:0})).toThrow('once per turn');
    conserved(next);
  });
  it('cannot sacrifice after a basic action', () => {
    const next = applyAction(createInitialState(),build);
    expect(() => applyAction(next,{type:'sacrifice',system:'north',ship:0})).toThrow('instead of');
  });
  it('cannot use an empty system after sacrificing its only ship', () => {
    const state = position([system([star('red',1)],[ship('green',3)],'a',0)]);
    const next = applyAction(state,{type:'sacrifice',system:'a',ship:0});
    expect(() => applyAction(next,{type:'build',system:'a',color:'green'})).toThrow('need a ship');
  });
});
describe('catastrophes', () => {
  it('counts stars and both fleets, leaves half a binary homeworld intact, and spends no action', () => {
    const state = position([system([star('red',1),star('blue',2)],[ship('red',1),ship('red',2),ship('red',3,1),ship('green',3)],'a',0)]);
    const next = applyAction(state,{type:'catastrophe',system:'a',color:'red'});
    expect(next.systems[0].stars).toEqual([star('blue',2)]);
    expect(next.systems[0].ships).toEqual([ship('green',3)]);
    expect(next.allowance.remaining).toBe(1);
    conserved(next);
  });
  it('destroys every ship when the last star explodes and cleans up the basic system', () => {
    const state = position([system([star('red',1)],[ship('red',1),ship('red',2),ship('red',3,1),ship('green',3)])]);
    const next = applyAction(state,{type:'catastrophe',system:'a',color:'red'});
    expect(next.systems).toHaveLength(0);
    expect(next.bank).toHaveLength(36);
    conserved(next);
  });
  it('can be invoked remotely after spending the basic action', () => {
    const state = position([system([star('blue',1)],[ship('red',1,1),ship('red',1,1),ship('red',2,1),ship('red',3,1)],'a')]);
    state.allowance.remaining = 0;
    const next = applyAction(state,{type:'catastrophe',system:'a',color:'red'});
    expect(next.systems).toHaveLength(0);
    conserved(next);
  });
  it('requires four pieces of a color', () => {
    expect(() => applyAction(createInitialState(),{type:'catastrophe',system:'north',color:'green'})).toThrow('at least four');
  });
});
describe('turn confirmation and outcomes', () => {
  it('allows passing and resets the next player allowance', () => {
    const next = applyAction(createInitialState(),{type:'end'});
    expect(next.player).toBe(1);
    expect(next.turn).toBe(2);
    expect(next.allowance).toEqual({color:null,remaining:1,sacrificed:false});
  });
  it('checks abandonment at turn end, declaring the surviving player winner', () => {
    const state = createInitialState();
    const next = applyAction(state,{type:'sacrifice',system:'north',ship:0});
    expect(next.outcome).toBe('playing');
    const ended = applyAction(next,{type:'end'});
    expect(ended.outcome).toBe(1);
    expect(() => applyAction(ended,{type:'end'})).toThrow('game is over');
  });
  it('declares a draw when both homeworlds are empty or destroyed', () => {
    const state = position([system([],[],'north',0),system([star('red',1)],[],'south',1)]);
    expect(applyAction(state,{type:'end'}).outcome).toBe('draw');
  });
});
describe('legal orders', () => {
  it('offers only actions that execute and conserve inventory throughout representative play', () => {
    let state = createInitialState();
    for (let turn = 0; turn < 12 && state.outcome === 'playing'; turn++) {
      const choices = state.systems.flatMap(s => legalChoices(state,s.id));
      for (const choice of choices) conserved(applyAction(state,choice.action));
      const choice = choices.find(c => c.action.type === (turn % 3 === 0 ? 'trade' : 'build')) ?? choices[0];
      if (choice) state = applyAction(state,choice.action);
      state = applyAction(state,{type:'end'});
      conserved(state);
    }
  });
});

describe('endgame timing', () => {
  it('allows a yellow sacrifice to abandon and then repopulate a homeworld before turn end', () => {
    const state = position([
      system([star('blue',1)],[ship('yellow',2)],'a',0),
      system([star('red',2)],[ship('green',3)],'b'),
      system([star('yellow',3)],[ship('blue',2,1)],'c',1),
    ]);
    let next = applyAction(state,{type:'sacrifice',system:'a',ship:0});
    expect(next.systems[0].ships).toHaveLength(0);
    next = applyAction(next,{type:'move',system:'b',ship:0,destination:'a'});
    const ended = applyAction(next,{type:'end'});
    expect(ended.outcome).toBe('playing');
    expect(ended.player).toBe(1);
    conserved(ended);
  });
  it('wins by capturing the final enemy homeworld ship at turn confirmation', () => {
    const state = position([
      system([star('blue',1)],[ship('green',3)],'a',0),
      system([star('red',2)],[ship('green',2),ship('yellow',1,1)],'b',1),
    ]);
    const captured = applyAction(state,{type:'capture',system:'b',ship:1});
    expect(captured.outcome).toBe('playing');
    expect(applyAction(captured,{type:'end'}).outcome).toBe(0);
    conserved(captured);
  });
});

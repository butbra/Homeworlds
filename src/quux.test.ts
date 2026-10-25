import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {QuuxRuntime} from './quux-runtime';
import {decodeQuuxSetup,quuxActions,quuxPosition,quuxSetupPosition} from './quux';
import {applyAction,createInitialState,type GameState} from './game';
import {placeSetupPiece,setupBank,type Setup} from './setup';
import fixtures from './fixtures/quux-native.json';

describe('original Quux engine in WebAssembly',()=>{
 it('matches native Quux and returns legal full turns on 17 recorded positions',async()=>{
  const engine=await QuuxRuntime.create(readFileSync(new URL('../vendor/quux/quux.wasm',import.meta.url)));
  for(const fixture of fixtures){
   expect(engine.call('move',fixture.position,fixture.player)).toBe(fixture.move);
   const state=fixture.state as GameState;
   expect(quuxPosition(state).text).toBe(fixture.position);
   const actions=quuxActions(state,fixture.move);
   expect(actions.at(-1)?.type).toBe('end');
   const after=actions.reduce(applyAction,state);
   expect(after.outcome).toBe(fixture.outcome);
   expect(after.bank.length+after.systems.reduce((n,s)=>n+s.stars.length+s.ships.length,0)).toBe(36);
  }
 },30000);
 it('chooses legal native homeworlds both before and after human setup',async()=>{
  const engine=await QuuxRuntime.create(readFileSync(new URL('../vendor/quux/quux.wasm',import.meta.url)));
  for(const starter of [0,1]as const)for(let seed=1;seed<=30;seed++){
   let draft:Setup=starter===1?[[],[{color:'red',size:1},{color:'blue',size:3},{color:'green',size:3}]]:[[],[]];
   const text=engine.call('setup',quuxSetupPosition(draft),0,seed);
   for(const p of decodeQuuxSetup(text))draft=placeSetupPiece({pieces:draft,player:0,starter},p).pieces;
   expect(draft[0]).toHaveLength(3);expect(draft[0][2].size).toBe(3);
   expect(setupBank(draft)).toHaveLength(starter===1?30:33);
  }
 });
 it('rejects invalid or partial native turns without changing the supplied state',()=>{
  const state=createInitialState(),before=structuredClone(state);
  for(const move of ['','build g3 at N0','build g1 at N0; build g1 at N0','move g3 from N0 to Unknown','convert g3 to b1 at N0'])expect(()=>quuxActions(state,move)).toThrow();
  expect(state).toEqual(before);
 });
});

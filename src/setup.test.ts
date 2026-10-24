import {describe,it,expect} from 'vitest';
import {setupBank,placeStartingPiece,decodeSetup,openingFromSetup,type Setup} from './setup';
describe('rulebook setup round',()=>{
 it('starts with 36 bank pieces and no preselected homeworlds',()=>{expect(setupBank([[],[]])).toHaveLength(36);});
 it('requires two stars, then a large ship, before the second player chooses',()=>{
  let s:Setup=[[],[]];s=placeStartingPiece(s,{color:'red',size:1});s=placeStartingPiece(s,{color:'blue',size:3});
  expect(()=>placeStartingPiece(s,{color:'green',size:1})).toThrow('large');
  s=placeStartingPiece(s,{color:'green',size:3});s=placeStartingPiece(s,{color:'blue',size:2});
  expect(s[0]).toHaveLength(3);expect(s[1]).toHaveLength(1);expect(setupBank(s)).toHaveLength(32);
  expect(decodeSetup(JSON.stringify(s))).toEqual(s);
 });
 it('enforces shared supply and permits same-size, same-color stars',()=>{
  let s:Setup=[[],[]];for(let i=0;i<3;i++)s=placeStartingPiece(s,{color:'red',size:3});
  expect(()=>placeStartingPiece(s,{color:'red',size:3})).toThrow('unavailable');
 });
 it('rejects malformed, out-of-order, incomplete, and invalid saved selections',()=>{
  for(const value of [null,[[],[{color:'red',size:1}]],[[{color:'purple',size:2}],[]],[[{color:'red',size:9}],[]]])expect(()=>decodeSetup(JSON.stringify(value))).toThrow();
  expect(()=>openingFromSetup([[],[]])).toThrow('Complete');
 });
});

import {placeSetupPiece,confirmSetup,undoSetup,decodeSetupProgress,type SetupProgress} from './setup';
describe('setup confirmation',()=>{
 const ready:SetupProgress={pieces:[[{color:'red',size:1},{color:'blue',size:3},{color:'green',size:3}],[]],player:0};
 it('does not begin the second player until the first explicitly confirms',()=>{
  expect(()=>placeSetupPiece(ready,{color:'yellow',size:1})).toThrow('End turn');
  const second=confirmSetup(ready)!;expect(second.player).toBe(1);
  expect(()=>undoSetup(second)).toThrow('confirmed');
  expect(()=>confirmSetup(second)).toThrow('Choose two stars');
 });
 it('allows revision during review and persists pending confirmations',()=>{
  const revised=undoSetup(ready);expect(revised.pieces[0]).toHaveLength(2);
  expect(revised.player).toBe(0);expect(ready.pieces[0]).toHaveLength(3);
  expect(decodeSetupProgress(JSON.stringify(ready))).toEqual(ready);
  let second=confirmSetup(ready)!;
  for(const p of [{color:'red',size:2},{color:'blue',size:1},{color:'green',size:3}] as const)second=placeSetupPiece(second,p);
  expect(decodeSetupProgress(JSON.stringify(second))).toEqual(second);
  expect(confirmSetup(second)).toBeNull();
 });
 it('migrates old partial setup without silently confirming a ready first player',()=>{
  expect(decodeSetupProgress(JSON.stringify(ready.pieces)).player).toBe(0);
  expect(()=>decodeSetupProgress(JSON.stringify({pieces:[[],[]],player:1}))).toThrow('confirmation');
 });
});

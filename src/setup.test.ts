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

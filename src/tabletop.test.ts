import {describe,it,expect} from 'vitest';
import {createInitialState,applyAction} from './game';
import {bankAction,legal} from './tabletop';
describe('physical bank choices',()=>{
 it('builds the clicked piece only if it is the smallest available size',()=>{
  const state=createInitialState();
  const action=bankAction(state,'north',{color:'green',size:1},null,'build');
  expect(legal(state,action)).toBe(true);
  expect(applyAction(state,action).systems[0].ships[1]).toMatchObject({color:'green',size:1});
  expect(()=>bankAction(state,'north',{color:'green',size:3},null,'build')).toThrow('smallest');
 });
 it('trades only matching physical size and does not borrow enemy powers',()=>{
  const state=createInitialState();
  expect(()=>bankAction(state,'north',{color:'yellow',size:1},{system:'north',ship:0},'trade')).toThrow('same size');
  expect(legal(state,bankAction(state,'north',{color:'yellow',size:3},{system:'north',ship:0},'trade'))).toBe(true);
  expect(legal(state,bankAction(state,'south',{color:'green',size:1},null,'build'))).toBe(false);
 });
 it('validates bank discovery before the player places it in space',()=>{
  const state=createInitialState();state.systems[0].ships[0].color='yellow';
  expect(legal(state,bankAction(state,'north',{color:'red',size:2},{system:'north',ship:0},'discover'))).toBe(true);
  expect(legal(state,bankAction(state,'north',{color:'red',size:1},{system:'north',ship:0},'discover'))).toBe(false);
 });
});

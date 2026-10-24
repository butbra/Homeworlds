import {describe,it,expect} from 'vitest';
import {applyAction,createInitialState} from './game';
import {resultDescription} from './outcome';
import {replay} from './session';
describe('announced game outcomes',()=>{
 it('announces capture of all enemy homeworld ships and locks play',()=>{
  const state=createInitialState();state.systems[1].ships[0].owner=0;
  const ended=applyAction(state,{type:'end'});expect(ended.outcome).toBe(0);expect(resultDescription(ended)).toContain('captured');
  expect(()=>applyAction(ended,{type:'build',system:'north',color:'green'})).toThrow('game is over');
 });
 it('announces a fleet-catastrophe win',()=>{
  let state=replay({version:1,opening:[{stars:[{color:'red',size:1},{color:'blue',size:2}],shipColor:'green'},{stars:[{color:'green',size:1},{color:'blue',size:3}],shipColor:'green'}],actions:[{type:'end'},{type:'build',system:'south',color:'green'},{type:'end'},{type:'end'},{type:'build',system:'south',color:'green'},{type:'end'}]});
  state=applyAction(state,{type:'catastrophe',system:'south',color:'green'});state=applyAction(state,{type:'end'});
  expect(state.outcome).toBe(0);expect(resultDescription(state)).toContain('destroyed');
 });
 it('announces loss of both homeworld stars',()=>{
  let state=createInitialState([{stars:[{color:'blue',size:1},{color:'yellow',size:2}],shipColor:'green'},{stars:[{color:'red',size:1},{color:'red',size:2}],shipColor:'red'}]);
  const i=state.bank.findIndex(p=>p.color==='red'&&p.size===1);state.systems[1].ships.push({...state.bank.splice(i,1)[0],owner:0});
  state=applyAction(state,{type:'catastrophe',system:'south',color:'red'});state=applyAction(state,{type:'end'});
  expect(state.outcome).toBe(0);expect(resultDescription(state)).toContain('lost both homeworld stars');
 });
 it('announces abandonment, simultaneous loss, agreed draw and resignation',()=>{
  let state=applyAction(createInitialState(),{type:'sacrifice',system:'north',ship:0});
  expect(resultDescription(applyAction(state,{type:'end'}))).toContain('Player 2 wins');
  state.systems[1].ships[0].owner=0;state=applyAction(state,{type:'end'});
  expect(state.outcome).toBe('draw');expect(resultDescription(state)).toContain('both homeworlds');
  expect(resultDescription(applyAction(createInitialState(),{type:'draw'}))).toContain('agreed');
  expect(resultDescription(applyAction(createInitialState(),{type:'resign'}))).toContain('Player 1 resigned');
 });
});

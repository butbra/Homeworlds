import {describe,expect,it} from 'vitest';
import {applyAction,createInitialState,suggestedOpening,type Opening} from './game';
import {decodeSession,newSession,replay} from './session';
describe('custom opening',()=>{
 it('supports chosen star sizes and ship colors including same-size binary stars',()=>{
  const opening: Opening[] = [
   {stars:[{color:'red',size:2},{color:'blue',size:2}],shipColor:'yellow'},
   {stars:[{color:'green',size:1},{color:'yellow',size:3}],shipColor:'red'},
  ];
  const state=createInitialState(opening);
  expect(state.systems[0].stars.map(p=>p.size)).toEqual([2,2]);
  expect(state.systems[0].ships[0].color).toBe('yellow');
  expect(state.bank).toHaveLength(30);
 });
 it('rejects opening allocations exceeding the shared bank',()=>{
  const opening: Opening[] = [0,1].map(()=>({stars:[{color:'red',size:3},{color:'red',size:3}],shipColor:'red'}));
  expect(()=>createInitialState(opening)).toThrow('unavailable');
 });
 it('does not mutate the suggested opening',()=>{
  const state=createInitialState();state.systems[0].stars[0].color='green';
  expect(suggestedOpening[0].stars[0].color).toBe('blue');
 });
});
describe('save files',()=>{
 it('round trips a multi-turn game with exact state',()=>{
  const session=newSession();
  session.actions=[{type:'build',system:'north',color:'green'},{type:'end'},{type:'trade',system:'south',ship:0,color:'yellow'}];
  const restored=decodeSession(JSON.stringify(session));
  expect(restored).toEqual(session);
  expect(replay(restored)).toEqual(replay(session));
  expect(replay(restored).player).toBe(1);
 });
 it('rejects malformed files and unsupported versions',()=>{
  for(const text of ['null','{}','not json',JSON.stringify({version:2,opening:suggestedOpening,actions:[]}),JSON.stringify({version:1,actions:[]})]) expect(()=>decodeSession(text)).toThrow();
 });
 it('rejects malformed actions and impossible action histories',()=>{
  for(const action of [{type:'cheat'},{type:'trade',system:'north',ship:-1,color:'red'},{type:'build',system:'north',color:'purple'},{type:'discover',system:'north',ship:0,star:{color:'red',size:9}},{type:'move',system:'north',ship:0,destination:3}]) expect(()=>decodeSession(JSON.stringify({...newSession(),actions:[action]}))).toThrow();
  expect(()=>decodeSession(JSON.stringify({...newSession(),actions:[{type:'build',system:'north',color:'red'}]}))).toThrow();
 });
 it('rejects oversized saves',()=>{
  expect(()=>decodeSession(' '.repeat(2_000_001))).toThrow('too large');
 });
 it('replays a completed game and rejects moves after game over',()=>{
  const session=newSession();session.actions=[{type:'resign'}];
  expect(replay(decodeSession(JSON.stringify(session))).outcome).toBe(1);
  session.actions.push({type:'end'});
  expect(()=>decodeSession(JSON.stringify(session))).toThrow('game is over');
 });
});
describe('agreed outcomes',()=>{
 it('resignation awards the opposing player a win',()=>{
  const state=applyAction(createInitialState(),{type:'end'});
  expect(applyAction(state,{type:'resign'}).outcome).toBe(0);
 });
 it('records a mutually agreed draw',()=>{
  expect(applyAction(createInitialState(),{type:'draw'}).outcome).toBe('draw');
 });
});

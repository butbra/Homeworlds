import {describe,it,expect} from 'vitest';
import {lastOpponentMove} from './last-move';
import {newSession} from './session';

describe('last opponent move',()=>{
 it('highlights the exact built ship only after the turn has ended',()=>{
  const session=newSession();
  session.actions.push({type:'build',system:'north',color:'green'});
  expect(lastOpponentMove(session,1)).toBeNull();
  session.actions.push({type:'end'});
  expect(lastOpponentMove(session,1)).toMatchObject({system:'north',ship:1});
  session.actions.push({type:'build',system:'south',color:'green'});
  expect(lastOpponentMove(session,1)).toMatchObject({system:'north',ship:1});
  session.actions.push({type:'end'});
  expect(lastOpponentMove(session,0)).toMatchObject({system:'south',ship:1});
 });
 it('tracks a discovery and a subsequently moved ship',()=>{
  const session=newSession([{stars:[{color:'yellow',size:1},{color:'blue',size:3}],shipColor:'green'},{stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'}]);
  session.actions.push({type:'build',system:'north',color:'green'},{type:'end'},{type:'end'},{type:'discover',system:'north',ship:1,star:{color:'red',size:2}},{type:'end'});
  expect(lastOpponentMove(session,1)).toMatchObject({system:'system-1',ship:0});
 });
 it('falls back to the system when the last action sacrificed a ship',()=>{
  const session=newSession();
  session.actions.push({type:'build',system:'north',color:'green'},{type:'end'},{type:'end'},{type:'sacrifice',system:'north',ship:1},{type:'end'});
  expect(lastOpponentMove(session,1)).toMatchObject({system:'north',ship:null});
 });
});

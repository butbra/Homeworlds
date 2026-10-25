import {describe,it,expect,vi} from 'vitest';
import {randomStarter} from './match';
import {newSession,decodeSession,replay} from './session';
import {createInitialState} from './game';
import {confirmSetup,decodeSetupProgress,placeSetupPiece,type SetupProgress} from './setup';
describe('random starting player and match modes',()=>{
 it('selects either player from an unbiased random bit',()=>{
  const random=vi.spyOn(crypto,'getRandomValues');
  for(const byte of [0,1,2,3,254,255]){
   random.mockImplementation(array=>{(array as Uint8Array)[0]=byte;return array;});
   expect(randomStarter()).toBe(byte%2);
  }
  random.mockRestore();
 });
 it('persists South-first gameplay and Quux mode without rerolling on replay',()=>{
  const session=newSession(undefined,{starter:1,mode:'quux'});
  expect(decodeSession(JSON.stringify(session))).toEqual(session);
  expect(replay(session).player).toBe(1);
  session.actions=[{type:'build',system:'south',color:'green'},{type:'end'}];
  expect(replay(decodeSession(JSON.stringify(session))).player).toBe(0);
 });
 it('keeps old saves local and North-first and rejects invalid metadata',()=>{
  const legacy={version:1,opening:newSession().opening,actions:[]};
  expect(decodeSession(JSON.stringify(legacy))).toMatchObject({starter:0,mode:'local'});
  for(const metadata of [{starter:2},{mode:'online'},{starter:'1'}])expect(()=>decodeSession(JSON.stringify({...legacy,...metadata}))).toThrow();
 });
 it('requires the randomly selected South player to confirm setup before North',()=>{
  let progress:SetupProgress={pieces:[[],[]],player:1,starter:1,mode:'local'};
  for(const piece of [{color:'red',size:2},{color:'blue',size:1},{color:'green',size:3}]as const)progress=placeSetupPiece(progress,piece);
  expect(decodeSetupProgress(JSON.stringify(progress))).toEqual(progress);
  expect(progress.pieces[0]).toHaveLength(0);
  progress=confirmSetup(progress)!;expect(progress.player).toBe(0);
  for(const piece of [{color:'red',size:1},{color:'blue',size:3},{color:'yellow',size:3}]as const)progress=placeSetupPiece(progress,piece);
  expect(confirmSetup(progress)).toBeNull();
  expect(decodeSetupProgress(JSON.stringify(progress))).toEqual(progress);
 });
 it('rejects a bot save containing a half-recorded bot turn',()=>{
  const session=newSession(undefined,{starter:1,mode:'quux'});
  session.actions=[{type:'build',system:'south',color:'green'}];
  expect(()=>decodeSession(JSON.stringify(session))).toThrow('turn boundary');
 });
 it('rejects invalid starting players in the rules engine',()=>{
  expect(()=>createInitialState(undefined,3 as 0)).toThrow('starting player');
 });
});

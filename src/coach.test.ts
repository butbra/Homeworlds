import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {QuuxRuntime} from './quux-runtime';
import {quuxActions} from './quux';
import {applyAction,createInitialState,type Action,type GameState} from './game';
import {coachRequest,decodeAnalysis,bestTurn,describeTurn,describeReply,explainTurn,moveRating,type PositionReview} from './coach';
import {newSession,decodeSession} from './session';
import {decodeSetupProgress} from './setup';
import fixtures from './fixtures/quux-native.json';

const engine=()=>QuuxRuntime.create(readFileSync(new URL('../vendor/quux/quux.wasm',import.meta.url)));
const safe:PositionReview={score:50,outcome:-1,losesNext:false,winningReply:''};

describe('Quux practice analysis',()=>{
 it('preserves all 17 native decisions and rates their independently replayed boards',async()=>{
  const runtime=await engine();
  for(const fixture of fixtures) {
   const start=fixture.state as GameState;
   const actions=quuxActions(start,fixture.move),staged=actions.slice(0,-1).reduce(applyAction,start);
   const before=structuredClone(start);
   const analysis=decodeAnalysis(runtime.call('coach',coachRequest(start,staged),start.player));
   expect(analysis.bestMove).toBe(fixture.move);
   expect(bestTurn(start,analysis).reduce(applyAction,start).outcome).toBe(fixture.outcome);
   expect(analysis.candidate).toEqual(analysis.best);
   if(!analysis.best.losesNext)expect(moveRating(analysis.best,analysis.candidate!,start.player)).toBe(10);
   expect(start).toEqual(before);
  }
 },30000);
 it('evaluates an unfinished sacrifice as ending now, including homeworld loss',async()=>{
  const runtime=await engine(),start=createInitialState(undefined,1);
  const action:Action={type:'sacrifice',system:'south',ship:0};
  const staged=applyAction(start,action);
  expect(staged.outcome).toBe('playing');expect(staged.allowance.remaining).toBe(3);
  const analysis=decodeAnalysis(runtime.call('coach',coachRequest(start,staged),1));
  expect(analysis.candidate?.outcome).toBe(0);
  expect(moveRating(analysis.best,analysis.candidate!,1)).toBe(1);
  expect(explainTurn(start,[action,{type:'end'}],analysis.candidate!)[0]).toContain('loses the game');
  expect(staged.outcome).toBe('playing');
 });
 it('accepts legal interleaved catastrophes and does not start a new turn on the partial board',async()=>{
  const runtime=await engine(),start=fixtures[6].state as GameState;
  const native=quuxActions(start,fixtures[6].move);
  const catastrophe=native.find(a=>a.type==='catastrophe')!;
  const reordered=[native[0],catastrophe,...native.slice(1).filter(a=>a.type!=='catastrophe'&&a.type!=='end')];
  const staged=reordered.reduce(applyAction,start);
  const analysis=decodeAnalysis(runtime.call('coach',coachRequest(start,staged),start.player));
  expect(analysis.candidate).not.toBeNull();
  expect(analysis.bestMove).toBe(fixtures[6].move);
  expect(describeTurn(start,[...reordered,{type:'end'}]).some(s=>s.includes('catastrophe'))).toBe(true);
 });
 it('finds an actual winning reply and translates its steps on the reviewed position',async()=>{
  const runtime=await engine(),start=fixtures[16].state as GameState;
  // Exchange turns so the other side has the recorded immediate winning reply.
  const original={...start,player:1 as const};
  const analysis=decodeAnalysis(runtime.call('coach',coachRequest(original,original),1));
  expect(analysis.candidate?.losesNext).toBe(true);
  const projected=applyAction(original,{type:'end'});
  const reply=quuxActions(projected,analysis.candidate!.winningReply);
  expect(reply.reduce(applyAction,projected).outcome).toBe(0);
  expect(describeReply(projected,analysis.candidate!)).toEqual(describeTurn(projected,reply));
  expect(moveRating(analysis.best,analysis.candidate!,1)).toBe(2);
 });
 it('gives tactical outcomes priority and distinguishes progressively worse quiet turns',()=>{
  for(const player of [0,1]as const) {
   expect(moveRating(safe,{...safe,outcome:player,score:-9999},player)).toBe(10);
   expect(moveRating(safe,{...safe,outcome:(1-player)as 0|1,score:9999},player)).toBe(1);
   expect(moveRating(safe,{...safe,losesNext:true,score:100},player)).toBe(2);
   expect(moveRating({...safe,outcome:player},safe,player)).toBeLessThanOrEqual(5);
   expect(moveRating(safe,safe,player)).toBe(10);
   expect(moveRating(safe,{...safe,score:45},player)).toBeGreaterThan(moveRating(safe,{...safe,score:-40},player));
   expect(moveRating(safe,{...safe,outcome:2},player)).toBe(5);
  }
 });
 it('retains practice mode and South ownership in saves and partial setups',()=>{
  const session=newSession(undefined,{mode:'practice',starter:1});
  session.actions=[{type:'build',system:'south',color:'green'}];
  expect(decodeSession(JSON.stringify(session))).toEqual(session);
  const draft={pieces:[[],[]],player:1,starter:1,mode:'practice',humanPlayer:1,difficulty:3};
  expect(decodeSetupProgress(JSON.stringify(draft))).toEqual(draft);
  const invalid={...session,starter:0,actions:[{type:'build',system:'north',color:'green'}]};
  expect(()=>decodeSession(JSON.stringify(invalid))).toThrow('turn boundary');
 });
 it('uses native full strength at level 10 and varied legal weaker choices at lower levels',async()=>{
  const runtime=await engine();
  const fixture=fixtures[0],start=fixture.state as GameState,choices=new Set<string>();
  for(const level of [1,3,6,9,10])for(let seed=1;seed<=12;seed++) {
   const move=runtime.call('move',fixture.position,fixture.player,seed,level);
   expect(()=>quuxActions(start,move).reduce(applyAction,start)).not.toThrow();
   if(level===10)expect(move).toBe(fixture.move);
   if(level===1)choices.add(move);
  }
  expect(choices.size).toBeGreaterThan(1);
  for(const position of fixtures)for(const level of [1,5,9]) {
   const move=runtime.call('move',position.position,position.player,17,level);
   expect(()=>quuxActions(position.state as GameState,move)).not.toThrow();
  }
  // Coaching is independent of the opponent's configured level.
  const hint=decodeAnalysis(runtime.call('coach',coachRequest(start),start.player,7,1));
  expect(hint.bestMove).toBe(fixture.move);
  for(const value of [0,11,1.5,'4',null]) {
   expect(()=>decodeSession(JSON.stringify({...newSession(undefined,{mode:'practice'}),difficulty:value}))).toThrow('difficulty');
   expect(()=>decodeSetupProgress(JSON.stringify({pieces:[[],[]],player:0,mode:'practice',difficulty:value}))).toThrow('difficulty');
  }
 });
});

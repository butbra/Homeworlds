import {describe,it,expect} from 'vitest';
import {introPhase,nextIntroBoundary} from './intro';
import {decodeSetupProgress} from './setup';
describe('new-game introduction',()=>{
 it('reveals the coin only after five seconds and releases setup after the result',()=>{
  const start=10_000;
  for(const [elapsed,phase]of [[0,'names'],[449,'names'],[450,'flipping'],[4999,'flipping'],[5000,'revealed'],[6099,'revealed'],[6100,'complete']]as const)expect(introPhase(start,start+elapsed)).toBe(phase);
  expect(nextIntroBoundary(start,start)).toBe(450);
  expect(nextIntroBoundary(start,start+450)).toBe(5000);
  expect(nextIntroBoundary(start,start+5000)).toBe(6100);
 });
 it('restores an in-progress toss with the same starter and start time',()=>{
  const saved={pieces:[[],[]],player:1,starter:1,mode:'quux',humanPlayer:1,introStartedAt:10_000};
  expect(decodeSetupProgress(JSON.stringify(saved))).toEqual(saved);
  expect(introPhase(saved.introStartedAt,12_500)).toBe('flipping');
 });
 it('rejects malformed intro timing or a toss with pieces already selected',()=>{
  for(const introStartedAt of [-1,'100',null])expect(()=>decodeSetupProgress(JSON.stringify({pieces:[[],[]],player:0,introStartedAt}))).toThrow();
  expect(()=>decodeSetupProgress(JSON.stringify({pieces:[[{color:'red',size:1}],[]],player:0,introStartedAt:100}))).toThrow();
 });
});

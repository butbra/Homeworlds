import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createGameReview,decodeReviewPoint,northWinEstimate} from './review';
import {newSession,replay} from './session';
import {QuuxRuntime} from './quux-runtime';

const game=()=>{
 const session=newSession([{stars:[{color:'yellow',size:1},{color:'blue',size:3}],shipColor:'green'},{stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'}]);
 session.actions.push({type:'build',system:'north',color:'green'},{type:'end'},{type:'build',system:'south',color:'green'},{type:'end'},{type:'discover',system:'north',ship:1,star:{color:'red',size:2}},{type:'end'},{type:'resign'});
 return session;
};
describe('post-game review',()=>{
 it('retains every action, exact board states and discovered system layout without mutating the session',()=>{
  const session=game(),before=structuredClone(session),review=createGameReview(session);
  expect(review.frames).toHaveLength(session.actions.length+1);
  expect(review.frames[0].state.systems).toHaveLength(2);
  expect(review.frames[1].state.systems[0].ships).toHaveLength(2);
  expect(review.frames[5].state.systems).toHaveLength(3);
  expect(review.frames[5].layout.slots['system-1']).toBeDefined();
  expect(review.frames[4].layout.slots['system-1']).toBeUndefined();
  expect(review.frames.at(-1)!.state).toEqual(replay(session));
  expect(review.points.map(p=>p.frame)).toEqual([0,2,4,6,7]);
  expect(review.points[0].north).toBe(50);expect(review.points.at(-1)!.north).toBe(100);
  expect(session).toEqual(before);
 });
 it('converts scores from either player perspective and recognizes immediate winning replies',()=>{
  const review={score:160,outcome:-1 as const,losesNext:false,winningReply:''};
  expect(northWinEstimate(review,0)).toBe(73);expect(northWinEstimate(review,1)).toBe(27);
  expect(northWinEstimate({...review,losesNext:true},1)).toBe(98);
  expect(northWinEstimate({...review,outcome:2},0)).toBe(50);
  expect(northWinEstimate({...review,outcome:0},1)).toBe(100);
 });
 it('evaluates actual completed turns with the original Quux WebAssembly engine',async()=>{
  const engine=await QuuxRuntime.create(readFileSync(new URL('../vendor/quux/quux.wasm',import.meta.url)));
  const review=createGameReview(game());
  for(const point of review.points.filter(p=>p.request)){
   const request=point.request!;const estimate=decodeReviewPoint(engine.call('coach',request.text,request.player),request.player);
   expect(estimate).toBeGreaterThan(0);expect(estimate).toBeLessThan(100);
  }
 });
});

import {describe,it,expect} from 'vitest';
import {startingRecommendations,useStartingRecommendation,recommendedStart,nextRecommendedPiece,startingWarnings} from './openings';
import {setupBank,confirmSetup,type SetupProgress} from './setup';
import {createInitialState} from './game';

describe('beginner starting recommendations',()=>{
 it('offers legal three-color starts with green, blue, different star sizes and exact connection sizes',()=>{
  for(const r of startingRecommendations)for(const player of [0,1]as const) {
   const progress:SetupProgress={pieces:[[],[]],player,starter:player,mode:'learning',difficulty:1};
   const next=useStartingRecommendation(progress,r.id);
   expect(progress.pieces).toEqual([[],[]]);expect(next.player).toBe(player);
   expect(next.pieces[player]).toEqual(r.pieces);expect(next.pieces[1-player]).toEqual([]);
   expect(setupBank(next.pieces)).toHaveLength(33);
   expect(r.pieces[2]).toEqual({color:'green',size:3});
   expect(r.pieces.some(p=>p.color==='blue')).toBe(true);
   expect(new Set(r.pieces.map(p=>p.color)).size).toBe(3);
   expect(new Set([r.pieces[0].size,r.pieces[1].size,r.connection]).size).toBe(3);
   expect(confirmSetup(next)?.player).toBe(1-player);
  }
 });
 it('replaces only unconfirmed choices and rejects unavailable pieces without changing either player',()=>{
  const progress:SetupProgress={pieces:[startingRecommendations[0].pieces,[{color:'red',size:3},{color:'red',size:3},{color:'red',size:3}]],player:1,starter:0,mode:'learning',difficulty:1};
  const before=structuredClone(progress),next=useStartingRecommendation(progress,'banker');
  expect(progress).toEqual(before);expect(next.pieces[0]).toEqual(before.pieces[0]);
  expect(next).toMatchObject({player:1,starter:0,mode:'learning',difficulty:1});
  expect(()=>createInitialState(next.pieces.map(p=>({stars:[p[0],p[1]],shipColor:p[2].color})))).not.toThrow();
  const exhausted:SetupProgress={pieces:[[{color:'green',size:3},{color:'green',size:3},{color:'green',size:3}],[]],player:1};
  expect(()=>useStartingRecommendation(exhausted,'goldilocks')).toThrow('unavailable');
  expect(exhausted.pieces[1]).toEqual([]);expect(recommendedStart(exhausted)).toBeUndefined();
 });
 it('adapts recommendations to opponent sizes and either order of the selected stars',()=>{
  let progress:SetupProgress={pieces:[[],[]],player:1};
  expect(recommendedStart(progress)?.id).toBe('goldilocks');
  expect(nextRecommendedPiece(progress)).toEqual({color:'red',size:1});
  progress.pieces[1]=[{color:'blue',size:3}];
  expect(nextRecommendedPiece(progress)).toEqual({color:'red',size:1});
  progress.pieces[1].push({color:'red',size:1});
  expect(nextRecommendedPiece(progress)).toEqual({color:'green',size:3});
  progress.pieces[1].push({color:'green',size:3});
  expect(nextRecommendedPiece(progress)).toBeUndefined();
  progress={pieces:[startingRecommendations[0].pieces,[]],player:1};
  expect(recommendedStart(progress)?.id).toBe('banker');
  expect(nextRecommendedPiece(progress)).toEqual({color:'red',size:2});
 });
 it('explains difficult legal starts while allowing the player to keep them',()=>{
  const progress:SetupProgress={pieces:[[],[{color:'red',size:3},{color:'red',size:3},{color:'red',size:3}]],player:1,starter:1};
  const warnings=startingWarnings(progress);
  expect(warnings.some(w=>w.includes('No green'))).toBe(true);
  expect(warnings.some(w=>w.includes('No blue'))).toBe(true);
  expect(warnings.some(w=>w.includes('Repeating colors'))).toBe(true);
  expect(warnings.some(w=>w.includes('Same-size'))).toBe(true);
  expect(confirmSetup(progress)?.player).toBe(0);
  expect(startingWarnings({pieces:[[],startingRecommendations[0].pieces],player:1})).toEqual([]);
 });
});

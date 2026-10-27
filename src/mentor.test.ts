import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {QuuxRuntime} from './quux-runtime';
import {applyAction,createInitialState,type Action,type GameState} from './game';
import {quuxActions,quuxPosition} from './quux';
import {guideRequest,decodeGuide,remainingPlan,explainPlan,nextClick,catastropheImpact,winningConfirmation} from './mentor';
import fixtures from './fixtures/quux-native.json';
const engine=()=>QuuxRuntime.create(readFileSync(new URL('../vendor/quux/quux.wasm',import.meta.url)));
const analyze=async(start:GameState,current=start)=>{
 const runtime=await engine();return decodeGuide(start,current,runtime.call('guide',guideRequest(start,current),start.player));
};
function greenHome() {
 let state=createInitialState([
  {stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'},
  {stars:[{color:'green',size:1},{color:'blue',size:3}],shipColor:'green'},
 ],1);
 for(const action of [{type:'build',system:'south',color:'green'},{type:'end'},{type:'end'}]as Action[])state=applyAction(state,action);
 return state;
}

describe('strategic learning guidance',()=>{
 it('offers the native opening choice and only legal safe alternatives with useful reasons',async()=>{
  const state=createInitialState(undefined,1),analysis=await analyze(state);
  expect(analysis.choices.length).toBeGreaterThanOrEqual(1);
  const runtime=await engine();
  expect(analysis.choices[0].move).toBe(runtime.call('move',quuxPosition(state).text,1));
  for(const choice of analysis.choices) {
   const after=choice.actions.reduce(applyAction,state);
   expect(after.outcome).not.toBe(0);expect(choice.review.losesNext).toBe(false);
   expect(explainPlan(state,choice.actions,choice.review).benefits.length).toBeGreaterThan(0);
  }
  expect(explainPlan(state,analysis.choices[0].actions,analysis.choices[0].review).benefits.join(' ')).toContain('second ship at home');
 });
 it('offers genuinely close alternatives when the engine finds them, without inventing opening alternatives',async()=>{
  const state=fixtures[4].state as GameState,analysis=await analyze(state);
  expect(analysis.choices.length).toBeGreaterThan(1);
  for(const choice of analysis.choices) {
   expect(choice.review.score).toBeGreaterThanOrEqual(analysis.choices[0].review.score-24);
   expect(choice.review.losesNext).toBe(false);
   expect(()=>choice.actions.reduce(applyAction,state)).not.toThrow();
   expect(explainPlan(state,choice.actions,choice.review).benefits.length).toBeGreaterThan(0);
  }
 });
 it('never recommends destroying your all-green home fleet just because four greens are present',async()=>{
  const start=greenHome(),current=applyAction(start,{type:'build',system:'south',color:'green'});
  const catastrophe={type:'catastrophe',system:'south',color:'green'}as const;
  const impact=catastropheImpact(current,catastrophe);
  expect(impact).toMatchObject({own:3,enemy:0,stars:1,wholeSystem:false,loses:true});
  expect(impact.system?.stars).toEqual([{color:'blue',size:3}]);
  const spent=await analyze(start,current);
  expect(spent.choices).toEqual([]);expect(spent.current.losesNext).toBe(true);
  // At the next fresh decision, trading a green away can escape the threat.
  const fresh={...current,allowance:{color:null,remaining:1,sacrificed:false}}as GameState;
  const safe=await analyze(fresh);
  expect(safe.choices.length).toBeGreaterThan(0);
  for(const choice of safe.choices) {
   expect(choice.actions[0].type).not.toBe('catastrophe');
   expect(choice.actions.reduce(applyAction,fresh).outcome).not.toBe(0);
   expect(choice.review.losesNext).toBe(false);
  }
 });
 it('tracks native sacrifice lines step by step without granting extra actions',async()=>{
  const start=fixtures[6].state as GameState,actions=quuxActions(start,fixtures[6].move);
  let current=start;
  for(let i=0;i<actions.length;i++) {
   const remaining=remainingPlan(start,actions,current);
   expect(remaining).not.toBeNull();expect(remaining!.reduce(applyAction,current)).toEqual(actions.reduce(applyAction,start));
   if(actions[i].type==='end')break;
   current=applyAction(current,actions[i]);
  }
  const staged=applyAction(start,actions[0]);
  const analysis=await analyze(start,staged);
  expect(analysis.choices.length).toBeGreaterThan(0);
  for(const line of analysis.choices) {
   const remaining=remainingPlan(start,line.actions,staged)!;
   expect(remaining.some(a=>a.type==='sacrifice')).toBe(false);
   expect(remaining.filter(a=>a.type!=='end'&&a.type!=='catastrophe').length).toBeLessThanOrEqual(staged.allowance.remaining);
   expect(remaining.reduce(applyAction,staged).outcome).not.toBe(1-start.player);
  }
 },30000);
 it('rebases equivalent fleets and discovered system names onto the actual board',()=>{
  const start=fixtures[6].state as GameState,actions=quuxActions(start,fixtures[6].move);
  const staged=applyAction(start,actions[0]);
  const shuffled={...staged,systems:staged.systems.map(s=>({...s,ships:[...s.ships].reverse()}))};
  const remaining=remainingPlan(start,actions,shuffled);
  expect(remaining).not.toBeNull();expect(()=>remaining!.reduce(applyAction,shuffled)).not.toThrow();
  const discovery=fixtures[2].state as GameState,travel=quuxActions(discovery,fixtures[2].move);
  const after=applyAction(discovery,travel[0]);
  const renamed={...after,systems:after.systems.map(s=>({...s,id:s.id.startsWith('system-')?'renamed-'+s.id:s.id}))};
  expect(remainingPlan(discovery,travel,renamed)).toEqual([{type:'end'}]);
  expect(remainingPlan(start,actions,{...staged,allowance:{color:null,remaining:0,sacrificed:false}})).toBeNull();
 });
 it('guides the exact physical click and clears an unrelated selected ship before building',()=>{
  const state=createInitialState(undefined,1),build:Action[]=[{type:'build',system:'south',color:'green'},{type:'end'}];
  expect(nextClick(state,build,'south',null,'build')?.selector).toBe('[data-color="green"][data-size="1"]');
  expect(nextClick(state,build,'north',{system:'north',ship:0},'build')?.selector).toBe('#clear');
  const trade:Action[]=[{type:'trade',system:'south',ship:0,color:'yellow'},{type:'end'}];
  expect(nextClick(state,trade,'south',null,'build')?.selector).toContain('data-source="south"');
  expect(nextClick(state,trade,'south',{system:'south',ship:0},'build')?.selector).toBe('[data-intent="trade"]');
  expect(nextClick(state,trade,'south',{system:'south',ship:0},'trade')?.selector).toBe('[data-color="yellow"][data-size="3"]');
 });
 it('prioritizes an actual rulebook win over search limitations and stops advising after game over',()=>{
  const start=fixtures[16].state as GameState,actions=quuxActions(start,fixtures[16].move);
  const staged=actions.slice(0,-1).reduce(applyAction,start);
  expect(winningConfirmation(staged,true)?.selector).toBe('#end');
  expect(winningConfirmation(staged,false)).toBeNull();
  expect(winningConfirmation(actions.reduce(applyAction,start),true)).toBeNull();
  expect(winningConfirmation(createInitialState(),true)).toBeNull();
 });
});

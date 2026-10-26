import {describe,it,expect} from 'vitest';
import {applyAction,legalChoices,type GameState} from './game';
import {learningOptions,lessons,lessonVisual,shipKey} from './learning';
import {newSession,decodeSession,replay} from './session';
import {decodeSetupProgress} from './setup';
import fixtures from './fixtures/quux-native.json';

describe('visual learning mode',()=>{
 it('plays every visual example legally while conserving the real 36-piece inventory',()=>{
  expect(lessons.length).toBeGreaterThanOrEqual(12);
  for(const lesson of lessons) {
   expect(lessonVisual(lesson,false)).toContain('pyramid');
   if(!lesson.example)continue;
   const {state,actions}=lesson.example;
   let after=state;
   for(const action of actions) {
    after=applyAction(after,action);
    const pieces=[...after.bank,...after.systems.flatMap(s=>[...s.stars,...s.ships])];
    expect(pieces).toHaveLength(36);
    for(const piece of pieces)expect(pieces.filter(p=>p.color===piece.color&&p.size===piece.size)).toHaveLength(3);
   }
   if(actions.length)expect(lessonVisual(lesson,true)).toContain('AFTER');
  }
 });
 it('shows the difference between losing one star and losing the final star',()=>{
  const partial=lessons.find(l=>l.title==='Four of a color can explode')!.example!;
  const after=partial.actions.reduce(applyAction,partial.state);
  expect(after.systems.find(s=>s.id==='south')?.stars).toEqual([{color:'blue',size:3}]);
  expect(after.systems.find(s=>s.id==='south')?.ships).toEqual([{color:'yellow',size:1,owner:1}]);
  expect(after.allowance.remaining).toBe(1);
  const total=lessons.find(l=>l.title==='When the entire system is destroyed')!.example!;
  expect(total.actions.reduce(applyAction,total.state).systems.some(s=>s.id==='outpost')).toBe(false);
 });
 it('demonstrates three sacrifice actions and a real turn-end capture victory',()=>{
  const sacrifice=lessons.find(l=>l.title==='Sacrifice for more actions')!.example!;
  const after=sacrifice.actions.reduce(applyAction,sacrifice.state);
  expect(after.allowance).toEqual({color:'green',remaining:0,sacrificed:true});
  const victory=lessons.find(l=>l.title==='Win, lose, or draw')!.example!;
  const result=victory.actions.reduce(applyAction,victory.state);
  expect(result.outcome).toBe(1);
  expect(result.systems.find(s=>s.id==='outpost')?.ships.some(p=>p.owner===0)).toBe(true);
 });
 it('highlights exactly the selectable ships, captures, builds and destinations validated by the rules',()=>{
  for(const fixture of fixtures) {
   const state=fixture.state as GameState;
   const choices=state.systems.flatMap(s=>legalChoices(state,s.id).map(c=>c.action));
   const expectedShips=new Set(choices.filter(a=>a.type!=='capture'&&'ship'in a).map(a=>shipKey(a.system,(a as {ship:number}).ship)));
   const expectedCaptures=new Set(choices.filter(a=>a.type==='capture').map(a=>shipKey(a.system,a.ship)));
   const plain=learningOptions(state,null);
   expect(plain.ships).toEqual(expectedShips);expect(plain.captures).toEqual(expectedCaptures);
   expect(plain.buildSystems).toEqual(new Set(choices.filter(a=>a.type==='build').map(a=>a.system)));
   for(const system of state.systems)system.ships.forEach((ship,index)=>{
    if(ship.owner!==state.player)return;
    const source={system:system.id,ship:index};
    const options=learningOptions(state,source);
    const matching=choices.filter(a=>'ship'in a&&a.system===system.id&&a.ship===index);
    expect(options.destinations).toEqual(new Set(matching.filter(a=>a.type==='move').map(a=>a.destination)));
    expect(options.trade).toBe(matching.some(a=>a.type==='trade'));
    expect(options.travel).toBe(matching.some(a=>a.type==='move'||a.type==='discover'));
    expect(options.sacrifice).toBe(matching.some(a=>a.type==='sacrifice'));
   });
  }
 });
 it('removes spent basic actions and restricts remaining actions to the sacrificed color',()=>{
  const example=lessons.find(l=>l.title==='Sacrifice for more actions')!.example!;
  const basic=applyAction(example.state,{type:'build',system:'south',color:'green'});
  const spent=learningOptions(basic,{system:'south',ship:0});
  expect(spent.ships.size).toBe(0);expect(spent.captures.size).toBe(0);expect(spent.buildSystems.size).toBe(0);
  const sacrificed=applyAction(example.state,example.actions[0]);
  const options=learningOptions(sacrificed,{system:'south',ship:0});
  expect(options.buildSystems.size).toBe(2);
  expect(options.trade).toBe(false);expect(options.travel).toBe(false);expect(options.sacrifice).toBe(false);
 });
 it('keeps Learning mode, South seating, easy difficulty and a staged turn through save/reload',()=>{
  const session=newSession(undefined,{mode:'learning',starter:1});
  expect(session).toMatchObject({mode:'learning',humanPlayer:1,difficulty:1});
  session.actions=[{type:'build',system:'south',color:'green'}];
  const decoded=decodeSession(JSON.stringify(session));expect(decoded).toEqual(session);
  expect(replay(decoded).allowance.remaining).toBe(0);
  const setup={pieces:[[],[]],player:1,starter:1,mode:'learning',humanPlayer:1,difficulty:1};
  expect(decodeSetupProgress(JSON.stringify(setup))).toEqual(setup);
 });
});

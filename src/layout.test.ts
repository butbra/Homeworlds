import {describe,it,expect} from 'vitest';
import {applyAction,createInitialState,suggestedOpening,type Action,type Opening} from './game';
import {createLayout,layoutAfter,layoutBounds} from './layout';

const opening:Opening[]=[
 {stars:[{color:'yellow',size:1},{color:'blue',size:3}],shipColor:'green'},
 {stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'},
];
function table(){
 let state=createInitialState(opening),layout=createLayout(opening);
 const play=(action:Action)=>{const after=applyAction(state,action);layout=layoutAfter(layout,state,action,after);state=after;};
 const passRound=()=>{play({type:'end'});play({type:'end'});};
 const discover=(color:'yellow'|'red')=>{
  play({type:'build',system:'north',color:'green'});passRound();
  play({type:'discover',system:'north',ship:1,star:{color,size:2}});
 };
 return {play,passRound,discover,get state(){return state;},get layout(){return layout;}};
}
describe('fixed map layout',()=>{
 it('puts home-connected sizes nearest their home and the shared size in the middle',()=>{
  const layout=createLayout(suggestedOpening);
  expect(layout.sizeRows).toEqual({1:2,2:1,3:3});
  expect(layout.slots).toEqual({north:{row:0,column:0},south:{row:4,column:0}});
 });
 it('aligns equal-size discoveries, fills the nearest free column, and preserves occupied slots',()=>{
  const game=table();game.discover('yellow');
  const first=game.layout;
  expect(first.slots['system-1']).toEqual({row:1,column:0});
  game.passRound();game.discover('red');
  expect(game.layout.slots['system-1']).toEqual(first.slots['system-1']);
  expect(game.layout.slots['system-2']).toEqual({row:1,column:-1});
  expect(layoutBounds(game.layout)).toEqual({minColumn:-1,columns:2});
  expect(first.slots['system-2']).toBeUndefined(); // Undo snapshots stay immutable.
 });
 it('reuses the slot freed by abandoning an ordinary star',()=>{
  const game=table();game.discover('yellow');game.passRound();
  game.play({type:'move',system:'system-1',ship:0,destination:'north'});
  expect(game.layout.slots['system-1']).toBeUndefined();game.passRound();
  game.play({type:'discover',system:'north',ship:1,star:{color:'red',size:2}});
  expect(game.layout.slots['system-2']).toEqual({row:1,column:0});
 });
 it('frees destroyed systems without changing size rows after homeworld star loss',()=>{
  const game=table();game.discover('yellow');
  const before=game.state,layout=game.layout;
  // Layout consumes the rules engine's resolved board; it never adjudicates a catastrophe.
  const after=structuredClone(before);
  after.systems=after.systems.filter(s=>s.id!=='system-1');
  after.systems[0].stars.splice(0,1);
  const next=layoutAfter(layout,before,{type:'catastrophe',system:'system-1',color:'yellow'},after);
  expect(next.slots['system-1']).toBeUndefined();
  expect(next.slots.north).toEqual(layout.slots.north);
  expect(next.sizeRows).toEqual(layout.sizeRows);
 });
 it('reconstructs identical slots when a saved game is replayed',()=>{
  const actions:Action[]=[
   {type:'build',system:'north',color:'green'},{type:'end'},{type:'end'},
   {type:'discover',system:'north',ship:1,star:{color:'yellow',size:2}},
   {type:'end'},{type:'end'},
   {type:'build',system:'north',color:'green'},{type:'end'},{type:'end'},
   {type:'discover',system:'north',ship:1,star:{color:'red',size:2}},
  ];
  const original=table(),reloaded=table();
  actions.forEach(original.play);JSON.parse(JSON.stringify(actions)).forEach(reloaded.play);
  expect(reloaded.layout).toEqual(original.layout);
 });
});

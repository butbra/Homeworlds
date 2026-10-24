import {describe,it,expect} from 'vitest';
import {applyAction,areConnected,colors,sizes,createInitialState,type GameState,type StarSystem,type Piece,type Ship} from './game';
const piece=(color:Piece['color'],size:Piece['size']):Piece=>({color,size});
const ship=(color:Piece['color'],size:Piece['size'],owner:0|1=0):Ship=>({color,size,owner});
const sys=(id:string,stars:Piece[],ships:Ship[],homeworld?:0|1):StarSystem=>({id,name:id,stars,ships,homeworld});
function fixture(systems:StarSystem[]):GameState {
 const state=createInitialState();state.systems=systems;
 state.bank=colors.flatMap(color=>sizes.flatMap(size=>Array.from({length:3},()=>({color,size}))));
 for(const s of systems)for(const p of [...s.stars,...s.ships]){const i=state.bank.findIndex(x=>x.color===p.color&&x.size===p.size);if(i<0)throw Error('Bad inventory fixture');state.bank.splice(i,1);}
 return state;
}
function conserved(s:GameState):void {
 const inventory=[...s.bank,...s.systems.flatMap(x=>[...x.stars,...x.ships])];
 for(const color of colors)for(const size of sizes)expect(inventory.filter(p=>p.color===color&&p.size===size)).toHaveLength(3);
}
describe('Rules13 strategy examples',()=>{
 it('p26 Factory: sacrifice and rebuild a large green, leaving two build actions',()=>{
  let state=fixture([sys('factory',[piece('blue',1)],[ship('green',3),ship('green',2)],0),sys('stock',[piece('green',1)],[ship('green',1),ship('green',1),ship('green',2),ship('green',2)])]);
  state=applyAction(state,{type:'sacrifice',system:'factory',ship:0});
  state=applyAction(state,{type:'build',system:'factory',color:'green'});
  expect(state.systems[0].ships).toContainEqual(ship('green',3));expect(state.allowance.remaining).toBe(2);conserved(state);
 });
 it('p24 Investing: sacrificing the last ship returns its star before subsequent builds',()=>{
  let state=fixture([sys('investment',[piece('red',3)],[ship('green',1)]),sys('home',[piece('blue',1),piece('yellow',2)],[ship('red',1)],0),sys('stock',[piece('red',1)],[ship('red',1),ship('red',2),ship('red',2),ship('red',2)])]);
  expect(state.bank.some(p=>p.color==='red'&&p.size<3)).toBe(false);
  state=applyAction(state,{type:'sacrifice',system:'investment',ship:0});
  expect(state.systems.some(s=>s.id==='investment')).toBe(false);
  state=applyAction(state,{type:'build',system:'home',color:'red'});
  expect(state.systems.find(s=>s.id==='home')!.ships).toContainEqual(ship('red',3));conserved(state);
 });
 it('p27 Terraforming: a sacrificed yellow is immediately available as a discovered star',()=>{
  let state=fixture([sys('a',[piece('blue',1)],[ship('yellow',3),ship('green',2)],0),sys('stock',[piece('yellow',3)],[ship('yellow',3,1)])]);
  expect(state.bank.some(p=>p.color==='yellow'&&p.size===3)).toBe(false);
  state=applyAction(state,{type:'sacrifice',system:'a',ship:0});
  state=applyAction(state,{type:'discover',system:'a',ship:0,star:piece('yellow',3)});
  expect(state.systems.find(s=>s.id==='system-1')!.stars).toEqual([piece('yellow',3)]);expect(state.allowance.remaining).toBe(2);conserved(state);
 });
 it('p25 Squonking: unused sacrifice actions can be forfeited',()=>{
  const state=applyAction(createInitialState(),{type:'sacrifice',system:'north',ship:0});
  const ended=applyAction(state,{type:'end'});expect(ended.outcome).toBe(1); // Abandoning home still loses.
 });
 it('p26 Teleporting: sacrificed green can be rebuilt remotely with local color presence',()=>{
  let state=fixture([sys('a',[piece('red',1)],[ship('green',1)]),sys('b',[piece('blue',2)],[ship('green',2)],0)]);
  state=applyAction(state,{type:'sacrifice',system:'a',ship:0});
  state=applyAction(state,{type:'build',system:'b',color:'green'});
  expect(state.systems.find(s=>s.id==='b')!.ships).toContainEqual(ship('green',1));conserved(state);
 });
});
describe('Rules13 catastrophe and connectivity edge cases',()=>{
 it('p22 Gemini stars are legal and connect based on their shared size',()=>{
  const a=sys('a',[piece('blue',1),piece('blue',1)],[ship('green',3)],0);
  expect(areConnected(a,sys('b',[piece('red',2)],[]))).toBe(true);
  expect(areConnected(a,sys('c',[piece('red',1)],[]))).toBe(false);
 });
 it('p9 a same-color binary catastrophe destroys both stars and every fleet',()=>{
  let state=fixture([sys('a',[piece('red',1),piece('red',2)],[ship('red',3),ship('red',1,1),ship('green',2)],0)]);
  state=applyAction(state,{type:'catastrophe',system:'a',color:'red'});
  expect(state.systems[0].stars).toEqual([]);expect(state.systems[0].ships).toEqual([]);conserved(state);
 });
 it('p25 Hyperspace bypass: a half-destroyed homeworld gains new connections immediately',()=>{
  let state=fixture([sys('a',[piece('red',1),piece('blue',2)],[ship('red',1),ship('red',2),ship('red',3,1),ship('green',2)],0)]);
  const destination=sys('b',[piece('yellow',1)],[]);
  expect(areConnected(state.systems[0],destination)).toBe(false);
  state=applyAction(state,{type:'catastrophe',system:'a',color:'red'});
  expect(areConnected(state.systems[0],destination)).toBe(true);conserved(state);
 });
 it('p5 catastrophes are optional and do not spend any remaining sacrifice actions',()=>{
  let state=fixture([sys('a',[piece('red',1)],[ship('red',1),ship('red',2),ship('red',3,1),ship('yellow',3),ship('green',1)],0)]);
  state=applyAction(state,{type:'sacrifice',system:'a',ship:3});
  expect(state.systems[0].ships.filter(s=>s.color==='red')).toHaveLength(3); // No automatic explosion.
  state=applyAction(state,{type:'catastrophe',system:'a',color:'red'});
  expect(state.allowance).toEqual({color:'yellow',remaining:3,sacrificed:true});conserved(state);
 });
 it('pp7,14 a basic move cannot also capture in the same turn',()=>{
  let state=fixture([sys('a',[piece('yellow',1)],[ship('green',3)]),sys('b',[piece('red',2)],[ship('blue',1,1)],1)]);
  state=applyAction(state,{type:'move',system:'a',ship:0,destination:'b'});
  expect(()=>applyAction(state,{type:'capture',system:'b',ship:0})).toThrow('No actions');conserved(state);
 });
 it('p9 remote catastrophes may occur before choosing a basic action or sacrifice',()=>{
  let state=fixture([sys('remote',[piece('blue',2)],[ship('red',1,1),ship('red',1,1),ship('red',2,1),ship('red',3,1)]),sys('home',[piece('yellow',1)],[ship('green',3)],0)]);
  state=applyAction(state,{type:'catastrophe',system:'remote',color:'red'});
  state=applyAction(state,{type:'sacrifice',system:'home',ship:0});
  expect(state.allowance.remaining).toBe(3);conserved(state);
 });
});
describe('p5 all four sacrifice powers work globally',()=>{
 it.each(['red','yellow','green','blue'] as const)('%s sacrifice bypasses local power while retaining action-specific restrictions',color=>{
  let state=fixture([
   sys('sacrifice',[piece('blue',1)],[ship(color,3),ship('green',2)],0),
   sys('target',[piece(color==='green'?'red':'green',2)],[ship(color==='yellow'?'blue':'yellow',2),ship('blue',1,1)]),
   sys('destination',[piece('red',3)],[ship('green',1)]),
  ]);
  state=applyAction(state,{type:'sacrifice',system:'sacrifice',ship:0});
  const action=color==='red'?{type:'capture' as const,system:'target',ship:1}:color==='blue'?{type:'trade' as const,system:'target',ship:0,color:'red' as const}:color==='green'?{type:'build' as const,system:'target',color:'yellow' as const}:{type:'move' as const,system:'target',ship:0,destination:'destination'};
  state=applyAction(state,action);expect(state.allowance.remaining).toBe(2);conserved(state);
 });
});

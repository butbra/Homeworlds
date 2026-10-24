import './style.css';
import {resultDescription} from './outcome';
import {beforeAction,animateAction} from './effects';
import {setupBank,placeSetupPiece,decodeSetupProgress,confirmSetup,undoSetup,openingFromSetup,setupKey,type Setup} from './setup';
import {bankAction, legal, pyramid, type ShipSelection} from './tabletop';
import { colors, sizes, createInitialState, applyAction, legalChoices, type Piece, type Action, type GameState, type Opening, type Color, type Size } from './game';

import {newSession, decodeSession, storageKey, type Session} from './session';

const app = document.querySelector<HTMLDivElement>('#app')!;
let session = newSession();
let state = createInitialState();
let selected = 'north';
let source: ShipSelection | null = null;
let intent: 'build'|'trade'|'discover' = 'build';
let pending: Piece | null = null;
let draft: Setup | null = [[],[]];
let setupPlayer:0|1=0;
let resumeSession: Session | null = null;
let notice = 'Two-player local game. Player 1 chooses first; agree who goes first or flip a coin (rulebook p. 4).';
let history: { state: GameState; log: string[]; actionCount: number }[] = [];
let log: string[] = [];
let announcedResult='';

function escape(text: string): string { return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function save(): void {
  try {localStorage.setItem(storageKey, JSON.stringify(session));}
  catch {notice += ' Browser storage unavailable; export a save to keep this game.';}
}
function restore(next: Session): void {
  session = next;draft=null;resumeSession=null;announcedResult='';
  try {localStorage.removeItem(setupKey);} catch { /* Storage optional. */ }
  state = createInitialState(session.opening);
  history = []; log = [];
  session.actions.forEach((action, index) => {
    if (['end', 'resign', 'draw'].includes(action.type)) history = [];
    else history.push({state, log: [...log], actionCount: index});
    log.push(`Turn ${state.turn} · Player ${state.player + 1}: ${action.type}`);
    state = applyAction(state, action);
  });
  selected = state.player === 0 ? 'north' : 'south';
  source = null; intent = 'build'; pending = null;
}
try {
  const stored=localStorage.getItem(storageKey);
  if(stored)resumeSession=decodeSession(stored);
  const partial=localStorage.getItem(setupKey);
  if(partial){const progress=decodeSetupProgress(partial);draft=progress.pieces;setupPlayer=progress.player;selected=setupPlayer===0?'north':'south';notice='Your homeworld selection has been restored.';}
} catch {notice='Choose your starting pieces. A previous save could not be loaded.';}
function saveSetup():void {try {if(draft)localStorage.setItem(setupKey,JSON.stringify({pieces:draft,player:setupPlayer}));} catch {notice='Browser storage unavailable; keep this page open during setup.';}}
function beginSetup():void {draft=[[],[]];setupPlayer=0;announcedResult='';source=null;pending=null;selected='north';positions={};saveLayout();notice='Player 1: choose two stars of any size/color, then one large ship.';saveSetup();render();}
interface Position {x:number;y:number}
let positions: Record<string,Position> = {};
try {positions=JSON.parse(localStorage.getItem('homeworlds.layout.v2')||'{}');} catch { /* Defaults below. */ }
function location(id:string,index:number): Position {
  const saved=positions?.[id];
  if(saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return {x:Math.max(14,Math.min(85,saved.x)),y:Math.max(12,Math.min(88,saved.y))};
  return id==='north'?{x:50,y:16}:id==='south'?{x:50,y:84}:{x:50+(index%2===0?-17:17),y:34+((index-2)%3)*16};
}
function saveLayout():void {try {localStorage.setItem('homeworlds.layout.v2',JSON.stringify(positions));} catch { /* Gameplay autosave reports storage failures. */ }}
function act(action:Action,label:string):void {
  try {
    const visual=beforeAction(state,action);
    const next=applyAction(state,action);
    if(['end','resign','draw'].includes(action.type)) history=[];
    else history.push({state,log:[...log],actionCount:session.actions.length});
    log.push(`Turn ${state.turn} · Player ${state.player+1}: ${label}`);
    session.actions.push(action);state=next;notice=label;
    source=null;pending=null;intent='build';
    if(action.type==='end') selected=state.player===0?'north':'south';
    if(!state.systems.some(s=>s.id===selected)) selected=state.systems[0]?.id??'';
    save();render();animateAction(visual,state,action);
  } catch(error) {notice=(error as Error).message;render();}
}
function chooseBank(piece:Piece):void {
  try {
    if(draft) {
      draft=placeSetupPiece({pieces:draft,player:setupPlayer},piece).pieces;
      saveSetup();
      render();return;
    }
    const action=bankAction(state,selected,piece,source,intent);
    applyAction(state,action); // Validate before choosing discovery placement.
    if(intent==='discover') {pending=piece;notice='Click an empty spot in space to place the new star system.';render();}
    else act(action,`${action.type==='trade'?'Traded for':'Built'} ${piece.color} ${piece.size}`);
  } catch(error) {notice=(error as Error).message;render();}
}
function starfield():string {
  let seed=93;
  return Array.from({length:160},(_,i)=>{seed=(seed*16807)%2147483647;const x=seed%10000/100;seed=(seed*16807)%2147483647;const y=seed%10000/100;return `<i style="left:${x}%;top:${y}%;--light:${i%9===0?'.9':'.35'};--radius:${i%9===0?'2':'1'}px"></i>`;}).join('');
}
function render():void {
  const over=state.outcome!=='playing';
  const systems=draft?draft.flatMap((p,i)=>p.length?[{id:i===0?'north':'south',name:i===0?'North homeworld':'South homeworld',homeworld:i,stars:p.slice(0,2),ships:p[2]?[{...p[2],owner:i}]:[]}]:[]):state.systems;
  const bank=draft?setupBank(draft):state.bank;
  const status=draft?`Player ${setupPlayer+1} · Setup`:over?state.outcome==='draw'?'Game over · Draw':`Player ${Number(state.outcome)+1} wins`:`Turn ${state.turn} · Player ${state.player+1}`;
  const selectedShip=source?state.systems.find(s=>s.id===source!.system)?.ships[source.ship]:null;
  const catastrophes=draft||over?[]:state.systems.flatMap(s=>colors.flatMap(color=>{const count=[...s.stars,...s.ships].filter(p=>p.color===color).length;return count>=4?[{system:s.id,name:s.name,color,count}]:[];}));
  const instruction=draft?(draft[setupPlayer].length===3?`Player ${setupPlayer+1}: review your homeworld. Undo to revise, then click End turn to confirm.`:`Player ${setupPlayer+1}: click ${draft[setupPlayer].length<2?'a bank piece for star '+(draft[setupPlayer].length+1):'a large bank piece for your starting ship'}.`):pending?'Click empty space to discover a new system.':source?`${selectedShip?.color} ship selected. Click a connected system to move, or choose Trade / Discover / Sacrifice.`:'Click a system, then a bank pyramid to build. Click your ship to move, trade, discover, or sacrifice. Click an enemy ship to capture.';
  app.innerHTML=`<main class="tabletop"><header class="topbar"><a class="wordmark" href="./">HOME<span>WORLDS</span><small>THE PYRAMID STARSHIP GAME</small></a><div class="status ${state.player===1?'south-turn':''}">${status}</div><nav><button id="undo" aria-label="Undo action" ${draft?!draft[setupPlayer].length?'disabled':'':!history.length?'disabled':''}>↶ <span>Undo action</span></button><button id="end" aria-label="End turn" class="primary" ${draft?draft[setupPlayer].length!==3?'disabled':'':over?'disabled':''}>End turn →</button><button id="menu" aria-label="Game menu">☰</button></nav></header>
  <div class="play-area"><section class="space ${pending?'placing':''}" id="space" aria-label="Space playing surface"><div id="universe" class="universe" style="min-height:${Math.max(0,(systems.length-4)*180)}px"><div class="starfield" aria-hidden="true">${starfield()}</div><div class="map-label">SECTOR 01 <span>LOCAL EXPLORATION</span></div>
  ${systems.map((s,i)=>{
    const pos=location(s.id,i);
    const destination=source&&source.system!==s.id&&legal(state,{type:'move',...source,destination:s.id});
    return `<article class="system ${selected===s.id?'selected':''} ${destination?'destination':''}" data-system="${s.id}" style="left:${pos.x}%;top:${pos.y}%" aria-label="${s.name}"><div class="system-title"><button data-select="${s.id}" aria-label="Select ${s.name}">${s.homeworld===undefined?'✧':'⌂'} ${s.name}</button><button class="drag-handle" data-drag="${s.id}" aria-label="Reposition ${s.name}" title="Drag to rearrange · arrow keys also work">⠿</button></div><div class="system-pieces"><div class="stars">${s.stars.map((p,j)=>`<button class="piece-button" data-star="${s.id}" aria-label="${s.name} ${p.color} star ${p.size}">${pyramid(p,true)}<span class="piece-caption">${j===0?'':' '}</span></button>`).join('')||'<span class="destroyed">No stars</span>'}</div><div class="fleets">${[0,1].map(owner=>`<div class="fleet" data-player="${owner}" aria-label="Player ${owner+1} fleet">${s.ships.map((p,j)=>p.owner===owner?`<button class="piece-button ${source?.system===s.id&&source.ship===j?'picked':''}" data-ship="${j}" data-source="${s.id}" aria-label="Player ${owner+1} ${p.color} ship ${p.size} at ${s.name}">${pyramid(p,false,owner)}</button>`:'').join('')}</div>`).join('')}</div></div><div class="system-meta">${s.homeworld===undefined?'FRONTIER':`PLAYER ${s.homeworld+1} HOMEWORLD`}${destination?'<span>MOVE HERE ↗</span>':''}</div></article>`;
  }).join('')}
  <div class="space-compass" aria-hidden="true">✧<span>THE UNIVERSE IS YOURS TO EXPLORE</span></div></div></section>
  <aside class="sidebar" aria-label="Game sidebar"><section class="bank" aria-label="Piece bank"><div class="bank-heading"><h2>THE BANK</h2><span>${bank.length} PIECES</span></div><p>Click a pyramid to bring it into play.</p>${colors.map(color=>`<div class="bank-color ${color}"><h3>${color}<span>${{red:'CAPTURE',yellow:'MOVE',green:'BUILD',blue:'TRADE'}[color]}</span></h3><div class="bank-row">${sizes.map(size=>{
    const p={color,size},count=bank.filter(b=>b.color===color&&b.size===size).length;
    let available=false;try {available=draft?!!placeSetupPiece({pieces:draft,player:setupPlayer},p):legal(state,bankAction(state,selected,p,source,intent));} catch { /* Not a legal bank choice. */ }
    return `<button class="bank-piece ${available?'available':''} ${pending?.color===color&&pending.size===size?'picked':''}" data-color="${color}" data-size="${size}" aria-label="Bank ${color} ${size}" ${!count||(draft?draft[setupPlayer].length===3:over)?'disabled':''} title="${color} size ${size}: ${count} available">${pyramid(p)}<span>×${count}</span></button>`;
  }).join('')}</div></div>`).join('')}</section>
  <section class="command-bar" aria-label="Piece controls"><div class="turn-token p${draft?setupPlayer:state.player}"><span>${draft?`P${setupPlayer+1} SETUP`:over?'FINISHED':`PLAYER ${state.player+1}`}</span><strong>${draft?'✧':over?'★':state.allowance.remaining}</strong><small>${draft?'pieces':state.allowance.sacrificed?`${state.allowance.color} actions`:'actions left'}</small></div><div class="command-content">${over&&!draft?`<div class="result-banner"><strong>${status}</strong><p>${resultDescription(state)}</p></div>`:''}<div class="context-actions">${source?`<button data-intent="trade" ${intent==='trade'?'class="active"':''}>Trade → bank</button><button data-intent="discover" ${intent==='discover'?'class="active"':''}>Discover → bank → space</button><button id="sacrifice" ${legal(state,{type:'sacrifice',...source})?'':'disabled'}>Sacrifice ship</button><button id="clear">Cancel selection</button>`:`<strong>${draft?'PREPARE FOR FIRST CONTACT':escape(systems.find(s=>s.id===selected)?.name??'Select a system')}</strong>`}${catastrophes.map(c=>`<button class="danger" data-cat="${c.color}" data-cat-system="${c.system}" aria-label="${c.color} catastrophe at ${c.name}">✹ ${c.color} · ${c.name} (${c.count})</button>`).join('')}${draft&&resumeSession?'<button id="resume">Resume saved game</button>':''}</div><p class="instruction">${instruction}</p><p id="notice" role="status" aria-live="polite">${escape(notice)}</p></div><button id="help" class="help-button" aria-label="How to play">?</button></section></aside></div>
  <dialog id="result" aria-labelledby="result-title"><p class="result-eyebrow">GAME OVER</p><h2 id="result-title">${over?status:''}</h2><p>${over?resultDescription(state):''}</p><button id="result-new" class="primary">New local game</button><button id="result-close">View final board</button></dialog>
  <dialog id="game-menu"><h2>Mission control</h2><div class="menu-buttons"><button id="reset">New game</button><button id="export" ${draft?'disabled':''}>Export save</button><button id="import">Import save</button><button id="resign" ${over||draft?'disabled':''}>Resign</button><button id="draw" ${over||draft?'disabled':''}>Agree draw</button><button id="close-menu">Back to space</button></div><input type="file" id="save-file" accept=".json,application/json" hidden><details><summary>Flight log (${log.length})</summary><ol>${log.map(l=>`<li>${escape(l)}</li>`).join('')}</ol></details><p>Your game saves automatically on this device.</p></dialog>
  <dialog id="rules"><h2>Your fleet. Your universe.</h2><p><b>Build:</b> click a system, then the smallest available bank piece of a color you already own there. You need green power.</p><p><b>Move:</b> click your ship, then a connected system. Systems connect when their stars share no sizes. You need yellow power.</p><p><b>Trade:</b> click your ship, then Trade, then a different bank color of exactly the same size. You need blue power.</p><p><b>Discover:</b> click your ship, Discover, a bank pyramid for the new star, then empty space to place it. You need yellow power.</p><p><b>Capture:</b> click an enemy ship. You need red power and an equal or larger ship in that system.</p><p><b>Sacrifice:</b> click your ship, then Sacrifice. Instead of a basic action, gain its pip count in actions of its color anywhere you still have ships.</p><p><b>Catastrophe:</b> whenever any system has four or more pieces of one color, its catastrophe button appears in the sidebar, even if you have no ships there. Count stars and both fleets. The active player may choose to remove that color. If the last star is removed, every ship there is destroyed; a surviving binary-star half protects other colors. Optional and free at any point in your turn.</p><p>Power comes from stars or your own local ships, never enemy ships. Confirm with End turn. An empty or destroyed homeworld loses at turn end. Undo works until you confirm. Drag a system’s grip to arrange the map; this costs no action.</p><p>Based on Homeworlds Rules13, pp. 4–11. Game: John Cooper. Pyramid system: Andrew Looney. Unofficial implementation.</p><button id="close-rules">Back to space</button></dialog></main>`;
  bindBoard();bindTools();
  if(over&&!draft&&announcedResult!==`${state.turn}:${state.outcome}`){announcedResult=`${state.turn}:${state.outcome}`;document.querySelector<HTMLDialogElement>('#result')!.showModal();}
}
function bindBoard():void {
  const space=document.querySelector<HTMLElement>('#space')!;
  space.addEventListener('click',event=>{
    const target=event.target as Element;
    if(target.closest('[data-drag]')) return;
    if(draft) return;
    const shipButton=target.closest<HTMLElement>('[data-ship]');
    if(shipButton) {
      const system=shipButton.dataset.source!,index=Number(shipButton.dataset.ship);
      const ship=state.systems.find(s=>s.id===system)!.ships[index];
      if(ship.owner!==state.player) {act({type:'capture',system,ship:index},`Captured ${ship.color} ship`);return;}
      source={system,ship:index};selected=system;intent='build';pending=null;
      notice='Ship selected. Click a destination to move, or choose an action in the sidebar.';render();return;
    }
    const system=target.closest<HTMLElement>('.system')?.dataset.system;
    if(system) {
      if(source&&source.system!==system&&!target.closest('[data-star]')) act({type:'move',...source,destination:system},'Moved ship');
      else {selected=system;source=null;pending=null;intent='build';notice='Click a bank pyramid to build here, or select a ship.';render();}
      return;
    }
    if(pending&&source) {
      const rect=document.querySelector('#universe')!.getBoundingClientRect(),mouse=event as MouseEvent,id=`system-${state.nextSystem}`;
      positions[id]={x:Math.max(14,Math.min(85,(mouse.clientX-rect.left)/rect.width*100)),y:Math.max(12,Math.min(88,(mouse.clientY-rect.top)/rect.height*100))};saveLayout();
      const action=bankAction(state,selected,pending,source,'discover');selected=id;act(action,'Discovered a new star system');
    } else {source=null;pending=null;intent='build';render();}
  });
  document.querySelectorAll<HTMLElement>('[data-color]').forEach(button=>button.addEventListener('click',()=>chooseBank({color:button.dataset.color as Color,size:Number(button.dataset.size) as Size})));
  document.querySelectorAll<HTMLElement>('[data-intent]').forEach(button=>button.addEventListener('click',()=>{intent=button.dataset.intent as 'trade'|'discover';pending=null;notice=intent==='trade'?'Click a different bank color of the same size.':'Choose a connected star size from the bank, then click empty space.';render();}));
  document.querySelector('#clear')?.addEventListener('click',()=>{source=null;pending=null;intent='build';render();});
  document.querySelector('#sacrifice')?.addEventListener('click',()=>{if(source)act({type:'sacrifice',...source},'Sacrificed ship');});
  document.querySelectorAll<HTMLElement>('[data-cat]').forEach(button=>button.addEventListener('click',()=>act({type:'catastrophe',system:button.dataset.catSystem!,color:button.dataset.cat as Color},`Invoked ${button.dataset.cat} catastrophe`)));
  document.querySelector('#resume')?.addEventListener('click',()=>{if(resumeSession){restore(resumeSession);notice='Your saved game has been restored.';render();}});
  document.querySelectorAll<HTMLElement>('[data-drag]').forEach(handle=>{
    handle.addEventListener('pointerdown',event=>{
      event.preventDefault();const card=handle.closest<HTMLElement>('.system')!,rect=document.querySelector('#universe')!.getBoundingClientRect();
      const id=handle.dataset.drag!,start=location(id,systemsIndex(id)),x=event.clientX,y=event.clientY;
      handle.setPointerCapture(event.pointerId);
      const move=(e:PointerEvent)=>{positions[id]={x:Math.max(14,Math.min(85,start.x+(e.clientX-x)/rect.width*100)),y:Math.max(12,Math.min(88,start.y+(e.clientY-y)/rect.height*100))};card.style.left=`${positions[id].x}%`;card.style.top=`${positions[id].y}%`;};
      const up=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);saveLayout();};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);
    });
    handle.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();const id=handle.dataset.drag!,p=location(id,systemsIndex(id));
      positions[id]={x:Math.max(14,Math.min(85,p.x+(event.key==='ArrowRight'?3:event.key==='ArrowLeft'?-3:0))),y:Math.max(12,Math.min(88,p.y+(event.key==='ArrowDown'?3:event.key==='ArrowUp'?-3:0)))};
      saveLayout();const card=handle.closest<HTMLElement>('.system')!;card.style.left=`${positions[id].x}%`;card.style.top=`${positions[id].y}%`;
    });
  });
}
function systemsIndex(id:string):number{return state.systems.findIndex(s=>s.id===id);}
function bindTools():void {
  const result=document.querySelector<HTMLDialogElement>('#result')!;
  document.querySelector('#result-close')!.addEventListener('click',()=>result.close());
  document.querySelector('#result-new')!.addEventListener('click',()=>beginSetup());
  const menu=document.querySelector<HTMLDialogElement>('#game-menu')!;
  const rules=document.querySelector<HTMLDialogElement>('#rules')!;
  document.querySelector('#menu')!.addEventListener('click',()=>menu.showModal());
  document.querySelector('#close-menu')!.addEventListener('click',()=>menu.close());
  document.querySelector('#help')!.addEventListener('click',()=>rules.showModal());
  document.querySelector('#close-rules')!.addEventListener('click',()=>rules.close());
  document.querySelector('#reset')!.addEventListener('click',()=>{if(draft||window.confirm('Start a new local game? Export your current game first to keep a copy.'))beginSetup();});
  document.querySelector('#end')!.addEventListener('click',()=>{
    if(!draft){act({type:'end'},'Ended turn');return;}
    try {
      const next=confirmSetup({pieces:draft,player:setupPlayer});
      if(next){draft=next.pieces;setupPlayer=next.player;selected='south';notice='Player 1 confirmed. Player 2: choose your homeworld.';saveSetup();}
      else {const opening=openingFromSetup(draft);restore(newSession(opening));positions={};saveLayout();notice='Both players confirmed. Player 1 begins.';save();}
      render();
    } catch(error){notice=(error as Error).message;render();}
  });
  document.querySelector('#undo')!.addEventListener('click',()=>{if(draft){draft=undoSetup({pieces:draft,player:setupPlayer}).pieces;notice='Starting piece returned to the bank.';saveSetup();render();return;}const previous=history.pop();if(previous){state=previous.state;log=previous.log;session.actions.length=previous.actionCount;source=null;pending=null;intent='build';notice='Action undone.';save();render();}});
  document.querySelector('#resign')!.addEventListener('click',()=>{if(window.confirm(`Player ${state.player+1}: resign and award the other player the win?`))act({type:'resign'},'Resigned');});
  document.querySelector('#draw')!.addEventListener('click',()=>{if(window.confirm('Player 1: do you agree to a draw?')&&window.confirm('Player 2: do you also agree to a draw?'))act({type:'draw'},'Both players agreed to a draw');});
  document.querySelector('#export')!.addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`homeworlds-turn-${state.turn}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice='Save exported.';render();
  });
  document.querySelector('#import')!.addEventListener('click',()=>document.querySelector<HTMLInputElement>('#save-file')!.click());
  document.querySelector('#save-file')!.addEventListener('change',async event=>{
    const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;
    try {if(file.size>2_000_000)throw Error('Save file is too large.');const imported=decodeSession(await file.text());if(!window.confirm('Replace the current game with this imported save?'))return;restore(imported);draft=null;notice='Saved game imported.';save();render();}
    catch(error){notice=`Import failed: ${(error as Error).message}`;render();}
  });
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){source=null;pending=null;intent='build';render();}});
render();

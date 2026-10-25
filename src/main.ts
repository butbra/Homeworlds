import './style.css';
import {resultDescription} from './outcome';
import {beforeAction,animateAction} from './effects';
import {setupBank,placeSetupPiece,decodeSetupProgress,confirmSetup,undoSetup,openingFromSetup,setupKey,type Setup} from './setup';
import {bankAction, legal, pyramid, type ShipSelection} from './tabletop';
import { colors, sizes, createInitialState, applyAction, type Piece, type Action, type GameState, type Color, type Size,type Player } from './game';
import {randomStarter,type GameMode} from './match';
import {askQuux,stopQuux,quuxPosition,quuxSetupPosition,decodeQuuxSetup,quuxActions} from './quux';

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
let mode:GameMode='local';
let starter:Player=0;
let choosingMode=true;
let botBusy=false;
let botError='';
let botEpoch=0;
let resumeSession: Session | null = null;
let notice = 'Choose another player on this device or play Quux Bot. A coin flip chooses who starts.';
let history: { state: GameState; log: string[]; actionCount: number }[] = [];
let log: string[] = [];
let announcedResult='';

function escape(text: string): string { return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function save(): void {
  try {localStorage.setItem(storageKey, JSON.stringify(session));}
  catch {notice += ' Browser storage unavailable; export a save to keep this game.';}
}
function cancelBot():void {botEpoch++;stopQuux();botBusy=false;botError='';}
function playerName(player:number):string {return mode==='quux'?(player===0?'You':'Quux Bot'):`Player ${player+1}`;}
function outcomeText():string {
  const text=resultDescription(state);
  return mode==='quux'?text.replaceAll('Player 1','You').replaceAll('Player 2','Quux Bot').replaceAll('You has','You have').replaceAll('You wins','You win'):text;
}
function botTurn():boolean {return !choosingMode&&mode==='quux'&&(draft?setupPlayer===1:state.outcome==='playing'&&state.player===1);}
function locked():boolean {return choosingMode||botBusy||botTurn();}
function restore(next: Session,cancel=true): void {
  if(cancel)cancelBot();
  session = next;mode=next.mode??'local';starter=next.starter??0;choosingMode=false;draft=null;resumeSession=null;announcedResult='';
  try {localStorage.removeItem(setupKey);} catch { /* Storage optional. */ }
  state = createInitialState(session.opening,session.starter);
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
  if(partial){const progress=decodeSetupProgress(partial);draft=progress.pieces;setupPlayer=progress.player;starter=progress.starter??0;mode=progress.mode??'local';choosingMode=false;selected=setupPlayer===0?'north':'south';notice='Your homeworld selection has been restored.';}
} catch {notice='Choose your starting pieces. A previous save could not be loaded.';}
function saveSetup():void {try {if(draft)localStorage.setItem(setupKey,JSON.stringify({pieces:draft,player:setupPlayer,starter,mode}));} catch {notice='Browser storage unavailable; keep this page open during setup.';}}
function beginSetup(nextMode:GameMode):void {
  cancelBot();mode=nextMode;starter=randomStarter();setupPlayer=starter;choosingMode=false;
  draft=[[],[]];announcedResult='';source=null;pending=null;selected=starter===0?'north':'south';positions={};saveLayout();
  notice=`Coin flip: ${playerName(starter)} ${mode==='quux'&&starter===0?'choose':'chooses'} first and ${mode==='quux'&&starter===0?'take':'takes'} the first turn. Choose two stars, then one large ship.`;
  saveSetup();render();
}
function chooseNewGame():void {
  cancelBot();choosingMode=true;draft=[[],[]];source=null;pending=null;state=createInitialState();
  try {const saved=localStorage.getItem(storageKey);resumeSession=saved?decodeSession(saved):null;} catch {resumeSession=null;}
  notice='Choose another player on this device or play Quux Bot. A coin flip chooses who starts.';render();
}
function confirmHomeworld():void {
  if(!draft)return;
  const next=confirmSetup({pieces:draft,player:setupPlayer,starter,mode});
  if(next){draft=next.pieces;setupPlayer=next.player;selected=setupPlayer===0?'north':'south';notice=`Homeworld confirmed. ${playerName(setupPlayer)}: choose your homeworld.`;saveSetup();}
  else {const opening=openingFromSetup(draft);restore(newSession(opening,{starter,mode}),false);positions={};saveLayout();notice=`Both homeworlds confirmed. ${playerName(starter)} ${mode==='quux'&&starter===0?'begin':'begins'}.`;save();}
}
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function scheduleBot():void {
  if(!botTurn()||botBusy||botError)return;
  const epoch=botEpoch;botBusy=true;
  queueMicrotask(async()=>{
    try {
      render();
      if(draft) {
        if(draft[1].length!==3){
          const answer=await askQuux('setup',quuxSetupPosition(draft),1);
          if(epoch!==botEpoch)return;
          for(const piece of decodeQuuxSetup(answer))draft=placeSetupPiece({pieces:draft!,player:1,starter,mode},piece).pieces;
          saveSetup();render();
        }
        await pause(450);if(epoch!==botEpoch)return;
        confirmHomeworld();
      } else {
        const answer=await askQuux('move',quuxPosition(state).text,1);
        if(epoch!==botEpoch)return;
        const actions=quuxActions(state,answer); // Entire native turn must validate first.
        for(const action of actions){
          await pause(action.type==='end'?280:220);if(epoch!==botEpoch)return;
          if(!act(action,action.type==='end'?'Quux Bot ended its turn':`Quux Bot: ${action.type}`,true))throw Error('Could not apply Quux Bot’s turn.');
        }
      }
    } catch(error){if(epoch===botEpoch){botError=(error as Error).message;notice=botError;}}
    finally {if(epoch===botEpoch){botBusy=false;render();}}
  });
}
interface Position {x:number;y:number}
let positions: Record<string,Position> = {};
try {positions=JSON.parse(localStorage.getItem('homeworlds.layout.v2')||'{}');} catch { /* Defaults below. */ }
function location(id:string,index:number): Position {
  const saved=positions?.[id];
  if(saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return {x:Math.max(14,Math.min(85,saved.x)),y:Math.max(12,Math.min(88,saved.y))};
  return id==='north'?{x:50,y:16}:id==='south'?{x:50,y:84}:{x:50+(index%2===0?-17:17),y:34+((index-2)%3)*16};
}
function saveLayout():void {try {localStorage.setItem('homeworlds.layout.v2',JSON.stringify(positions));} catch { /* Gameplay autosave reports storage failures. */ }}
function act(action:Action,label:string,fromBot=false):boolean {
  if(!fromBot&&locked())return false;
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
    // A browser reload retries an unfinished bot turn from its saved turn boundary.
    if(!fromBot||action.type==='end')save();render();animateAction(visual,state,action);return true;
  } catch(error) {notice=(error as Error).message;render();return false;}
}
function chooseBank(piece:Piece):void {
  if(locked())return;
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
  const openDialog=document.querySelector<HTMLDialogElement>('dialog[open]')?.id;
  const over=state.outcome!=='playing';
  const inputLocked=locked();
  const systems=draft?draft.flatMap((p,i)=>p.length?[{id:i===0?'north':'south',name:i===0?'North homeworld':'South homeworld',homeworld:i,stars:p.slice(0,2),ships:p[2]?[{...p[2],owner:i}]:[]}]:[]):state.systems;
  const bank=draft?setupBank(draft):state.bank;
  const status=draft?`${playerName(setupPlayer)} · Setup`:over?state.outcome==='draw'?'Game over · Draw':mode==='quux'&&state.outcome===0?'You win':`${playerName(Number(state.outcome))} wins`:`Turn ${state.turn} · ${playerName(state.player)}`;
  const selectedShip=source?state.systems.find(s=>s.id===source!.system)?.ships[source.ship]:null;
  const catastrophes=draft||over?[]:state.systems.flatMap(s=>colors.flatMap(color=>{const count=[...s.stars,...s.ships].filter(p=>p.color===color).length;return count>=4?[{system:s.id,name:s.name,color,count}]:[];}));
  const instruction=botTurn()?(draft?'Quux Bot is choosing and confirming its homeworld.':'Quux Bot is taking its turn. You can still rearrange the map.'):draft?(draft[setupPlayer].length===3?`${playerName(setupPlayer)}: review your homeworld. Undo to revise, then click End turn to confirm.`:`${playerName(setupPlayer)}: click ${draft[setupPlayer].length<2?'a bank piece for star '+(draft[setupPlayer].length+1):'a large bank piece for your starting ship'}.`):pending?'Click empty space to discover a new system.':source?`${selectedShip?.color} ship selected. Click a connected system to move, or choose Trade / Discover / Sacrifice.`:'Click a system, then a bank pyramid to build. Click your ship to move, trade, discover, or sacrifice. Click an enemy ship to capture.';
  app.innerHTML=`<main class="tabletop"><header class="topbar"><a class="wordmark" href="./">HOME<span>WORLDS</span><small>THE PYRAMID STARSHIP GAME</small></a><div class="status ${(draft?setupPlayer:state.player)===1?'south-turn':''}">${status}</div><nav><button id="undo" aria-label="Undo action" ${inputLocked||(draft?!draft[setupPlayer].length:!history.length)?'disabled':''}>↶ <span>Undo action</span></button><button id="end" aria-label="End turn" class="primary" ${inputLocked||(draft?draft[setupPlayer].length!==3:over)?'disabled':''}>End turn →</button><button id="menu" aria-label="Game menu">☰</button></nav></header>
  <div class="play-area"><section class="space ${pending?'placing':''}" id="space" aria-label="Space playing surface"><div id="universe" class="universe" style="min-height:${Math.max(0,(systems.length-4)*180)}px"><div class="starfield" aria-hidden="true">${starfield()}</div><div class="map-label">SECTOR 01 <span>LOCAL EXPLORATION</span></div>
  ${systems.map((s,i)=>{
    const pos=location(s.id,i);
    const destination=source&&source.system!==s.id&&legal(state,{type:'move',...source,destination:s.id});
    return `<article class="system ${selected===s.id?'selected':''} ${destination?'destination':''}" data-system="${s.id}" style="left:${pos.x}%;top:${pos.y}%" aria-label="${s.name}"><div class="system-title"><button data-select="${s.id}" aria-label="Select ${s.name}">${s.homeworld===undefined?'✧':'⌂'} ${s.name}</button><button class="drag-handle" data-drag="${s.id}" aria-label="Reposition ${s.name}" title="Drag to rearrange · arrow keys also work">⠿</button></div><div class="system-pieces"><div class="stars">${s.stars.map((p,j)=>`<button class="piece-button" data-star="${s.id}" aria-label="${s.name} ${p.color} star ${p.size}">${pyramid(p,true)}<span class="piece-caption">${j===0?'':' '}</span></button>`).join('')||'<span class="destroyed">No stars</span>'}</div><div class="fleets">${[0,1].map(owner=>`<div class="fleet" data-player="${owner}" aria-label="Player ${owner+1} fleet">${s.ships.map((p,j)=>p.owner===owner?`<button class="piece-button ${source?.system===s.id&&source.ship===j?'picked':''}" data-ship="${j}" data-source="${s.id}" aria-label="Player ${owner+1} ${p.color} ship ${p.size} at ${s.name}">${pyramid(p,false,owner)}</button>`:'').join('')}</div>`).join('')}</div></div><div class="system-meta">${s.homeworld===undefined?'FRONTIER':`PLAYER ${s.homeworld+1} HOMEWORLD`}${destination?'<span>MOVE HERE ↗</span>':''}</div></article>`;
  }).join('')}
  <div class="space-compass" aria-hidden="true">✧<span>THE UNIVERSE IS YOURS TO EXPLORE</span></div></div></section>
  <aside class="sidebar" aria-label="Game sidebar"><section class="bank" aria-label="Piece bank"><div class="bank-heading"><h2>THE BANK</h2><span>${bank.length} PIECES</span></div><p>Click a pyramid to bring it into play.</p>${colors.map(color=>`<div class="bank-color ${color}"><h3>${color}<span>${{red:'CAPTURE',yellow:'MOVE',green:'BUILD',blue:'TRADE'}[color]}</span></h3><div class="bank-row">${sizes.map(size=>{
    const p={color,size},count=bank.filter(b=>b.color===color&&b.size===size).length;
    let available=false;try {available=!inputLocked&&(draft?!!placeSetupPiece({pieces:draft,player:setupPlayer},p):legal(state,bankAction(state,selected,p,source,intent)));} catch { /* Not a legal bank choice. */ }
    return `<button class="bank-piece ${available?'available':''} ${pending?.color===color&&pending.size===size?'picked':''}" data-color="${color}" data-size="${size}" aria-label="Bank ${color} ${size}" ${inputLocked||!count||(draft?draft[setupPlayer].length===3:over)?'disabled':''} title="${color} size ${size}: ${count} available">${pyramid(p)}<span>×${count}</span></button>`;
  }).join('')}</div></div>`).join('')}</section>
  <section class="command-bar" aria-label="Piece controls"><div class="turn-token p${draft?setupPlayer:state.player}"><span>${draft?`P${setupPlayer+1} SETUP`:over?'FINISHED':`PLAYER ${state.player+1}`}</span><strong>${draft?'✧':over?'★':state.allowance.remaining}</strong><small>${draft?'pieces':state.allowance.sacrificed?`${state.allowance.color} actions`:'actions left'}</small></div><div class="command-content">${over&&!draft?`<div class="result-banner"><strong>${status}</strong><p>${outcomeText()}</p></div>`:''}<div class="context-actions">${source?`<button data-intent="trade" ${intent==='trade'?'class="active"':''}>Trade → bank</button><button data-intent="discover" ${intent==='discover'?'class="active"':''}>Discover → bank → space</button><button id="sacrifice" ${legal(state,{type:'sacrifice',...source})?'':'disabled'}>Sacrifice ship</button><button id="clear">Cancel selection</button>`:`<strong>${draft?'PREPARE FOR FIRST CONTACT':escape(systems.find(s=>s.id===selected)?.name??'Select a system')}</strong>`}${catastrophes.map(c=>`<button class="danger" data-cat="${c.color}" data-cat-system="${c.system}" aria-label="${c.color} catastrophe at ${c.name}">✹ ${c.color} · ${c.name} (${c.count})</button>`).join('')}${draft&&resumeSession&&!choosingMode?'<button id="resume">Resume saved game</button>':''}</div><p class="match-info">${mode==='quux'?'You vs Quux Bot':'Two players · same device'} · ${playerName(starter)} ${mode==='quux'&&starter===0?'go':'goes'} first</p>${botError?'<button id="retry-bot">Retry Quux Bot</button>':''}<p class="instruction">${instruction}</p><p id="notice" role="status" aria-live="polite">${escape(notice)}</p></div><button id="help" class="help-button" aria-label="How to play">?</button></section></aside></div>
  <dialog id="result" aria-labelledby="result-title"><p class="result-eyebrow">GAME OVER</p><h2 id="result-title">${over?status:''}</h2><p>${over?outcomeText():''}</p><button id="result-new" class="primary">New game</button><button id="result-close">View final board</button></dialog>
  <dialog id="game-menu"><h2>Mission control</h2><div class="menu-buttons"><button id="reset">New game</button><button id="export" ${draft||botBusy?'disabled':''}>Export save</button><button id="import">Import save</button><button id="resign" ${over||draft||inputLocked?'disabled':''}>Resign</button><button id="draw" ${over||draft||mode==='quux'?'disabled':''}>Agree draw</button><button id="close-menu">Back to space</button></div><input type="file" id="save-file" accept=".json,application/json" hidden><details><summary>Flight log (${log.length})</summary><ol>${log.map(l=>`<li>${escape(l)}</li>`).join('')}</ol></details><p>Your game saves automatically on this device.</p></dialog>
  <dialog id="opponent-picker" aria-labelledby="opponent-title"><p class="result-eyebrow">A NEW EXPEDITION</p><h2 id="opponent-title">Choose your opponent</h2><p>Explore the galaxy with another person, or challenge Quux Bot.</p><div class="opponent-options"><button id="play-local" aria-label="Another player"><strong>Another player</strong><span>Two people on this device</span></button><button id="play-quux" aria-label="Quux Bot"><strong>Quux Bot</strong><span>You command North. The bot commands South.</span></button></div><p class="coin-note">A coin flip chooses who sets up and takes the first turn.</p>${resumeSession&&choosingMode?'<button id="resume">Resume saved game</button>':''}</dialog>
  <dialog id="rules"><h2>Your fleet. Your universe.</h2><p><b>Build:</b> click a system, then the smallest available bank piece of a color you already own there. You need green power.</p><p><b>Move:</b> click your ship, then a connected system. Systems connect when their stars share no sizes. You need yellow power.</p><p><b>Trade:</b> click your ship, then Trade, then a different bank color of exactly the same size. You need blue power.</p><p><b>Discover:</b> click your ship, Discover, a bank pyramid for the new star, then empty space to place it. You need yellow power.</p><p><b>Capture:</b> click an enemy ship. You need red power and an equal or larger ship in that system.</p><p><b>Sacrifice:</b> click your ship, then Sacrifice. Instead of a basic action, gain its pip count in actions of its color anywhere you still have ships.</p><p><b>Catastrophe:</b> whenever any system has four or more pieces of one color, its catastrophe button appears in the sidebar, even if you have no ships there. Count stars and both fleets. The active player may choose to remove that color. If the last star is removed, every ship there is destroyed; a surviving binary-star half protects other colors. Optional and free at any point in your turn.</p><p>Power comes from stars or your own local ships, never enemy ships. Confirm with End turn. An empty or destroyed homeworld loses at turn end. Undo works until you confirm. Drag a system’s grip to arrange the map; this costs no action.</p><p>Based on Homeworlds Rules13, pp. 4–11. Game: John Cooper. Pyramid system: Andrew Looney. Unofficial implementation.</p><p>Quux Bot: original engine by Arthur O’Dwyer. <a href="./quux-LICENSE.txt" target="_blank" rel="noopener">License</a> · <a href="https://github.com/Quuxplusone/Homeworlds" target="_blank" rel="noopener">Engine source</a>.</p><button id="close-rules">Back to space</button></dialog></main>`;
  bindBoard();bindTools();
  document.querySelector('#play-local')!.addEventListener('click',()=>beginSetup('local'));
  document.querySelector('#play-quux')!.addEventListener('click',()=>beginSetup('quux'));
  document.querySelector('#opponent-picker')!.addEventListener('cancel',event=>event.preventDefault());
  document.querySelector('#retry-bot')?.addEventListener('click',()=>{botError='';render();});
  if(choosingMode)document.querySelector<HTMLDialogElement>('#opponent-picker')!.showModal();
  else if(openDialog&&openDialog!=='opponent-picker')document.querySelector<HTMLDialogElement>('#'+openDialog)?.showModal();
  scheduleBot();
  if(over&&!draft&&announcedResult!==`${state.turn}:${state.outcome}`){announcedResult=`${state.turn}:${state.outcome}`;document.querySelector<HTMLDialogElement>('#result')!.showModal();}
}
function bindBoard():void {
  const space=document.querySelector<HTMLElement>('#space')!;
  space.addEventListener('click',event=>{
    const target=event.target as Element;
    if(target.closest('[data-drag]')) return;
    if(draft||locked()) return;
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
  document.querySelector('#result-new')!.addEventListener('click',chooseNewGame);
  const menu=document.querySelector<HTMLDialogElement>('#game-menu')!;
  const rules=document.querySelector<HTMLDialogElement>('#rules')!;
  document.querySelector('#menu')!.addEventListener('click',()=>menu.showModal());
  document.querySelector('#close-menu')!.addEventListener('click',()=>menu.close());
  document.querySelector('#help')!.addEventListener('click',()=>rules.showModal());
  document.querySelector('#close-rules')!.addEventListener('click',()=>rules.close());
  document.querySelector('#reset')!.addEventListener('click',()=>{if(draft||window.confirm('Start a new game? Export your current game first to keep a copy.'))chooseNewGame();});
  document.querySelector('#end')!.addEventListener('click',()=>{
    if(locked())return;
    if(!draft){act({type:'end'},'Ended turn');return;}
    try {
      confirmHomeworld();
      render();
    } catch(error){notice=(error as Error).message;render();}
  });
  document.querySelector('#undo')!.addEventListener('click',()=>{if(locked())return;if(draft){draft=undoSetup({pieces:draft,player:setupPlayer}).pieces;notice='Starting piece returned to the bank.';saveSetup();render();return;}const previous=history.pop();if(previous){state=previous.state;log=previous.log;session.actions.length=previous.actionCount;source=null;pending=null;intent='build';notice='Action undone.';save();render();}});
  document.querySelector('#resign')!.addEventListener('click',()=>{if(window.confirm(`${playerName(state.player)}: resign and award the other player the win?`)){menu.close();act({type:'resign'},'Resigned');}});
  document.querySelector('#draw')!.addEventListener('click',()=>{if(window.confirm('Player 1: do you agree to a draw?')&&window.confirm('Player 2: do you also agree to a draw?')){menu.close();act({type:'draw'},'Both players agreed to a draw');}});
  document.querySelector('#export')!.addEventListener('click',()=>{
    menu.close();
    const url=URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`homeworlds-turn-${state.turn}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice='Save exported.';render();
  });
  document.querySelector('#import')!.addEventListener('click',()=>document.querySelector<HTMLInputElement>('#save-file')!.click());
  document.querySelector('#save-file')!.addEventListener('change',async event=>{
    const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;
    try {if(file.size>2_000_000)throw Error('Save file is too large.');const imported=decodeSession(await file.text());if(!window.confirm('Replace the current game with this imported save?'))return;menu.close();restore(imported);draft=null;notice='Saved game imported.';save();render();}
    catch(error){menu.close();notice=`Import failed: ${(error as Error).message}`;render();}
  });
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){source=null;pending=null;intent='build';render();}});
render();

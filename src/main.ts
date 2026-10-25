import './style.css';
import {resultDescription} from './outcome';
import {beforeAction,animateAction} from './effects';
import {setupBank,placeSetupPiece,decodeSetupProgress,confirmSetup,undoSetup,openingFromSetup,setupKey,type Setup} from './setup';
import {bankAction, legal, pyramid, type ShipSelection} from './tabletop';
import { colors, sizes, createInitialState, applyAction, type Piece, type Action, type GameState, type Color, type Size,type Player } from './game';
import {randomStarter,humanPlayer,quuxPlayer,type GameMode} from './match';
import {askQuux,stopQuux,quuxPosition,quuxSetupPosition,decodeQuuxSetup,quuxActions} from './quux';
import {introPhase,nextIntroBoundary,nameEntranceMs,coinRevealMs,type IntroPhase} from './intro';
import {createLayout,layoutAfter,layoutBounds,type MapLayout} from './layout';

import {newSession, decodeSession, storageKey, type Session} from './session';

const app = document.querySelector<HTMLDivElement>('#app')!;
let session = newSession();
let state = createInitialState();
let selected = 'north';
let source: ShipSelection | null = null;
let intent: 'build'|'trade'|'discover' = 'build';
let draft: Setup | null = [[],[]];
let setupPlayer:0|1=0;
let mode:GameMode='local';
let starter:Player=0;
let choosingMode=true;
let botBusy=false;
let botError='';
let botEpoch=0;
let introStartedAt:number|null=null;
let introTimer:ReturnType<typeof setTimeout>|undefined;
let resumeSession: Session | null = null;
let notice = 'Choose another player on this device or play Quux Bot. A coin flip chooses who starts.';
let mapLayout=createLayout();
let history: { state: GameState; log: string[]; actionCount: number;layout:MapLayout }[] = [];
let log: string[] = [];
let announcedResult='';

function escape(text: string): string { return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function save(): void {
  try {localStorage.setItem(storageKey, JSON.stringify(session));}
  catch {notice += ' Browser storage unavailable; export a save to keep this game.';}
}
function cancelBot():void {botEpoch++;stopQuux();botBusy=false;botError='';clearTimeout(introTimer);introStartedAt=null;}
function playerName(player:number):string {return mode==='quux'?(player===humanPlayer?'You':'Quux Bot'):`Player ${player+1}`;}
function outcomeText():string {
  const text=resultDescription(state);
  return mode==='quux'?text.replaceAll('Player 1','Quux Bot').replaceAll('Player 2','You').replaceAll('You has','You have').replaceAll('You wins','You win'):text;
}
function botTurn():boolean {return !choosingMode&&introStartedAt===null&&mode==='quux'&&(draft?setupPlayer===quuxPlayer:state.outcome==='playing'&&state.player===quuxPlayer);}
function locked():boolean {return choosingMode||introStartedAt!==null||botBusy||botTurn();}
function restore(next: Session,cancel=true): void {
  if(cancel)cancelBot();
  session = next;mode=next.mode??'local';starter=next.starter??0;choosingMode=false;draft=null;resumeSession=null;announcedResult='';
  try {localStorage.removeItem(setupKey);} catch { /* Storage optional. */ }
  state = createInitialState(session.opening,session.starter);
  mapLayout=createLayout(session.opening);
  history = []; log = [];
  session.actions.forEach((action, index) => {
    if (['end', 'resign', 'draw'].includes(action.type)) history = [];
    else history.push({state, log: [...log], actionCount: index,layout:mapLayout});
    log.push(`Turn ${state.turn} · Player ${state.player + 1}: ${action.type}`);
    const nextState=applyAction(state, action);mapLayout=layoutAfter(mapLayout,state,action,nextState);state=nextState;
  });
  selected = state.player === 0 ? 'north' : 'south';
  source = null; intent = 'build';
}
try {
  const stored=localStorage.getItem(storageKey);
  if(stored)resumeSession=decodeSession(stored);
  const partial=localStorage.getItem(setupKey);
  if(partial){const progress=decodeSetupProgress(partial);draft=progress.pieces;setupPlayer=progress.player;starter=progress.starter??0;mode=progress.mode??'local';introStartedAt=progress.introStartedAt===undefined?null:Math.min(progress.introStartedAt,Date.now());choosingMode=false;selected=setupPlayer===0?'north':'south';notice=introStartedAt===null?'Your homeworld selection has been restored.':'';}
} catch {notice='Choose your starting pieces. A previous save could not be loaded.';}
function saveSetup():void {try {if(draft)localStorage.setItem(setupKey,JSON.stringify({pieces:draft,player:setupPlayer,starter,mode,...(mode==='quux'?{humanPlayer}:{}),...(introStartedAt!==null?{introStartedAt}:{})}));} catch {notice='Browser storage unavailable; keep this page open during setup.';}}
function beginSetup(nextMode:GameMode):void {
  cancelBot();mode=nextMode;starter=randomStarter();setupPlayer=starter;choosingMode=false;
  draft=[[],[]];announcedResult='';source=null;selected=starter===0?'north':'south';mapLayout=createLayout();
  introStartedAt=Date.now();notice='';saveSetup();advanceIntro();
}
function advanceIntro():void {
  clearTimeout(introTimer);
  if(introStartedAt===null)return;
  const now=Date.now();
  if(introPhase(introStartedAt,now)==='complete'){introStartedAt=null;notice='';saveSetup();render();revealSystem(selected);return;}
  introTimer=setTimeout(advanceIntro,Math.max(1,introStartedAt+nextIntroBoundary(introStartedAt,now)-now));
  render();
}
function chooseNewGame():void {
  cancelBot();choosingMode=true;draft=[[],[]];source=null;state=createInitialState();mapLayout=createLayout();
  try {const saved=localStorage.getItem(storageKey);resumeSession=saved?decodeSession(saved):null;} catch {resumeSession=null;}
  notice='Choose another player on this device or play Quux Bot. A coin flip chooses who starts.';render();
}
function confirmHomeworld():void {
  if(!draft)return;
  const next=confirmSetup({pieces:draft,player:setupPlayer,starter,mode});
  if(next){draft=next.pieces;setupPlayer=next.player;selected=setupPlayer===0?'north':'south';notice=`Homeworld confirmed. ${playerName(setupPlayer)}: choose your homeworld.`;saveSetup();}
  else {const opening=openingFromSetup(draft);restore(newSession(opening,{starter,mode}),false);notice=`Both homeworlds confirmed. ${playerName(starter)} ${mode==='quux'&&starter===humanPlayer?'begin':'begins'}.`;save();}
  revealSystem(selected);
}
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function scheduleBot():void {
  if(!botTurn()||botBusy||botError)return;
  const epoch=botEpoch;botBusy=true;
  queueMicrotask(async()=>{
    try {
      render();
      if(draft) {
        if(draft[quuxPlayer].length!==3){
          const answer=await askQuux('setup',quuxSetupPosition(draft),quuxPlayer);
          if(epoch!==botEpoch)return;
          for(const piece of decodeQuuxSetup(answer))draft=placeSetupPiece({pieces:draft!,player:quuxPlayer,starter,mode},piece).pieces;
          saveSetup();render();revealSystem('north');
        }
        await pause(450);if(epoch!==botEpoch)return;
        confirmHomeworld();
      } else {
        const answer=await askQuux('move',quuxPosition(state).text,quuxPlayer);
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
function revealSystem(id:string):void {
  requestAnimationFrame(()=>{
    const target=Array.from(document.querySelectorAll<HTMLElement>('[data-system],[data-layout-anchor]')).find(e=>e.dataset.system===id||e.dataset.layoutAnchor===id);
    target?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  });
}
function act(action:Action,label:string,fromBot=false):boolean {
  if(!fromBot&&locked())return false;
  try {
    const visual=beforeAction(state,action);
    const next=applyAction(state,action);
    if(['end','resign','draw'].includes(action.type)) history=[];
    else history.push({state,log:[...log],actionCount:session.actions.length,layout:mapLayout});
    log.push(`Turn ${state.turn} · Player ${state.player+1}: ${label}`);
    const discovered=action.type==='discover'?`system-${state.nextSystem}`:null;
    mapLayout=layoutAfter(mapLayout,state,action,next);
    session.actions.push(action);state=next;notice=label;
    if(discovered)selected=discovered;
    source=null;intent='build';
    if(action.type==='end') selected=state.player===0?'north':'south';
    if(!state.systems.some(s=>s.id===selected)) selected=state.systems[0]?.id??'';
    // A browser reload retries an unfinished bot turn from its saved turn boundary.
    if(!fromBot||action.type==='end')save();render();animateAction(visual,state,action);
    if(discovered)revealSystem(discovered);else if(action.type==='end')revealSystem(selected);
    return true;
  } catch(error) {notice=(error as Error).message;render();return false;}
}
function chooseBank(piece:Piece):void {
  if(locked())return;
  try {
    if(draft) {
      draft=placeSetupPiece({pieces:draft,player:setupPlayer},piece).pieces;
      saveSetup();
      render();revealSystem(setupPlayer===0?'north':'south');return;
    }
    const action=bankAction(state,selected,piece,source,intent);
    act(action,action.type==='discover'?'Discovered a new star system':`${action.type==='trade'?'Traded for':'Built'} ${piece.color} ${piece.size}`);
  } catch(error) {notice=(error as Error).message;render();}
}
function starfield():string {
  let seed=93;
  return Array.from({length:160},(_,i)=>{seed=(seed*16807)%2147483647;const x=seed%10000/100;seed=(seed*16807)%2147483647;const y=seed%10000/100;return `<i style="left:${x}%;top:${y}%;--light:${i%9===0?'.9':'.35'};--radius:${i%9===0?'2':'1'}px"></i>`;}).join('');
}
function playerPlate(player:Player,phase:IntroPhase|null):string {
  const over=state.outcome!=='playing'&&!draft;
  const active=phase?phase==='revealed'&&starter===player:draft?setupPlayer===player:over?state.outcome===player:state.player===player;
  let detail='';
  if(phase)detail=phase==='revealed'&&active?'GOES FIRST':'';
  else if(over)detail=state.outcome==='draw'?'DRAW':state.outcome===player?'WINNER':'GAME OVER';
  else if(draft&&active)detail=botTurn()?'Choosing homeworld…':draft[player].length===3?'Confirm with End turn':draft[player].length===2?'Choose a large ship':`Choose star ${draft[player].length+1}`;
  else if(active&&botTurn())detail=botError?'Waiting to retry':'Thinking…';
  const allowance=!phase&&!draft&&!over&&active?`<span class="player-allowance">${state.allowance.remaining} ${state.allowance.sacrificed?state.allowance.color+' ':''}action${state.allowance.remaining===1?'':'s'}</span>`:'';
  return `<div class="player-nameplate ${player===0?'north':'south'} ${active?'is-active':''} ${phase==='names'?'arriving':''}" data-player-name="${player}" aria-label="${player===0?'North':'South'} player"><small>${player===0?'NORTH':'SOUTH'}</small><strong>${playerName(player)}</strong>${detail?`<span class="player-detail">${detail}</span>`:''}${allowance}</div>`;
}
function coinIntro(phase:IntroPhase|null):string {
  if(!phase||phase==='complete'||introStartedAt===null)return '';
  const revealed=phase==='revealed',elapsed=Math.max(0,Date.now()-introStartedAt-nameEntranceMs);
  const icon='<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 39 25 59 32 39 39 32 59 25 39 5 32 25 25Z"/><circle cx="32" cy="32" r="7"/></svg>';
  return `<section class="coin-intro ${phase}" aria-label="Starting-player coin toss" aria-live="polite" style="--coin-finish:${2160+starter*180}deg;--flip-delay:-${elapsed}ms;--flip-duration:${coinRevealMs-nameEntranceMs}ms"><div class="coin-presentation"><p class="coin-eyebrow">FIRST CONTACT</p><div class="coin-stage" aria-hidden="true"><div class="coin-halo"></div><div class="coin-disc"><div class="coin-face coin-north">${icon}<span>${playerName(0)}</span></div><div class="coin-face coin-south">${icon}<span>${playerName(1)}</span></div></div><div class="coin-shadow"></div></div><h2 class="coin-title">${revealed?`${playerName(starter)} ${mode==='quux'&&starter===humanPlayer?'go':'goes'} first`:'Flipping for first turn'}</h2><p class="coin-caption">${revealed?'Choose a homeworld. Then command the galaxy.':'Let the universe decide.'}</p></div></section>`;
}
let lastNotice='',noticeUntil=0,noticeTimer:ReturnType<typeof setTimeout>|undefined;
function boardNotice():string {
  if(choosingMode||introStartedAt!==null)return '';
  if(notice!==lastNotice){lastNotice=notice;noticeUntil=Date.now()+4500;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{if(notice===lastNotice)notice='';lastNotice='';document.querySelector('#notice')?.replaceChildren();},4500);}
  return !choosingMode&&introStartedAt===null&&Date.now()<noticeUntil?escape(notice):'';
}
function render():void {
  const oldSpace=document.querySelector('#space');
  const scroll={left:oldSpace?.scrollLeft??0,top:oldSpace?.scrollTop??0};
  const openDialog=document.querySelector<HTMLDialogElement>('dialog[open]')?.id;
  const over=state.outcome!=='playing';
  const inputLocked=locked();
  const phase=introStartedAt===null?null:introPhase(introStartedAt,Date.now());
  const systems=draft?draft.flatMap((p,i)=>p.length?[{id:i===0?'north':'south',name:i===0?'North homeworld':'South homeworld',homeworld:i,stars:p.slice(0,2),ships:p[2]?[{...p[2],owner:i}]:[]}]:[]):state.systems;
  const bank=draft?setupBank(draft):state.bank;
  const status=phase?'Choosing first player':draft?`${playerName(setupPlayer)} · Setup`:over?state.outcome==='draw'?'Game over · Draw':mode==='quux'&&state.outcome===humanPlayer?'You win':`${playerName(Number(state.outcome))} wins`:`Turn ${state.turn} · ${playerName(state.player)}`;
  const catastrophes=draft||over?[]:state.systems.flatMap(s=>colors.flatMap(color=>{const count=[...s.stars,...s.ships].filter(p=>p.color===color).length;return count>=4?[{system:s.id,name:s.name,color,count}]:[];}));
  const {minColumn,columns}=layoutBounds(mapLayout);
  const slotStyle=(id:string)=>{const slot=mapLayout.slots[id];return `grid-row:${slot.row+1};grid-column:${slot.column-minColumn+1}`;};
  const controls=`<section class="rail-controls" aria-label="Turn controls"><div class="status ${!phase&&(draft?setupPlayer:state.player)===1?'south-turn':''}">${status}</div><nav><button id="undo" aria-label="Undo action" ${inputLocked||(draft?!draft[setupPlayer].length:!history.length)?'disabled':''}>↶ Undo</button><button id="end" aria-label="End turn" class="primary" ${inputLocked||(draft?draft[setupPlayer].length!==3:over)?'disabled':''}>End turn →</button><button id="menu" aria-label="Game menu">☰</button></nav></section>`;
  app.innerHTML=`<main class="tabletop"><div class="play-area"><section class="board-region" aria-label="Game board"><section class="space" id="space" aria-label="Space playing surface"><div id="universe" class="universe" style="--map-columns:${columns}"><div class="starfield" aria-hidden="true">${starfield()}</div><div class="map-label">SECTOR 01 <span>LOCAL EXPLORATION</span></div>
  ${['north','south'].filter(id=>!systems.some(s=>s.id===id)).map(id=>`<div class="layout-anchor" data-layout-anchor="${id}" style="${slotStyle(id)}" aria-hidden="true"></div>`).join('')}
  ${systems.map(s=>{
    const slot=mapLayout.slots[s.id];
    const destination=source&&source.system!==s.id&&legal(state,{type:'move',...source,destination:s.id});
    return `<article class="system ${selected===s.id?'selected':''} ${destination?'destination':''}" data-system="${s.id}" data-map-row="${slot.row}" data-map-column="${slot.column}" style="${slotStyle(s.id)}" aria-label="${s.name}"><div class="system-title"><button data-select="${s.id}" aria-label="Select ${s.name}">${s.homeworld===undefined?'✧':'⌂'} ${s.name}</button></div><div class="system-pieces"><div class="stars">${s.stars.map((p,j)=>`<button class="piece-button" data-star="${s.id}" aria-label="${s.name} ${p.color} star ${p.size}">${pyramid(p,true)}<span class="piece-caption">${j===0?'':' '}</span></button>`).join('')||'<span class="destroyed">No stars</span>'}</div><div class="fleets">${[0,1].map(owner=>`<div class="fleet" data-player="${owner}" aria-label="Player ${owner+1} fleet">${s.ships.map((p,j)=>p.owner===owner?`<button class="piece-button ${source?.system===s.id&&source.ship===j?'picked':''}" data-ship="${j}" data-source="${s.id}" aria-label="Player ${owner+1} ${p.color} ship ${p.size} at ${s.name}">${pyramid(p,false,owner)}</button>`:'').join('')}</div>`).join('')}</div></div><div class="system-meta">${s.homeworld===undefined?'FRONTIER':`PLAYER ${s.homeworld+1} HOMEWORLD`}${destination?'<span>MOVE HERE ↗</span>':''}</div>${catastrophes.filter(c=>c.system===s.id).map(c=>`<button class="system-catastrophe" data-cat="${c.color}" data-cat-system="${c.system}" aria-label="${c.color} catastrophe at ${c.name}" ${inputLocked?'disabled':''}>✹ ${c.color} catastrophe · ${c.count}</button>`).join('')}${source?.system===s.id&&!inputLocked?`<div class="ship-actions context-actions ${slot.row>=2?'above':'below'}" aria-label="Selected ship actions"><button data-intent="trade" ${intent==='trade'?'class="active"':''}>Trade</button><button data-intent="discover" ${intent==='discover'?'class="active"':''}>Travel</button><button id="sacrifice" ${legal(state,{type:'sacrifice',...source})?'':'disabled'}>Sacrifice</button><button id="clear">Cancel</button></div>`:''}</article>`;
  }).join('')}
  </div></section><div class="board-overlay">${!choosingMode?playerPlate(0,phase)+playerPlate(1,phase):''}<p id="notice" class="board-notice" role="status" aria-live="polite">${boardNotice()}</p>${botError?'<button id="retry-bot" class="board-retry">Retry Quux Bot</button>':''}${coinIntro(phase)}</div></section>
  <aside class="sidebar" aria-label="Game sidebar">${controls}<section class="bank" aria-label="Piece bank"><div class="bank-heading"><h2>THE BANK</h2><span>${bank.length} PIECES</span></div><p>Click a pyramid to bring it into play.</p>${colors.map(color=>`<div class="bank-color ${color}"><h3>${color}<span>${{red:'CAPTURE',yellow:'MOVE',green:'BUILD',blue:'TRADE'}[color]}</span></h3><div class="bank-row">${sizes.map(size=>{
    const p={color,size},count=bank.filter(b=>b.color===color&&b.size===size).length;
    let available=false;try {available=!inputLocked&&(draft?!!placeSetupPiece({pieces:draft,player:setupPlayer},p):legal(state,bankAction(state,selected,p,source,intent)));} catch { /* Not a legal bank choice. */ }
    return `<button class="bank-piece ${available?'available':''}" data-color="${color}" data-size="${size}" aria-label="Bank ${color} ${size}" ${inputLocked||!count||(draft?draft[setupPlayer].length===3:over)?'disabled':''} title="${color} size ${size}: ${count} available">${pyramid(p)}<span>×${count}</span></button>`;
  }).join('')}</div></div>`).join('')}</section>
  </aside></div>
  <dialog id="result" aria-labelledby="result-title"><p class="result-eyebrow">GAME OVER</p><h2 id="result-title">${over?status:''}</h2><p>${over?outcomeText():''}</p><button id="result-new" class="primary">New game</button><button id="result-close">View final board</button></dialog>
  <dialog id="game-menu"><h2>Mission control</h2><div class="menu-buttons"><button id="reset">New game</button>${draft&&resumeSession&&!choosingMode?'<button id="resume">Resume saved game</button>':''}<button id="help">How to play</button><button id="export" ${draft||botBusy?'disabled':''}>Export save</button><button id="import">Import save</button><button id="resign" ${over||draft||inputLocked?'disabled':''}>Resign</button><button id="draw" ${over||draft||mode==='quux'?'disabled':''}>Agree draw</button><button id="close-menu">Back to space</button></div><input type="file" id="save-file" accept=".json,application/json" hidden><details><summary>Flight log (${log.length})</summary><ol>${log.map(l=>`<li>${escape(l)}</li>`).join('')}</ol></details><p>Your game saves automatically on this device.</p></dialog>
  <dialog id="opponent-picker" aria-labelledby="opponent-title"><p class="result-eyebrow">A NEW EXPEDITION</p><h2 id="opponent-title">Choose your opponent</h2><p>Explore the galaxy with another person, or challenge Quux Bot.</p><div class="opponent-options"><button id="play-local" aria-label="Another player"><strong>Another player</strong><span>Two people on this device</span></button><button id="play-quux" aria-label="Quux Bot"><strong>Quux Bot</strong><span>You command South. The bot commands North.</span></button></div><p class="coin-note">A coin flip chooses who sets up and takes the first turn.</p>${resumeSession&&choosingMode?'<button id="resume">Resume saved game</button>':''}</dialog>
  <dialog id="rules"><h2>Your fleet. Your universe.</h2><p><b>Build:</b> click a system, then the smallest available bank piece of a color you already own there. You need green power.</p><p><b>Travel:</b> click your ship, then a connected system. Systems connect when their stars share no sizes. You need yellow power.</p><p><b>Trade:</b> click your ship, then Trade, then a different bank color of exactly the same size. You need blue power.</p><p><b>Discover a new star:</b> click your ship, Travel, a bank pyramid for the new star. It appears automatically in its star-size row. You need yellow power.</p><p><b>Capture:</b> click an enemy ship. You need red power and an equal or larger ship in that system.</p><p><b>Sacrifice:</b> click your ship, then Sacrifice. Instead of a basic action, gain its pip count in actions of its color anywhere you still have ships.</p><p><b>Catastrophe:</b> whenever any system has four or more pieces of one color, its catastrophe button appears on that system, even if you have no ships there. Count stars and both fleets. The active player may choose to remove that color. If the last star is removed, every ship there is destroyed; a surviving binary-star half protects other colors. Optional and free at any point in your turn.</p><p>Power comes from stars or your own local ships, never enemy ships. Confirm with End turn. An empty or destroyed homeworld loses at turn end. Undo works until you confirm. Systems have fixed positions. Same-size stars share a horizontal row; travel still depends on star sizes, not physical distance.</p><p>Based on Homeworlds Rules13, pp. 4–12. Game: John Cooper. Pyramid system: Andrew Looney. Unofficial implementation.</p><p>Quux Bot: original engine by Arthur O’Dwyer. <a href="./quux-LICENSE.txt" target="_blank" rel="noopener">License</a> · <a href="https://github.com/Quuxplusone/Homeworlds" target="_blank" rel="noopener">Engine source</a>.</p><button id="close-rules">Back to space</button></dialog></main>`;
  bindBoard();bindTools();
  document.querySelector('#play-local')!.addEventListener('click',()=>beginSetup('local'));
  document.querySelector('#play-quux')!.addEventListener('click',()=>beginSetup('quux'));
  document.querySelector('#opponent-picker')!.addEventListener('cancel',event=>event.preventDefault());
  document.querySelector('#retry-bot')?.addEventListener('click',()=>{botError='';render();});
  if(choosingMode)document.querySelector<HTMLDialogElement>('#opponent-picker')!.showModal();
  else if(openDialog&&openDialog!=='opponent-picker')document.querySelector<HTMLDialogElement>('#'+openDialog)?.showModal();
  const space=document.querySelector('#space')!;space.scrollLeft=scroll.left;space.scrollTop=scroll.top;
  scheduleBot();
  if(over&&!draft&&announcedResult!==`${state.turn}:${state.outcome}`){announcedResult=`${state.turn}:${state.outcome}`;document.querySelector<HTMLDialogElement>('#result')!.showModal();}
}
function bindBoard():void {
  const space=document.querySelector<HTMLElement>('#space')!;
  space.addEventListener('click',event=>{
    const target=event.target as Element;
    if(target.closest('.ship-actions,[data-cat]')) return;
    if(draft||locked()) return;
    const shipButton=target.closest<HTMLElement>('[data-ship]');
    if(shipButton) {
      const system=shipButton.dataset.source!,index=Number(shipButton.dataset.ship);
      const ship=state.systems.find(s=>s.id===system)!.ships[index];
      if(ship.owner!==state.player) {act({type:'capture',system,ship:index},`Captured ${ship.color} ship`);return;}
      source={system,ship:index};selected=system;intent='build';
      notice='Ship selected. Click a destination to move, or choose an action beside the ship.';render();return;
    }
    const system=target.closest<HTMLElement>('.system')?.dataset.system;
    if(system) {
      if(source&&source.system!==system&&!target.closest('[data-star]')) act({type:'move',...source,destination:system},'Moved ship');
      else {selected=system;source=null;intent='build';notice='Click a bank pyramid to build here, or select a ship.';render();}
      return;
    }
    source=null;intent='build';render();
  });
  document.querySelectorAll<HTMLElement>('[data-color]').forEach(button=>button.addEventListener('click',()=>chooseBank({color:button.dataset.color as Color,size:Number(button.dataset.size) as Size})));
  document.querySelectorAll<HTMLElement>('[data-intent]').forEach(button=>button.addEventListener('click',()=>{intent=button.dataset.intent as 'trade'|'discover';notice=intent==='trade'?'Click a different bank color of the same size.':'Click a connected system to travel there, or choose a bank star to discover one automatically.';render();}));
  document.querySelector('#clear')?.addEventListener('click',()=>{source=null;intent='build';render();});
  document.querySelector('#sacrifice')?.addEventListener('click',()=>{if(source)act({type:'sacrifice',...source},'Sacrificed ship');});
  document.querySelectorAll<HTMLElement>('[data-cat]').forEach(button=>button.addEventListener('click',()=>act({type:'catastrophe',system:button.dataset.catSystem!,color:button.dataset.cat as Color},`Invoked ${button.dataset.cat} catastrophe`)));
  document.querySelector('#resume')?.addEventListener('click',()=>{if(resumeSession){restore(resumeSession);notice='Your saved game has been restored.';render();revealSystem(selected);}});
}
function bindTools():void {
  const result=document.querySelector<HTMLDialogElement>('#result')!;
  document.querySelector('#result-close')!.addEventListener('click',()=>result.close());
  document.querySelector('#result-new')!.addEventListener('click',chooseNewGame);
  const menu=document.querySelector<HTMLDialogElement>('#game-menu')!;
  const rules=document.querySelector<HTMLDialogElement>('#rules')!;
  document.querySelector('#menu')!.addEventListener('click',()=>menu.showModal());
  document.querySelector('#close-menu')!.addEventListener('click',()=>menu.close());
  document.querySelector('#help')!.addEventListener('click',()=>{menu.close();rules.showModal();});
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
  document.querySelector('#undo')!.addEventListener('click',()=>{if(locked())return;if(draft){draft=undoSetup({pieces:draft,player:setupPlayer}).pieces;notice='Starting piece returned to the bank.';saveSetup();render();return;}const previous=history.pop();if(previous){state=previous.state;mapLayout=previous.layout;log=previous.log;session.actions.length=previous.actionCount;source=null;intent='build';notice='Action undone.';save();render();}});
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
    try {if(file.size>2_000_000)throw Error('Save file is too large.');const imported=decodeSession(await file.text());if(!window.confirm('Replace the current game with this imported save?'))return;menu.close();restore(imported);draft=null;notice='Saved game imported.';save();render();revealSystem(selected);}
    catch(error){menu.close();notice=`Import failed: ${(error as Error).message}`;render();}
  });
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){source=null;intent='build';render();}});
if(introStartedAt!==null)advanceIntro();else {render();if(!choosingMode)revealSystem(selected);}

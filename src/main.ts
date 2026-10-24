import './style.css';
import { colors, sizes, createInitialState, applyAction, legalChoices, type Piece, type Action, type GameState, type Opening, type Color, type Size } from './game';

import {newSession, decodeSession, storageKey, type Session} from './session';

const app = document.querySelector<HTMLDivElement>('#app')!;
let session = newSession();
let state = createInitialState();
let selected = 'north';
let category = 'build';
let notice = 'Player 1: select a system, then choose an action.';
let history: { state: GameState; log: string[]; actionCount: number }[] = [];
let log: string[] = [];
const labels: Record<string, string> = {build: 'Build', trade: 'Trade', move: 'Move', discover: 'Discover', capture: 'Capture', sacrifice: 'Sacrifice', catastrophe: 'Catastrophe'};
function piece(p: Piece, ship = false): string {
  const label = `${p.color} ${['', 'small', 'medium', 'large'][p.size]} ${ship ? 'ship' : 'star'}`;
  return `<span class="piece size-${p.size} ${p.color} ${ship ? 'ship' : ''}" aria-label="${label}" title="${label}"><span aria-hidden="true">▲</span><small>${p.size}</small></span>`;
}
function escape(text: string): string { return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function save(): void {
  try {localStorage.setItem(storageKey, JSON.stringify(session));}
  catch {notice += ' Browser storage unavailable; export a save to keep this game.';}
}
function restore(next: Session): void {
  session = next;
  state = createInitialState(session.opening);
  history = []; log = [];
  session.actions.forEach((action, index) => {
    if (['end', 'resign', 'draw'].includes(action.type)) history = [];
    else history.push({state, log: [...log], actionCount: index});
    log.push(`Turn ${state.turn} · Player ${state.player + 1}: ${action.type}`);
    state = applyAction(state, action);
  });
  selected = state.player === 0 ? 'north' : 'south';
  category = 'build';
}
try {
  const stored = localStorage.getItem(storageKey);
  if (stored) {restore(decodeSession(stored)); notice = 'Your saved game has been restored.';}
} catch {notice = 'The previous save could not be loaded. Start a new game or import a valid save.';}
function setupDialog(): string {
  const colorSelect = (name: string, value: Color) => `<select name="${name}">${colors.map(c => `<option ${c === value ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
  const sizeSelect = (name: string, value: Size) => `<select name="${name}">${sizes.map(size => `<option value="${size}" ${size === value ? 'selected' : ''}>${['','Small','Medium','Large'][size]}</option>`).join('')}</select>`;
  return `<dialog id="setup"><form id="setup-form"><h2>Launch a new game</h2><p>Choose two stars and one large ship per player. Both players can see these choices. Player 1 goes first.</p>${session.opening.map((opening,i) => `<fieldset><legend>Player ${i+1} · ${i === 0 ? 'North' : 'South'}</legend>${opening.stars.map((star,j) => `<div class="setup-row"><label>Star ${j+1} color ${colorSelect(`p${i}s${j}color`,star.color)}</label><label>Star ${j+1} size ${sizeSelect(`p${i}s${j}size`,star.size)}</label></div>`).join('')}<label>Large ship color ${colorSelect(`p${i}ship`,opening.shipColor)}</label></fieldset>`).join('')}<p>Starting a game replaces the current autosave. Export first if you want to keep it.</p><p id="setup-error" role="alert"></p><div class="dialog-buttons"><button type="button" id="cancel-setup">Cancel</button><button type="button" id="suggested">Use suggested opening</button><button class="primary" type="submit">Start game</button></div></form></dialog>`;
}
function act(action: Action, label: string): void {
  try {
    const next = applyAction(state, action);
    if (['end','resign','draw'].includes(action.type)) history = [];
    else history.push({state, log: [...log], actionCount: session.actions.length});
    log.push(`Turn ${state.turn} · Player ${state.player + 1}: ${label}`);
    state = next;
    session.actions.push(action);
    notice = label;
    if (action.type === 'end') {selected = state.player === 0 ? 'north' : 'south'; category = 'build';}
    save();
    if (!state.systems.some(s => s.id === selected)) selected = state.systems[0]?.id ?? '';
    render();
  } catch (error) { notice = (error as Error).message; render(); }
}
function render(): void {
  const choices = legalChoices(state, selected);
  const filtered = choices.filter(c => c.action.type === category);
  const gameOver = state.outcome !== 'playing';
  const status = gameOver ? state.outcome === 'draw' ? 'Game over · Draw' : `Player ${Number(state.outcome) + 1} wins` : `Turn ${state.turn} · Player ${state.player + 1}`;
  const allowance = gameOver ? 'Start a new game to play again.' : state.allowance.sacrificed ? `${state.allowance.remaining} ${state.allowance.color} action(s) remaining. Unused actions may be forfeited.` : state.allowance.remaining ? 'One basic action, or sacrifice a ship. Catastrophes are optional at any time.' : 'Basic action complete. You may invoke catastrophes, undo, or end your turn.';
  app.innerHTML = `<main><header><p class="eyebrow">LOCAL TWO-PLAYER GAME</p><h1>Homeworlds<span>.</span></h1><p class="intro">Two civilizations. One shared universe.</p><div class="status">${status}</div></header>
  <section class="turn-bar" aria-label="Turn controls"><div><strong>${status}</strong><p>${allowance}</p></div><div class="turn-buttons"><button id="undo" ${history.length ? '' : 'disabled'}>Undo action</button><button id="end" class="primary" ${gameOver ? 'disabled' : ''}>${state.allowance.remaining === 1 && !state.allowance.sacrificed ? 'Pass / end turn' : 'End turn'}</button></div></section>
  <section class="board" aria-label="Star map">${state.systems.map(s => `<article class="system ${s.id === selected ? 'selected' : ''}"><div class="system-heading"><span class="player">${s.homeworld === undefined ? 'FRONTIER' : `PLAYER ${s.homeworld + 1}`}</span><span>${s.homeworld === undefined ? 'STAR SYSTEM' : 'HOMEWORLD'}</span></div><h2><button class="select-system" data-system="${s.id}" aria-pressed="${s.id === selected}">${s.name}</button></h2><div class="stars">${s.stars.length ? s.stars.map(p => piece(p)).join('') : '<span>Star destroyed</span>'}</div>${[0,1].map(owner => `<div class="fleet" data-player="${owner}"><span>Player ${owner + 1} fleet</span><div>${s.ships.map((p, index) => p.owner === owner ? `<span class="numbered-ship">${piece(p, true)}<small>#${index + 1}</small></span>` : '').join('') || '<span class="empty">No ships</span>'}</div></div>`).join('')}</article>`).join('')}</section>
  <section class="actions" aria-label="Actions"><p class="eyebrow">ORDERS · ${escape(state.systems.find(s => s.id === selected)?.name ?? '')}</p><div class="action-tabs">${Object.entries(labels).map(([type, label]) => `<button data-category="${type}" aria-pressed="${type === category}">${label} <small>${choices.filter(c => c.action.type === type).length}</small></button>`).join('')}</div><div class="order-form">${filtered.length ? `<label for="order">Legal ${labels[category].toLowerCase()} options</label><select id="order">${filtered.map((c, i) => `<option value="${i}">${escape(c.label)}</option>`).join('')}</select><button id="execute" class="primary">Apply ${labels[category].toLowerCase()}</button>` : `<p>No legal ${labels[category].toLowerCase()} actions here. Select another system or action. Only your own ships and the stars provide local powers.</p>`}</div><p id="notice" role="status" aria-live="polite">${escape(notice)}</p></section>
  <section class="bank"><div><p class="eyebrow">SHARED SUPPLY</p><h2>The bank <small>${state.bank.length} pieces</small></h2></div><div class="bank-grid">${colors.map(color => `<div class="bank-color"><strong class="${color}">${color}</strong>${sizes.map(size => `<div class="bank-slot">${piece({color, size})}<span>× ${state.bank.filter(p => p.color === color && p.size === size).length}</span></div>`).join('')}</div>`).join('')}</div></section>
  <section class="help"><details><summary>How to play</summary><p>Green builds the smallest available ship of a color you already own locally. Blue trades one ship for another color of the same size. Yellow moves or discovers systems with no star sizes in common. Red captures an enemy ship no larger than your largest local ship.</p><p>Instead of a basic action, sacrifice your own ship for its size in actions of its color, anywhere you still have a ship. Four pieces of one color in a system allow an optional catastrophe. End your turn to confirm your orders; an empty or destroyed homeworld loses. Undo is available until you end the turn.</p><p>Pass the device after ending each turn. New game lets you choose your starting pieces. Games save automatically in this browser; Export save creates a portable backup. Importing a save replaces your current game. Resignation awards the other player a win. Agree draw requires both players’ confirmation.</p></details><details><summary>Action history (${log.length})</summary><ol>${log.map(line => `<li>${escape(line)}</li>`).join('')}</ol></details></section>
  <section class="game-tools" aria-label="Game controls"><button id="reset">New game</button><button id="export">Export save</button><button id="import">Import save</button><input type="file" id="save-file" accept=".json,application/json" hidden><button id="resign" ${gameOver ? 'disabled' : ''}>Resign</button><button id="draw" ${gameOver ? 'disabled' : ''}>Agree draw</button></section><footer><p>Local two-player play · Automatic save on this device</p><p>Homeworlds by John Cooper · Pyramid system by Andrew Looney · Unofficial implementation</p></footer>${setupDialog()}</main>`;
  document.querySelectorAll<HTMLButtonElement>('[data-system]').forEach(button => button.addEventListener('click', () => {selected = button.dataset.system!; render();}));
  document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => button.addEventListener('click', () => {category = button.dataset.category!; render();}));
  document.querySelector('#execute')?.addEventListener('click', () => {const choice = filtered[Number(document.querySelector<HTMLSelectElement>('#order')!.value)]; if (choice) act(choice.action, choice.label);});
  document.querySelector('#end')!.addEventListener('click', () => act({type: 'end'}, 'Ended turn'));
  document.querySelector('#undo')!.addEventListener('click', () => {const previous = history.pop(); if (previous) {state = previous.state; log = previous.log; session.actions.length = previous.actionCount; notice = 'Action undone.'; save(); render();}});
  document.querySelector('#resign')!.addEventListener('click', () => {if (window.confirm(`Player ${state.player + 1}: resign and award the other player the win?`)) act({type:'resign'}, `Player ${state.player + 1} resigned`);});
  document.querySelector('#draw')!.addEventListener('click', () => {if (window.confirm('Player 1: do you agree to a draw?') && window.confirm('Player 2: do you also agree to a draw?')) act({type:'draw'}, 'Both players agreed to a draw');});
  document.querySelector('#export')!.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = `homeworlds-turn-${state.turn}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    notice = 'Save exported. You can import it on another device.'; render();
  });
  document.querySelector('#import')!.addEventListener('click', () => document.querySelector<HTMLInputElement>('#save-file')!.click());
  document.querySelector('#save-file')!.addEventListener('change', async event => {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
    try {
      if (file.size > 2_000_000) throw Error('Save file is too large.');
      const imported = decodeSession(await file.text());
      if (!window.confirm('Replace the current game with this imported save?')) return;
      restore(imported); notice = 'Saved game imported.'; save(); render();
    } catch(error) {notice = `Import failed: ${(error as Error).message}`; render();}
  });
  const dialog = document.querySelector<HTMLDialogElement>('#setup')!;
  document.querySelector('#reset')!.addEventListener('click', () => dialog.showModal());
  document.querySelector('#cancel-setup')!.addEventListener('click', () => dialog.close());
  document.querySelector('#suggested')!.addEventListener('click', () => {
    const form = document.querySelector<HTMLFormElement>('#setup-form')!;
    const defaults = newSession().opening;
    defaults.forEach((opening,i) => {opening.stars.forEach((p,j) => {
      (form.elements.namedItem(`p${i}s${j}color`) as HTMLSelectElement).value = p.color;
      (form.elements.namedItem(`p${i}s${j}size`) as HTMLSelectElement).value = String(p.size);
    }); (form.elements.namedItem(`p${i}ship`) as HTMLSelectElement).value = opening.shipColor;});
  });
  document.querySelector('#setup-form')!.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    const opening = [0,1].map(i => ({stars: [0,1].map(j => ({color:data.get(`p${i}s${j}color`) as Color,size:Number(data.get(`p${i}s${j}size`)) as Size})) as Opening['stars'], shipColor:data.get(`p${i}ship`) as Color}));
    try {restore(newSession(opening)); notice = 'New game started.'; save(); render();}
    catch (error) {document.querySelector('#setup-error')!.textContent = (error as Error).message;}
  });
}
render();

// Independent replay using the website's rules reducer (Node >=24).
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import {gunzipSync, zstdDecompressSync} from 'node:zlib';
registerHooks({resolve(specifier, context, nextResolve) {
  if (specifier === './game' && context.parentURL?.endsWith('/src/quux.ts')) {
    return nextResolve('./game.ts', context);
  }
  return nextResolve(specifier, context);
}});
const {applyAction, colors, sizes} = await import('../src/game.ts');
const {quuxActions} = await import('../src/quux.ts');

const color = {r:'red', y:'yellow', g:'green', b:'blue'};
const code = p => p.color[0] + p.size;
function pieces(s) {
  if (!/^(?:[rygb][123])*$/.test(s)) throw Error('Bad piece collection: '+s);
  return (s.match(/../g) ?? []).map(p => ({color:color[p[0]], size:Number(p[1])}));
}
function parseNative(text, player, turn) {
  const systems = [], names = new Map();
  const bank = colors.flatMap(c => sizes.flatMap(size => Array.from({length:3}, () => ({color:c,size}))));
  for (const line of text.trim().split('\n').filter(x=>x.trim())) {
    const m = /^(\w+)\s+\((?:([01]),\s*)?([rygb123]*)\)\s*([rygb123]*)-([rygb123]*)$/.exec(line.trim());
    if (!m) throw Error('Invalid native state line: '+line);
    const [,name,home,stars,p0,p1] = m;
    const id = 'native-'+systems.length;
    names.set(name, 'N'+systems.length);
    const system = {id, name, stars:pieces(stars), ships:[
      ...pieces(p0).map(p=>({...p,owner:0})), ...pieces(p1).map(p=>({...p,owner:1})),
    ]};
    if (home!==undefined) system.homeworld = Number(home);
    for (const p of [...system.stars,...system.ships]) {
      const i = bank.findIndex(q=>code(q)===code(p));
      if (i<0) throw Error('Bank conservation failure');
      bank.splice(i,1);
    }
    systems.push(system);
  }
  return {state:{systems,bank,player,turn,nextSystem:1,allowance:{color:null,remaining:1,sacrificed:false},outcome:'playing'},names};
}
function fingerprint(state,terminal) {
  // The website leaves a defeated, empty homeworld for display. Native
  // application removes empty systems and returns their stars to the bank.
  const bank = state.bank.map(code), systems=[];
  for (const s of state.systems) {
    if (terminal && s.homeworld!==undefined && s.ships.length===0) {
      bank.push(...s.stars.map(code)); continue;
    }
    const star=s.stars.map(code).sort().join('');
    const fleets=[0,1].map(p=>s.ships.filter(x=>x.owner===p).map(code).sort().join(''));
    systems.push([s.homeworld??'-',star,...fleets].join('|'));
  }
  return JSON.stringify([systems.sort(),bank.sort()]);
}
const args=process.argv.slice(2);
const report=args[0]==='--report'?args.splice(0,2)[1]:null;
if (!args.length) throw Error('Usage: node verify_replay.mjs [--report result.json] games.jsonl[.gz|.zst] ...');
const result={files:[],games:0,verified_turns:0,terminal_outcomes:0,failures:[]};
for (const path of args) {
  const buf = fs.readFileSync(path);
  const raw=(path.endsWith('.gz')?gunzipSync(buf):path.endsWith('.zst')?zstdDecompressSync(buf):buf).toString();
  result.files.push(path);
  for (const line of raw.trim().split('\n').filter(Boolean)) {
    const game=JSON.parse(line); result.games++;
    let prev=game.opening, player=game.first, index=0, terminal=false;
    try {
      for (const t of game.turns) {
        index++;
        if (t.player!==player || t.turn!==index) throw Error('Turn sequence mismatch');
        const {state,names}=parseNative(prev,player,index);
        // Preserve all discovered-system names during a multi-action turn,
        // translating only names already present before that turn.
        const move=t.move.replace(/\b\w+\b/g,w=>names.get(w)??w);
        const actions=quuxActions(state,move);
        const actual=actions.reduce(applyAction,state);
        const expected=t.outcome===-1?'playing':t.outcome===2?'draw':t.outcome;
        if (actual.outcome!==expected) throw Error('Terminal outcome mismatch');
        const native=parseNative(t.state,1-player,index+1).state;
        if (fingerprint(actual,expected!=='playing')!==fingerprint(native,expected!=='playing'))
          throw Error('Board or bank inventory mismatch');
        if(expected==='playing' && actual.player!==1-player) throw Error('Side-to-move mismatch');
        if (expected!=='playing') {
          if (index!==game.turns.length || (expected==='draw'?game.status!=='draw':game.status!=='win'||game.winner!==expected))
            throw Error('Transcript outcome mismatch');
          result.terminal_outcomes++;
          terminal=true;
        }
        result.verified_turns++; prev=t.state; player=1-player;
      }
      if ((game.status==='win'||game.status==='draw')!==terminal)
        throw Error('Missing or unexpected terminal turn');
    } catch (e) {
      result.failures.push({path,game:game.game,turn:index,error:String(e.message)});
    }
  }
}
const json=JSON.stringify(result,null,2);
if (report) fs.writeFileSync(report,json+'\n',{flag:'wx'});
console.log(json);
if (result.failures.length) process.exitCode=1;

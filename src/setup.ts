import {colors,sizes,type Piece,type Opening,type Player} from './game';
import type {GameMode} from './match';
export type Setup = [Piece[],Piece[]];
export const setupKey='homeworlds.setup.v1';
export function setupBank(draft:Setup):Piece[] {
 const bank=colors.flatMap(color=>sizes.flatMap(size=>Array.from({length:3},()=>({color,size}))));
 for(const piece of draft.flat()) {
  const i=bank.findIndex(p=>p.color===piece.color&&p.size===piece.size);
  if(i<0)throw Error('That piece is unavailable in the bank.');bank.splice(i,1);
 }
 return bank;
}
export function placeStartingPiece(draft:Setup,piece:Piece):Setup {
 return placeForPlayer(draft,piece,draft[0].length<3?0:1);
}
function placeForPlayer(draft:Setup,piece:Piece,player:Player):Setup {
 if(!colors.includes(piece.color)||!sizes.includes(piece.size))throw Error('Invalid starting piece.');
 if(draft[player].length>=3)throw Error('Both homeworlds are already complete.');
 if(draft[player].length===2&&piece.size!==3)throw Error('Your starting ship must be large. Click a large bank pyramid.');
 const next=structuredClone(draft);next[player].push({...piece});setupBank(next);return next;
}
export function decodeSetup(text:string,starter:Player=0):Setup {
 const value=JSON.parse(text);
 const other=starter===0?1:0;
 if(!Array.isArray(value)||value.length!==2||!value.every(p=>Array.isArray(p)&&p.length<=3)||value[other].length&&value[starter].length!==3)throw Error('Invalid setup.');
 let draft:Setup=[[],[]];
 for(const player of [starter,other]as Player[])for(const piece of value[player])draft=placeForPlayer(draft,piece,player);
 return draft;
}
export function openingFromSetup(draft:Setup):Opening[] {
 if(!draft.every(p=>p.length===3))throw Error('Complete both homeworlds first.');
 return draft.map(p=>({stars:[p[0],p[1]],shipColor:p[2].color}));
}
export interface SetupProgress {pieces:Setup;player:Player;starter?:Player;mode?:GameMode}
export function decodeSetupProgress(text:string):SetupProgress {
 const raw=JSON.parse(text);
 const starter=Array.isArray(raw)?0:raw?.starter??0;
 if(starter!==0&&starter!==1)throw Error('Invalid starting player.');
 if(!Array.isArray(raw)&&raw?.mode!==undefined&&raw.mode!=='local'&&raw.mode!=='quux')throw Error('Invalid game mode.');
 const pieces=decodeSetup(JSON.stringify(Array.isArray(raw)?raw:raw?.pieces),starter);
 const player=Array.isArray(raw)?(pieces[1].length?1:0):raw.player;
 if(player!==0&&player!==1||player===starter&&pieces[1-starter].length>0||player!==starter&&pieces[starter].length!==3)throw Error('Invalid setup confirmation.');
 return {pieces,player,...(!Array.isArray(raw)&&raw.starter!==undefined?{starter}:{}),...(!Array.isArray(raw)&&raw.mode!==undefined?{mode:raw.mode}:{})};
}
export function placeSetupPiece(progress:SetupProgress,piece:Piece):SetupProgress {
 if(progress.pieces[progress.player].length===3)throw Error('Review your homeworld and click End turn to confirm.');
 return {...progress,pieces:placeForPlayer(progress.pieces,piece,progress.player)};
}
export function confirmSetup(progress:SetupProgress):SetupProgress|null {
 if(progress.pieces[progress.player].length!==3)throw Error('Choose two stars and one large ship before ending setup.');
 return progress.player===(progress.starter??0)?{...progress,pieces:structuredClone(progress.pieces),player:(1-progress.player)as Player}:null;
}
export function undoSetup(progress:SetupProgress):SetupProgress {
 if(!progress.pieces[progress.player].length)throw Error('The other player’s confirmed setup cannot be changed.');
 const next=structuredClone(progress);next.pieces[next.player].pop();return next;
}

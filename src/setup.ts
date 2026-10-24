import {colors,sizes,type Piece,type Opening} from './game';
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
 if(!colors.includes(piece.color)||!sizes.includes(piece.size))throw Error('Invalid starting piece.');
 const player=draft[0].length<3?0:1;
 if(draft[player].length>=3)throw Error('Both homeworlds are already complete.');
 if(draft[player].length===2&&piece.size!==3)throw Error('Your starting ship must be large. Click a large bank pyramid.');
 const next=structuredClone(draft);next[player].push({...piece});setupBank(next);return next;
}
export function decodeSetup(text:string):Setup {
 const value=JSON.parse(text);
 if(!Array.isArray(value)||value.length!==2||!value.every(p=>Array.isArray(p)&&p.length<=3)||value[1].length&&value[0].length!==3)throw Error('Invalid setup.');
 let draft:Setup=[[],[]];
 for(const piece of value.flat())draft=placeStartingPiece(draft,piece);
 return draft;
}
export function openingFromSetup(draft:Setup):Opening[] {
 if(!draft.every(p=>p.length===3))throw Error('Complete both homeworlds first.');
 return draft.map(p=>({stars:[p[0],p[1]],shipColor:p[2].color}));
}
export interface SetupProgress {pieces:Setup;player:0|1}
export function decodeSetupProgress(text:string):SetupProgress {
 const raw=JSON.parse(text);
 const pieces=decodeSetup(JSON.stringify(Array.isArray(raw)?raw:raw?.pieces));
 const player=Array.isArray(raw)?(pieces[1].length?1:0):raw.player;
 if(player!==0&&player!==1||player===0&&pieces[1].length>0||player===1&&pieces[0].length!==3)throw Error('Invalid setup confirmation.');
 return {pieces,player};
}
export function placeSetupPiece(progress:SetupProgress,piece:Piece):SetupProgress {
 if(progress.pieces[progress.player].length===3)throw Error('Review your homeworld and click End turn to confirm.');
 return {...progress,pieces:placeStartingPiece(progress.pieces,piece)};
}
export function confirmSetup(progress:SetupProgress):SetupProgress|null {
 if(progress.pieces[progress.player].length!==3)throw Error('Choose two stars and one large ship before ending setup.');
 return progress.player===0?{pieces:structuredClone(progress.pieces),player:1}:null;
}
export function undoSetup(progress:SetupProgress):SetupProgress {
 if(!progress.pieces[progress.player].length)throw Error('The other player’s confirmed setup cannot be changed.');
 const next=structuredClone(progress);next.pieces[next.player].pop();return next;
}

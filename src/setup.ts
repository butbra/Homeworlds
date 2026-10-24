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
 if(draft[1].length===3)throw Error('Setup is already complete.');return draft;
}
export function openingFromSetup(draft:Setup):Opening[] {
 if(!draft.every(p=>p.length===3))throw Error('Complete both homeworlds first.');
 return draft.map(p=>({stars:[p[0],p[1]],shipColor:p[2].color}));
}

import type {Piece,Size} from './game';
import {placeSetupPiece,type SetupProgress} from './setup';

export interface StartingRecommendation {id:string;name:string;pieces:[Piece,Piece,Piece];summary:string;connection:Size}
// Rules13 pp. 4, 20–22. Beginner recommendations, not a solved opening ranking.
export const startingRecommendations:StartingRecommendation[]=[
  {id:'goldilocks',name:'Goldilocks',pieces:[{color:'red',size:1},{color:'blue',size:3},{color:'green',size:3}],connection:2,summary:'Small red + large blue stars. A balanced first game with medium-star travel routes.'},
  {id:'banker',name:'Banker',pieces:[{color:'red',size:2},{color:'blue',size:1},{color:'green',size:3}],connection:3,summary:'Medium red + small blue stars. Opens routes to large stars and opportunities to grow your economy.'},
  {id:'fortress',name:'Fortress',pieces:[{color:'red',size:2},{color:'blue',size:3},{color:'green',size:3}],connection:1,summary:'Medium red + large blue stars. Invaders must approach through small stars, which can become scarce.'},
  {id:'explorer',name:'Explorer',pieces:[{color:'blue',size:1},{color:'yellow',size:2},{color:'green',size:3}],connection:3,summary:'Small blue + medium yellow stars. Adds immediate travel power instead of a red star’s capture power.'},
];
const same=(a:Piece,b:Piece)=>a.color===b.color&&a.size===b.size;
const pair=(pieces:Piece[])=>pieces.slice(0,2).map(p=>p.size).sort().join(',');

/** Replace only the active player's unconfirmed pieces, using actual setup
 * transactions so the confirmed opponent and bank limits remain authoritative. */
export function useStartingRecommendation(progress:SetupProgress,id:string):SetupProgress {
  const recommendation=startingRecommendations.find(r=>r.id===id);
  if(!recommendation)throw Error('Unknown starting recommendation.');
  let next=structuredClone(progress);next.pieces[next.player]=[];
  for(const piece of recommendation.pieces)next=placeSetupPiece(next,piece);
  return next;
}
export function recommendedStart(progress:SetupProgress):StartingRecommendation|undefined {
  const selected=progress.pieces[progress.player];
  const opponent=progress.pieces[1-progress.player];
  const fits=startingRecommendations.filter(r=>{
    const remaining=[...r.pieces.slice(0,2)];
    for(const p of selected.slice(0,2)) {const i=remaining.findIndex(q=>same(p,q));if(i<0)return false;remaining.splice(i,1);}
    if(selected[2]&&!same(selected[2],r.pieces[2]))return false;
    try {useStartingRecommendation(progress,r.id);return true;}catch{return false;}
  });
  return fits.find(r=>opponent.length<2||pair(r.pieces)!==pair(opponent))??fits[0];
}
export function nextRecommendedPiece(progress:SetupProgress):Piece|undefined {
  const selected=progress.pieces[progress.player],recommendation=recommendedStart(progress);
  if(!recommendation||selected.length===3)return;
  if(selected.length===2)return recommendation.pieces[2];
  const remaining=[...recommendation.pieces.slice(0,2)];
  for(const p of selected){const i=remaining.findIndex(q=>same(p,q));if(i>=0)remaining.splice(i,1);}
  return remaining[0];
}
export function startingWarnings(progress:SetupProgress):string[] {
  const selected=progress.pieces[progress.player],warnings:string[]=[];
  if(selected.length===3) {
    const colors=new Set(selected.map(p=>p.color));
    if(!colors.has('green'))warnings.push('No green power to build. A large green starting ship makes learning easier.');
    if(!colors.has('blue'))warnings.push('No blue power to trade into new colors. A blue star makes learning easier.');
    if(colors.size<3)warnings.push('Repeating colors gives you fewer powers. Try three different starting colors.');
  }
  if(selected.length>=2) {
    if(selected[0].size===selected[1].size)warnings.push('Same-size stars are legal, but create a smaller, trickier map. Try two different sizes.');
    const opponent=progress.pieces[1-progress.player];
    if(opponent.length>=2&&pair(selected)===pair(opponent))warnings.push('Your star sizes match Quux’s, creating a cramped map. Try a different size pair for your first game.');
  }
  return warnings;
}

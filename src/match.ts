import type {Player} from './game';
export type GameMode = 'local' | 'quux' | 'practice';
export const isBotMode=(mode:GameMode):boolean=>mode==='quux'||mode==='practice';
export const validDifficulty=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=10;
export const difficultyLabel=(level:number):string=>level===10?'Full strength':level>=8?'Challenging':level>=5?'Casual':'Learning';
export const humanPlayer:Player=1;
export const quuxPlayer:Player=0;
/** A fresh coin flip is made once per match, then persisted with setup and saves. */
export function randomStarter():Player {
  const byte=new Uint8Array(1);crypto.getRandomValues(byte);
  return (byte[0]&1) as Player;
}

import type {Player} from './game';
export type GameMode = 'local' | 'quux';
export const humanPlayer:Player=1;
export const quuxPlayer:Player=0;
/** A fresh coin flip is made once per match, then persisted with setup and saves. */
export function randomStarter():Player {
  const byte=new Uint8Array(1);crypto.getRandomValues(byte);
  return (byte[0]&1) as Player;
}

export const nameEntranceMs=450;
export const coinRevealMs=5000;
export const introCompleteMs=6100;
export type IntroPhase='names'|'flipping'|'revealed'|'complete';
export function introPhase(startedAt:number,now:number):IntroPhase {
  const elapsed=Math.max(0,now-startedAt);
  return elapsed<nameEntranceMs?'names':elapsed<coinRevealMs?'flipping':elapsed<introCompleteMs?'revealed':'complete';
}
export function nextIntroBoundary(startedAt:number,now:number):number {
  const elapsed=Math.max(0,now-startedAt);
  return [nameEntranceMs,coinRevealMs,introCompleteMs].find(time=>time>elapsed)??introCompleteMs;
}

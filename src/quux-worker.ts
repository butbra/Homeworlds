import wasmUrl from '../vendor/quux/quux.wasm?url';
import {QuuxRuntime} from './quux-runtime';
const engine=fetch(wasmUrl).then(async response=>{
  if(!response.ok)throw Error('Could not load Quux Bot.');
  return QuuxRuntime.create(await response.arrayBuffer());
});
self.addEventListener('message',async(event:MessageEvent<{kind:'move'|'setup'|'coach'|'guide';text:string;player:number;seed:number;difficulty:number}>)=>{
  try {const runtime=await engine;const {kind,text,player,seed,difficulty}=event.data;self.postMessage({ok:true,result:runtime.call(kind,text,player,seed,difficulty)});}
  catch(error){self.postMessage({ok:false,error:(error as Error).message});}
});

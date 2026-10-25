import wasmUrl from '../vendor/quux/quux.wasm?url';
import {QuuxRuntime} from './quux-runtime';
const engine=fetch(wasmUrl).then(async response=>{
  if(!response.ok)throw Error('Could not load Quux Bot.');
  return QuuxRuntime.create(await response.arrayBuffer());
});
self.addEventListener('message',async(event:MessageEvent<{kind:'move'|'setup';text:string;player:number;seed:number}>)=>{
  try {const runtime=await engine;const {kind,text,player,seed}=event.data;self.postMessage({ok:true,result:runtime.call(kind,text,player,seed)});}
  catch(error){self.postMessage({ok:false,error:(error as Error).message});}
});

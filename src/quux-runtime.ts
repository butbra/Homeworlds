/** Small WASI host for the original C++ engine. No files or network are exposed. */
export class QuuxRuntime {
  private instance!:WebAssembly.Instance;
  static async create(bytes:BufferSource):Promise<QuuxRuntime> {
    const runtime=new QuuxRuntime();
    const memory=()=>new DataView((runtime.instance.exports.memory as WebAssembly.Memory).buffer);
    const wasi={
      fd_write:(_fd:number,iovs:number,count:number,written:number)=>{const data=memory();let total=0;for(let i=0;i<count;i++)total+=data.getUint32(iovs+i*8+4,true);data.setUint32(written,total,true);return 0;},
      fd_close:()=>0,
      fd_seek:()=>8,
      fd_fdstat_get:(_fd:number,ptr:number)=>{const data=memory();for(let i=0;i<24;i++)data.setUint8(ptr+i,0);data.setUint8(ptr,2);return 0;},
      fd_read:(_fd:number,_iovs:number,_count:number,read:number)=>{memory().setUint32(read,0,true);return 0;},
      fd_prestat_get:()=>8,
      environ_sizes_get:(count:number,size:number)=>{memory().setUint32(count,0,true);memory().setUint32(size,0,true);return 0;},
      environ_get:()=>0,
      args_sizes_get:(count:number,size:number)=>{memory().setUint32(count,0,true);memory().setUint32(size,0,true);return 0;},
      args_get:()=>0,
      clock_time_get:(clock:number,_precision:bigint,ptr:number)=>{const now=clock===0?Date.now():performance.now();memory().setBigUint64(ptr,BigInt(Math.floor(now*1e6)),true);return 0;},
      clock_res_get:(_clock:number,ptr:number)=>{memory().setBigUint64(ptr,1000000n,true);return 0;},
      random_get:(ptr:number,length:number)=>{const bytes=new Uint8Array((runtime.instance.exports.memory as WebAssembly.Memory).buffer);for(let i=0;i<length;i+=65536)crypto.getRandomValues(bytes.subarray(ptr+i,ptr+Math.min(length,i+65536)));return 0;},
      proc_exit:(code:number)=>{throw Error(`Quux Bot stopped (code ${code}).`);},
    };
    const result=await WebAssembly.instantiate(bytes,{wasi_snapshot_preview1:wasi});
    runtime.instance=result.instance;
    (runtime.instance.exports._initialize as ()=>void)();
    return runtime;
  }
  call(kind:'move'|'setup',text:string,player:number,seed=0):string {
    const exports=this.instance.exports;
    const input=new TextEncoder().encode(text+'\0');
    const pointer=(exports.malloc as (size:number)=>number)(input.length);
    if(!pointer)throw Error('Quux Bot ran out of memory.');
    try {
      new Uint8Array((exports.memory as WebAssembly.Memory).buffer).set(input,pointer);
      const fn=exports[kind==='move'?'choose_move':'choose_setup']as (ptr:number,player:number,seed:number)=>number;
      const output=fn(pointer,player,seed);
      const bytes=new Uint8Array((exports.memory as WebAssembly.Memory).buffer);
      const end=bytes.indexOf(0,output);
      if(end<output||end-output>50000)throw Error('Quux Bot returned an invalid response.');
      const result=new TextDecoder().decode(bytes.subarray(output,end));
      if(result.startsWith('ERROR:'))throw Error(result.slice(6).trim());
      return result;
    } finally {(exports.free as (ptr:number)=>void)(pointer);}
  }
}

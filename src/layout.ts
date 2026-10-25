import {type Action,type GameState,type Opening,type Size} from './game';
export interface Slot {row:number;column:number}
export interface MapLayout {slots:Record<string,Slot>;sizeRows:Record<Size,number>}
/** Rules13 p12: put connected star sizes nearest their starting homeworld. */
export function createLayout(opening?:Opening[]):MapLayout {
  const orders:Size[][]=[[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]];
  const cost=(order:Size[])=>order.reduce((total,size,index)=>{
    if(!opening)return total;
    const north=!opening[0].stars.some(p=>p.size===size),south=!opening[1].stars.some(p=>p.size===size),row=index+1;
    return total+(north&&south?Math.abs(row-2)*10:north?row*10:south?(4-row)*10:Math.abs(row-2)*3);
  },0);
  const order=orders.reduce((best,next)=>cost(next)<cost(best)?next:best);
  const sizeRows=Object.fromEntries(order.map((size,index)=>[size,index+1]))as Record<Size,number>;
  return {slots:{north:{row:0,column:0},south:{row:4,column:0}},sizeRows};
}
/** Stable slots: new discoveries fill the closest free column in their size row. */
export function layoutAfter(previous:MapLayout,before:GameState,action:Action,after:GameState):MapLayout {
  const slots={...previous.slots};
  if(action.type==='discover'){
    const row=previous.sizeRows[action.star.size],origin=slots[action.system]?.column??0;
    const occupied=new Set(Object.values(slots).filter(slot=>slot.row===row).map(slot=>slot.column));
    let column=origin;
    for(let radius=1;occupied.has(column);radius++){
      const direction=before.player===0?-1:1;
      column=[origin+direction*radius,origin-direction*radius].find(c=>!occupied.has(c))??origin;
    }
    slots[`system-${before.nextSystem}`]={row,column};
  }
  const present=new Set(after.systems.map(s=>s.id));
  for(const id of Object.keys(slots))if(id!=='north'&&id!=='south'&&!present.has(id))delete slots[id];
  return {sizeRows:previous.sizeRows,slots};
}
export function layoutBounds(layout:MapLayout):{minColumn:number;columns:number} {
  const columns=Object.values(layout.slots).map(slot=>slot.column);
  const minColumn=Math.min(0,...columns),maxColumn=Math.max(0,...columns);
  return {minColumn,columns:maxColumn-minColumn+1};
}

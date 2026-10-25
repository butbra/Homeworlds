/** Fit every fixed map slot inside the board; never create a scrollable surface. */
export function fitBoard(space:HTMLElement):void {
 const map=space.querySelector<HTMLElement>('#universe');
 if(!map||!space.clientWidth||!space.clientHeight)return;
 map.style.minWidth='0px';map.style.minHeight='0px';
 const scale=Math.min(1,space.clientWidth/map.offsetWidth,space.clientHeight/map.offsetHeight);
 map.style.setProperty('--board-scale',String(scale));
 // Spread the rows over the available height even when width limits the scale.
 map.style.minWidth=`${space.clientWidth/scale}px`;
 map.style.minHeight=`${space.clientHeight/scale}px`;

 // Keep action controls at their normal size, anchored to the scaled system.
 const board=space.parentElement!,menu=board.querySelector<HTMLElement>('.ship-actions');
 if(!menu)return;
 const selected=map.querySelector<HTMLElement>('.system.selected');
 if(!selected)return;
 const frame=board.getBoundingClientRect(),target=selected.getBoundingClientRect();
 const width=menu.offsetWidth,height=menu.offsetHeight;
 const below=target.bottom-frame.top+8,above=target.top-frame.top-height-8;
 const preferred=Number(selected.dataset.mapRow)>=2?above:below;
 const top=preferred<8?below:preferred+height>frame.height-8?above:preferred;
 menu.style.left=`${Math.max(8,Math.min(frame.width-width-8,target.x-frame.x+(target.width-width)/2))}px`;
 menu.style.top=`${Math.max(8,Math.min(frame.height-height-8,top))}px`;
}

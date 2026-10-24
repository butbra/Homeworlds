import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const bank=(page:Page,color:string,size:number)=>page.getByRole('button',{name:`Bank ${color} ${size}`,exact:true});
const ship=(page:Page,color:string,size:number,home='North',owner=1)=>page.getByRole('button',{name:`Player ${owner} ${color} ship ${size} at ${home} homeworld`,exact:true});
const menu=async(page:Page)=>page.getByRole('button',{name:'Game menu'}).click();
const newGame=async(page:Page)=>{await menu(page);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'New game',exact:true}).click();};
const chooseOpening=async(page:Page)=>{for(const picks of [[['blue',3],['red',1],['green',3]],[['red',2],['blue',1],['green',3]]] as const){for(const [color,size] of picks)await bank(page,color,size).click();await page.getByRole('button',{name:'End turn',exact:true}).click();}};
const resume=async(page:Page)=>{await page.getByRole('button',{name:'Resume saved game'}).click();};
test.beforeEach(async({page},info)=>{await page.goto('/');if(!info.title.startsWith('fresh')&&!info.title.startsWith('custom setup'))await chooseOpening(page);});
test('bank clicks build, undo and reload preserve the physical game',async({page})=>{
 await bank(page,'green',3).click();
 await expect(page.getByRole('status')).toContainText('smallest');
 await bank(page,'green',1).click();
 await expect(ship(page,'green',1)).toBeVisible();
 await page.reload();await resume(page);
 await expect(ship(page,'green',1)).toBeVisible();
 await page.getByRole('button',{name:'Undo action'}).click();
 await expect(ship(page,'green',1)).toHaveCount(0);
 await bank(page,'green',1).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('.status')).toContainText('Player 2');
 await expect(page.getByRole('button',{name:'Undo action'})).toBeDisabled();
 await bank(page,'green',1).click();
 await expect(ship(page,'green',1,'South',2)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('ship and bank clicks trade, discover in empty space, move and sacrifice',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await bank(page,'green',1).click();await page.getByRole('button',{name:'End turn',exact:true}).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await ship(page,'green',1).click();await page.getByRole('button',{name:'Trade → bank',exact:true}).click();
 await bank(page,'yellow',3).click();await expect(page.getByRole('status')).toContainText('same size');
 await bank(page,'yellow',1).click();await expect(ship(page,'yellow',1)).toBeVisible();
 await page.getByRole('button',{name:'End turn',exact:true}).click();await page.getByRole('button',{name:'End turn',exact:true}).click();
 await ship(page,'yellow',1).click();await page.getByRole('button',{name:'Discover → bank → space',exact:true}).click();
 await bank(page,'red',1).click();await expect(page.getByRole('status')).toContainText('no sizes in common');
 await bank(page,'red',2).click();
 // Place near center on desktop; the map pans horizontally on phones.
 const universe=page.locator('#universe'),box=await universe.boundingBox();await universe.click({position:{x:box!.width*.5,y:box!.height*.5}});
 await expect(page.locator('.system')).toHaveCount(3);
 await expect(page.getByRole('button',{name:'Player 1 yellow ship 1 at Frontier 1'})).toBeVisible();
 await page.getByRole('button',{name:'End turn',exact:true}).click();await page.getByRole('button',{name:'End turn',exact:true}).click();
 await page.getByRole('button',{name:'Player 1 yellow ship 1 at Frontier 1'}).click();
 await page.getByRole('button',{name:'Select North homeworld'}).click();
 await expect(page.locator('.system')).toHaveCount(2);
 await expect(ship(page,'yellow',1)).toBeVisible();
 await page.getByRole('button',{name:'End turn',exact:true}).click();await page.getByRole('button',{name:'End turn',exact:true}).click();
 await ship(page,'yellow',1).click();await page.getByRole('button',{name:'Sacrifice ship',exact:true}).click();
 await expect(ship(page,'yellow',1)).toHaveCount(0);
 expect(errors).toEqual([]);
});
test('custom setup places homeworld stars and ships by clicking the bank',async({page})=>{

 await bank(page,'blue',3).click();await bank(page,'red',1).click();
 await bank(page,'green',1).click();await expect(page.getByRole('status')).toContainText('must be large');
 await bank(page,'yellow',3).click();await page.getByRole('button',{name:'End turn',exact:true}).click();
 await bank(page,'red',2).click();await bank(page,'blue',1).click();await bank(page,'green',3).click();await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(ship(page,'yellow',3)).toBeVisible();await expect(page.locator('.status')).toContainText('Player 1');
 await page.reload();await resume(page);await expect(ship(page,'yellow',3)).toBeVisible();
 await newGame(page);await chooseOpening(page);
 await expect(ship(page,'green',3)).toBeVisible();
});
test('portable saves export, validate, and import',async({page})=>{
 await bank(page,'green',1).click();await menu(page);
 const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Export save'}).click();
 const file=await promise;const data=await readFile((await file.path())!);
 expect(JSON.parse(data.toString()).actions).toHaveLength(1);
 await page.getByRole('button',{name:'Undo action'}).click();await menu(page);
 page.once('dialog',d=>d.accept());
 await page.locator('#save-file').setInputFiles({name:'save.json',mimeType:'application/json',buffer:data});
 await expect(ship(page,'green',1)).toBeVisible();
 await menu(page);await page.locator('#save-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});
 await expect(page.getByRole('status')).toContainText('Import failed');await expect(ship(page,'green',1)).toBeVisible();
});
test('resignation and mutual draws require confirmation',async({page})=>{
 await menu(page);page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Resign',exact:true}).click();
 await expect(page.locator('.status')).toContainText('Turn 1');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Resign',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Player 2 wins',exact:true})).toBeVisible();await page.getByRole('button',{name:'View final board'}).click();
 await expect(page.locator('.status')).toHaveText('Player 2 wins');await page.reload();await resume(page);await expect(page.locator('.status')).toHaveText('Player 2 wins');await page.getByRole('button',{name:'View final board'}).click();
 await newGame(page);await chooseOpening(page);await menu(page);
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Agree draw'}).click();
 await expect(page.locator('.status')).toHaveText('Game over · Draw');
});
test('map can be rearranged without consuming an action',async({page})=>{
 const card=page.locator('[data-system="north"]'),handle=page.getByRole('button',{name:'Reposition North homeworld'});
 const before=await card.getAttribute('style');await handle.focus();await page.keyboard.press('ArrowDown');
 expect(await card.getAttribute('style')).not.toBe(before);await page.reload();await resume(page);
 await expect(page.locator('.status')).toContainText('Turn 1');
 await bank(page,'green',1).click();await expect(ship(page,'green',1)).toBeVisible();
});
test('enemy ship clicks capture with local red power',async({page})=>{
 const saved={version:1,opening:[{stars:[{color:'red',size:1},{color:'yellow',size:2}],shipColor:'green'},{stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'}],actions:[
  {type:'build',system:'north',color:'green'},{type:'end'},
  {type:'build',system:'south',color:'green'},{type:'end'},
  {type:'discover',system:'north',ship:1,star:{color:'yellow',size:3}},{type:'end'},{type:'end'},
  {type:'move',system:'system-1',ship:0,destination:'south'},{type:'end'},
 ]};
 await page.evaluate(value=>localStorage.setItem('homeworlds.session.v1',JSON.stringify(value)),saved);await page.reload();await resume(page);
 const enemy=ship(page,'green',1,'South',1);await expect(enemy).toBeVisible();await enemy.click();
 await expect(enemy).toHaveCount(0);await expect(ship(page,'green',1,'South',2)).toHaveCount(2);
 await expect(page.getByRole('status')).toContainText('Captured');
});
test('click a star to invoke a free catastrophe after a basic action',async({page})=>{
 const saved={version:1,opening:[{stars:[{color:'green',size:1},{color:'blue',size:3}],shipColor:'green'},{stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'}],actions:[
  {type:'build',system:'north',color:'green'},{type:'end'},{type:'end'},
  {type:'build',system:'north',color:'green'},
 ]};
 await page.evaluate(value=>localStorage.setItem('homeworlds.session.v1',JSON.stringify(value)),saved);await page.reload();await resume(page);
 await page.getByRole('button',{name:'North homeworld green star 1'}).click();
 await page.getByRole('button',{name:'green catastrophe at North homeworld'}).click();
 await expect(ship(page,'green',3)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'North homeworld blue star 3'})).toBeVisible();
 await page.getByRole('button',{name:'End turn',exact:true}).click();await expect(page.locator('.status')).toHaveText('Player 2 wins');
});

test('fresh visits open empty, resume is explicit, and partial setup survives reload',async({page})=>{
 await expect(page.locator('.system')).toHaveCount(0);
 await expect(page.locator('.bank-heading')).toContainText('36 PIECES');
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeDisabled();
 await bank(page,'red',1).click();await page.reload();
 await expect(page.getByRole('button',{name:'North homeworld red star 1'})).toBeVisible();
 await expect(page.locator('.system')).toHaveCount(1);
 await page.getByRole('button',{name:'Undo action'}).click();
 await expect(page.locator('.system')).toHaveCount(0);
 await chooseOpening(page);await page.reload();
 await expect(page.locator('.system')).toHaveCount(0);
 await resume(page);await expect(page.locator('.system')).toHaveCount(2);
});
test('fresh viewport uses bottom space for the board and shows the entire bank',async({page})=>{
 for(const size of [{width:1366,height:768},{width:1920,height:900},{width:390,height:844},{width:375,height:667}]) {
  await page.setViewportSize(size);
  const bounds=await page.locator('#space').boundingBox();
  expect(Math.abs(bounds!.y+bounds!.height-size.height)).toBeLessThan(2);
  const commands=await page.locator('.command-bar').boundingBox();
  expect(commands!.x).toBeGreaterThanOrEqual(bounds!.x+bounds!.width-1);
  for(const piece of await page.locator('.bank-piece').all()) {
   const box=await piece.boundingBox();expect(box!.y).toBeGreaterThan(0);expect(box!.y+box!.height).toBeLessThanOrEqual(size.height);
  }
  expect(await page.locator('.bank').evaluate(e=>e.scrollHeight<=e.clientHeight+1)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
test('remote catastrophes are available during ship selection and animate without spending an action',async({page})=>{
 const saved={version:1,opening:[{stars:[{color:'red',size:1},{color:'blue',size:2}],shipColor:'green'},{stars:[{color:'green',size:1},{color:'blue',size:3}],shipColor:'green'}],actions:[
  {type:'end'},{type:'build',system:'south',color:'green'},{type:'end'},
  {type:'end'},{type:'build',system:'south',color:'green'},{type:'end'},
 ]};
 await page.evaluate(value=>localStorage.setItem('homeworlds.session.v1',JSON.stringify(value)),saved);await page.reload();await resume(page);
 await ship(page,'green',3).click();
 await page.getByRole('button',{name:'green catastrophe at South homeworld'}).click();
 await expect(page.locator('.catastrophe-ring')).toHaveCount(1);
 await expect(page.locator('.explosion-core')).toHaveCount(1);
 await expect(ship(page,'green',3,'South',2)).toHaveCount(0);
 await expect(page.locator('.turn-token strong')).toHaveText('1');
 await expect(page.locator('.catastrophe-ring')).toHaveCount(0);
 await page.getByRole('button',{name:'End turn',exact:true}).click();await expect(page.locator('.status')).toHaveText('Player 1 wins');
});
test('fresh reduced-motion preference disables action effects',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await chooseOpening(page);
 await bank(page,'green',1).click();await expect(ship(page,'green',1)).toBeVisible();
 expect(await page.evaluate(()=>document.getAnimations().length)).toBe(0);
});

test('fresh setup requires separate confirmation and preserves each player review',async({page})=>{
 for(const [color,size] of [['red',1],['blue',3],['green',3]] as const)await bank(page,color,size).click();
 await expect(page.locator('.status')).toHaveText('Player 1 · Setup');
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeEnabled();
 await expect(bank(page,'yellow',3)).toBeDisabled();
 await page.reload();await expect(page.locator('.status')).toHaveText('Player 1 · Setup');
 await page.getByRole('button',{name:'Undo action'}).click();await bank(page,'yellow',3).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Player 2 · Setup');
 await expect(page.getByRole('button',{name:'Undo action'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeDisabled();
 for(const [color,size] of [['red',2],['blue',1],['green',3]] as const)await bank(page,color,size).click();
 await expect(page.locator('.status')).toHaveText('Player 2 · Setup');
 await page.reload();await expect(page.locator('.status')).toHaveText('Player 2 · Setup');
 await page.getByRole('button',{name:'Undo action'}).click();await bank(page,'red',3).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Turn 1 · Player 1');
 await expect(ship(page,'yellow',3)).toBeVisible();await expect(ship(page,'red',3,'South',2)).toBeVisible();
});
test('game over announces the winner and reason, locks play, and can start over',async({page})=>{
 await menu(page);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Resign',exact:true}).click();
 const result=page.locator('#result');await expect(result).toBeVisible();
 await expect(result.getByRole('heading')).toHaveText('Player 2 wins');await expect(result).toContainText('Player 1 resigned');
 await result.getByRole('button',{name:'View final board'}).click();
 await expect(page.locator('.result-banner')).toContainText('Player 2 wins');
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeDisabled();await expect(bank(page,'green',1)).toBeDisabled();
 await page.reload();await resume(page);await expect(page.locator('#result')).toBeVisible();
 await page.getByRole('button',{name:'New local game'}).click();await expect(page.locator('.system')).toHaveCount(0);
});

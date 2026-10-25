import {expect,test,type Page} from '@playwright/test';
const bank=(page:Page,color:string,size:number)=>page.getByRole('button',{name:`Bank ${color} ${size}`,exact:true});
async function coin(page:Page,bit:0|1){
 await page.addInitScript(value=>{
  const original=crypto.getRandomValues.bind(crypto);
  Object.defineProperty(crypto,'getRandomValues',{value:(array:ArrayBufferView)=>{if(array instanceof Uint8Array&&array.byteLength===1){array[0]=value;return array;}return original(array);}});
 },bit);
}
async function home(page:Page){for(const [color,size]of [['blue',3],['red',1],['green',3]]as const)await bank(page,color,size).click();await page.getByRole('button',{name:'End turn',exact:true}).click();}

test('opponent chooser offers a person or the real Quux Bot',async({page})=>{
 await coin(page,0);await page.goto('/');
 await expect(page.getByRole('heading',{name:'Choose your opponent'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Another player',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Quux Bot',exact:true}).click();await home(page);
 await expect(page.locator('.status')).toHaveText('Turn 1 · You');
 await expect(page.locator('.match-info')).toContainText('You vs Quux Bot');
 await expect(page.locator('[data-system="south"] .fleet[data-player="1"] .piece-button')).toHaveCount(1);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await bank(page,'green',1).click();await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeDisabled();
 await expect(bank(page,'green',1)).toBeDisabled();
 await expect(page.locator('.status')).toHaveText('Turn 3 · You');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('homeworlds.session.v1')!));
 expect(saved).toMatchObject({mode:'quux',starter:0});expect(saved.actions.length).toBeGreaterThanOrEqual(4);
 await page.reload();await page.getByRole('button',{name:'Resume saved game'}).click();
 await expect(page.locator('.status')).toHaveText('Turn 3 · You');
 await page.getByRole('button',{name:'Game menu'}).click();
 await expect(page.getByRole('button',{name:'Agree draw'})).toBeDisabled();
 expect(errors).toEqual([]);
});

test('South can set up and move first in a local game and reload keeps the coin flip',async({page})=>{
 await coin(page,1);await page.goto('/');await page.getByRole('button',{name:'Another player',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Player 2 · Setup');await home(page);
 await expect(page.locator('.status')).toHaveText('Player 1 · Setup');await home(page);
 await expect(page.locator('.status')).toHaveText('Turn 1 · Player 2');
 await page.reload();await page.getByRole('button',{name:'Resume saved game'}).click();
 await expect(page.locator('.status')).toHaveText('Turn 1 · Player 2');
 await bank(page,'green',1).click();
 await expect(page.getByRole('button',{name:'Player 2 green ship 1 at South homeworld',exact:true})).toBeVisible();
});

test('randomized bot-first setup automatically leads to its first gameplay turn',async({page})=>{
 await coin(page,1);await page.goto('/');await page.getByRole('button',{name:'Quux Bot',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('You · Setup');await home(page);
 await expect(page.locator('.status')).toHaveText('Turn 2 · You');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('homeworlds.session.v1')!));
 expect(saved.starter).toBe(1);expect(saved.mode).toBe('quux');expect(saved.actions.at(-1).type).toBe('end');
 expect(saved.actions.length).toBeGreaterThanOrEqual(2);
});

test('bot loading failure can be retried without changing the game',async({page})=>{
 await coin(page,1);await page.route('**/*.wasm',route=>route.abort());
 await page.goto('/');await page.getByRole('button',{name:'Quux Bot',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry Quux Bot'})).toBeVisible();
 await expect(bank(page,'green',1)).toBeDisabled();
 await page.unroute('**/*.wasm');await page.getByRole('button',{name:'Retry Quux Bot'}).click();
 await expect(page.locator('.status')).toHaveText('You · Setup');
 await expect(page.locator('.system')).toHaveCount(1);
});

test('starting a new local game cancels a pending bot request',async({page})=>{
 await coin(page,1);await page.route('**/*.wasm',async route=>{await new Promise(r=>setTimeout(r,1000));await route.continue().catch(()=>{});});
 await page.goto('/');await page.getByRole('button',{name:'Quux Bot',exact:true}).click();
 await page.getByRole('button',{name:'Game menu'}).click();await page.getByRole('button',{name:'New game',exact:true}).click();
 await page.getByRole('button',{name:'Another player',exact:true}).click();
 await page.waitForTimeout(1200);
 await expect(page.locator('.status')).toHaveText('Player 2 · Setup');
 await expect(page.locator('.system')).toHaveCount(0);
 await expect(page.locator('.match-info')).toContainText('Two players');
});

test('a saved bot turn resumes automatically and announces a real catastrophe win',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>localStorage.setItem('homeworlds.session.v1',JSON.stringify({version:1,mode:'quux',starter:0,opening:[{stars:[{color:'green',size:1},{color:'blue',size:3}],shipColor:'green'},{stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'}],actions:[{type:'build',system:'north',color:'green'},{type:'end'},{type:'end'},{type:'build',system:'north',color:'green'},{type:'end'}]})));
 await page.reload();await page.getByRole('button',{name:'Resume saved game'}).click();
 await expect(page.locator('#result')).toBeVisible();
 await expect(page.locator('#result-title')).toHaveText('Quux Bot wins');
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeDisabled();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('homeworlds.session.v1')!));
 expect(saved.actions.some((a:{type:string})=>a.type==='catastrophe')).toBe(true);
 await page.reload();await page.getByRole('button',{name:'Resume saved game'}).click();
 await expect(page.locator('#result-title')).toHaveText('Quux Bot wins');
});

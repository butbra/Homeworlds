import {expect,test,type Page} from '@playwright/test';

async function practice(page:Page,mode='practice') {
 await page.goto('/');
 await page.evaluate(mode=>localStorage.setItem('homeworlds.session.v1',JSON.stringify({
  version:1,mode,humanPlayer:1,starter:1,opening:[
   {stars:[{color:'blue',size:3},{color:'red',size:1}],shipColor:'green'},
   {stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'},
  ],actions:[],
 })),mode);
 await page.reload();await page.getByRole('button',{name:'Resume saved game'}).click();
}
const saved=(page:Page)=>page.evaluate(()=>localStorage.getItem('homeworlds.session.v1'));

test('practice offers real hints and reviews without committing or changing a turn',async({page})=>{
 await practice(page);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await expect(page.locator('.player-nameplate.south strong')).toHaveText('You');
 await expect(page.locator('.player-nameplate.north strong')).toHaveText('Quux Bot');
 await expect(page.getByRole('button',{name:'Evaluate move',exact:true})).toBeDisabled();
 const initial=await saved(page);
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Best turn',exact:true})).toBeVisible();
 await expect(page.locator('.coach-steps li').first()).toContainText('Build');
 await expect(page.getByRole('heading',{name:'The idea',exact:true})).toBeVisible();
 await page.screenshot({path:`/tmp/homeworlds-practice-hint-${test.info().project.name}.png`});
 expect(await saved(page)).toBe(initial);
 await page.getByRole('button',{name:'Back to board',exact:true}).click();
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Bank green 1',exact:true}).click();
 const staged=await saved(page);
 await page.getByRole('button',{name:'Evaluate move',exact:true}).click();
 await expect(page.locator('.coach-rating strong')).toHaveText('10/10');
 await expect(page.locator('#coach-dialog')).toContainText('fleet gains 1 ship');
 await page.screenshot({path:`/tmp/homeworlds-practice-review-${test.info().project.name}.png`});
 expect(await saved(page)).toBe(staged);
 await page.getByRole('button',{name:'Show Quux’s best turn'}).click();
 await expect(page.locator('#coach-dialog')).toContainText('Undo those actions');
 await page.getByRole('button',{name:'Back to board',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'Resume saved game'}).click();
 await expect(page.getByRole('button',{name:'Evaluate move',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Undo action'}).click();
 await expect(page.getByRole('button',{name:'Evaluate move',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Bank green 1',exact:true}).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.getByRole('button',{name:'Hint',exact:true})).toBeDisabled();
 await expect(page.locator('.status')).toHaveText('Turn 3 · You');
 await expect(page.getByRole('button',{name:'Hint',exact:true})).toBeEnabled();
 expect(errors).toEqual([]);
});

test('review warns about a losing incomplete sacrifice before End turn',async({page})=>{
 await practice(page);
 await page.getByRole('button',{name:'Player 2 green ship 3 at South homeworld',exact:true}).click();
 await page.getByRole('button',{name:'Sacrifice',exact:true}).click();
 const before=await saved(page);
 await page.getByRole('button',{name:'Evaluate move',exact:true}).click();
 await expect(page.locator('.coach-rating strong')).toHaveText('1/10');
 await expect(page.locator('#coach-dialog')).toContainText('Ending here loses the game');
 await expect(page.locator('#coach-dialog')).toContainText('3 actions available');
 expect(await saved(page)).toBe(before);
 await page.getByRole('button',{name:'Back to board',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Turn 1 · You');
 await page.getByRole('button',{name:'Undo action'}).click();
 await expect(page.getByRole('button',{name:'Player 2 green ship 3 at South homeworld',exact:true})).toBeVisible();
});

test('analysis failure can be retried and cancellation leaves the turn playable',async({page})=>{
 await practice(page);const initial=await saved(page);
 await page.route('**/*.wasm',route=>route.abort());
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 await expect(page.locator('#coach-dialog [role="alert"]')).toContainText('Could not finish');
 await page.unroute('**/*.wasm');
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.locator('.coach-steps li').first()).toBeVisible();
 await page.getByRole('button',{name:'Back to board',exact:true}).click();
 await page.route('**/*.wasm',async route=>{await new Promise(r=>setTimeout(r,700));await route.continue().catch(()=>{});});
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 await page.getByRole('button',{name:'Cancel analysis',exact:true}).click();
 await page.waitForTimeout(900);
 await expect(page.locator('#coach-dialog')).toHaveCount(0);
 expect(await saved(page)).toBe(initial);
 await page.getByRole('button',{name:'Bank green 1',exact:true}).click();
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeEnabled();
});

test('practice is a separate selectable mode with the full bank visible',async({page})=>{
 await page.clock.install();
 await page.addInitScript(()=>{
  const original=crypto.getRandomValues.bind(crypto);
  Object.defineProperty(crypto,'getRandomValues',{value:(array:ArrayBufferView)=>{if(array instanceof Uint8Array&&array.byteLength===1){array[0]=1;return array;}return original(array);}});
 });
 await page.goto('/');
 await page.getByLabel('Quux difficulty').filter({visible:true}).fill('1');
 await page.getByRole('button',{name:'Quux practice',exact:true}).click();
 await page.clock.fastForward(6200);
 for(const name of ['Bank blue 3','Bank red 1','Bank green 3'])await page.getByRole('button',{name,exact:true}).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Turn 1 · You');
 await expect(page.getByRole('button',{name:'Hint',exact:true})).toBeEnabled();
 const last=await page.getByRole('button',{name:'Bank blue 3',exact:true}).boundingBox();
 expect(last!.y+last!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
 expect(await page.locator('#space').evaluate(e=>getComputedStyle(e).overflow)).toBe('clip');
 const save=JSON.parse((await saved(page))!);expect(save.mode).toBe('practice');expect(save.humanPlayer).toBe(1);
 expect(save.difficulty).toBe(1);
 await page.getByRole('button',{name:'Game menu'}).click();
 await page.getByLabel('Quux difficulty').filter({visible:true}).fill('4');
 await expect(page.locator('#game-menu [data-difficulty-label]')).toHaveText('4 / 10 · Learning');
 expect(JSON.parse((await saved(page))!).difficulty).toBe(4);
 await page.getByRole('button',{name:'Back to space'}).click();
 await page.reload();await page.getByRole('button',{name:'Resume saved game'}).click();
 await page.getByRole('button',{name:'Game menu'}).click();
 await expect(page.locator('#game-difficulty')).toHaveValue('4');
});

test('ordinary Quux games keep their original controls',async({page})=>{
 await practice(page,'quux');
 await expect(page.getByRole('button',{name:'Hint',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Evaluate move',exact:true})).toHaveCount(0);
});

test('practice controls and all bank sizes fit a short landscape screen',async({page})=>{
 await page.setViewportSize({width:844,height:390});
 await practice(page);
 for(const piece of await page.locator('.bank-piece').all()) {
  const rect=(await piece.boundingBox())!;
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.y+rect.height).toBeLessThanOrEqual(390);
 }
 await expect(page.getByRole('button',{name:'Hint',exact:true})).toBeInViewport();
 expect(await page.locator('#space').evaluate(e=>getComputedStyle(e).overflow)).toBe('clip');
});

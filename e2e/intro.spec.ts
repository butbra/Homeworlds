import {test,expect,type Page} from '@playwright/test';
async function freeze(page:Page,starter:0|1=1){
 await page.clock.install({time:1000});await page.clock.pauseAt(2000);
 await page.addInitScript(bit=>{const original=crypto.getRandomValues.bind(crypto);Object.defineProperty(crypto,'getRandomValues',{value:(array:ArrayBufferView)=>{if(array instanceof Uint8Array&&array.byteLength===1){array[0]=bit;return array;}return original(array);}});},starter);
 await page.goto('/');await page.getByRole('button',{name:'Quux Bot',exact:true}).click();
}
test('names arrive first, the toss reveals at five seconds, and setup waits for the result',async({page})=>{
 await freeze(page);
 await expect(page.locator('.player-nameplate.north strong')).toHaveText('Quux Bot');
 await expect(page.locator('.player-nameplate.south strong')).toHaveText('You');
 await expect(page.locator('.coin-intro')).toHaveClass(/names/);
 await expect(page.locator('.system')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Bank red 1',exact:true})).toBeDisabled();
 await page.clock.fastForward(450);
 await expect(page.locator('.coin-intro')).toHaveClass(/flipping/);
 await expect(page.locator('.coin-title')).toHaveText('Flipping for first turn');
 await page.clock.fastForward(4549);
 await expect(page.locator('.coin-intro')).toHaveClass(/flipping/);
 await page.clock.fastForward(1);
 await expect(page.locator('.coin-intro')).toHaveClass(/revealed/);
 await expect(page.locator('.coin-title')).toHaveText('You go first');
 await expect(page.locator('.player-nameplate.south .player-detail')).toHaveText('GOES FIRST');
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeDisabled();
 await page.clock.fastForward(1100);
 await expect(page.locator('.coin-intro')).toHaveCount(0);
 await expect(page.locator('.status')).toHaveText('You · Setup');
 await expect(page.getByRole('button',{name:'Bank red 1',exact:true})).toBeEnabled();
 await expect(page.locator('.command-bar,.turn-token,.match-info,.space-compass')).toHaveCount(0);
 await expect(page.locator('.sidebar').locator(':scope > *')).toHaveCount(1);
});
test('the opposite face reveals Quux Bot without starting bot setup early',async({page})=>{
 await freeze(page,0);await page.clock.fastForward(5000);
 await expect(page.locator('.coin-title')).toHaveText('Quux Bot goes first');
 await expect(page.locator('.player-nameplate.north')).toHaveClass(/is-active/);
 await expect(page.locator('.system')).toHaveCount(0);
});
test('reloading the toss preserves its outcome and elapsed time',async({page})=>{
 await freeze(page);await page.clock.fastForward(2500);
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('homeworlds.setup.v1')!));
 await page.reload();await expect(page.locator('.coin-intro')).toHaveClass(/flipping/);
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('homeworlds.setup.v1')!));
 expect(after.introStartedAt).toBe(before.introStartedAt);expect(after.starter).toBe(before.starter);
 await page.clock.fastForward(2500);await expect(page.locator('.coin-title')).toHaveText('You go first');
 await page.clock.fastForward(1100);await page.reload();await expect(page.locator('.coin-intro')).toHaveCount(0);
 await expect(page.locator('.status')).toHaveText('You · Setup');
});
test('a new match cancels the previous toss without a late bot setup',async({page})=>{
 await freeze(page,0);await page.clock.fastForward(1000);
 await page.getByRole('button',{name:'Game menu'}).click();await page.getByRole('button',{name:'New game',exact:true}).click();
 await page.getByRole('button',{name:'Another player',exact:true}).click();await page.clock.fastForward(6200);
 await expect(page.locator('.coin-intro')).toHaveCount(0);await expect(page.locator('.system')).toHaveCount(0);
 await expect(page.locator('.status')).toHaveText('Player 1 · Setup');
 await expect(page.locator('.player-nameplate.north strong')).toHaveText('Player 1');
});
test('reduced motion keeps the five-second reveal without a spinning coin',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await freeze(page);
 await page.clock.fastForward(1000);
 expect(await page.locator('.coin-disc').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 await expect(page.locator('.coin-title')).toHaveText('Flipping for first turn');
 await page.clock.fastForward(4000);await expect(page.locator('.coin-title')).toHaveText('You go first');
});

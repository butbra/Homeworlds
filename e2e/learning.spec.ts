import {expect,test,type Page} from '@playwright/test';
import {lessons} from '../src/learning';
const bank=(page:Page,color:string,size:number)=>page.getByRole('button',{name:`Bank ${color} ${size}`,exact:true});
async function coin(page:Page,bit:0|1=1) {
 await page.clock.install();
 await page.addInitScript(bit=>{
  const original=crypto.getRandomValues.bind(crypto);
  Object.defineProperty(crypto,'getRandomValues',{value:(array:ArrayBufferView)=>{if(array instanceof Uint8Array&&array.byteLength===1){array[0]=bit;return array;}return original(array);}});
 },bit);
}
const opening=[
 {stars:[{color:'blue',size:3},{color:'red',size:1}],shipColor:'green'},
 {stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'},
];
async function load(page:Page,save:object={version:1,mode:'learning',humanPlayer:1,starter:1,opening,actions:[]}) {
 await page.goto('/');
 await page.evaluate(save=>localStorage.setItem('homeworlds.session.v1',JSON.stringify(save)),save);
 await page.reload();await page.getByRole('button',{name:'Resume saved game'}).click();
}

test('Learning mode asks about the walkthrough and can return without replacing a saved game',async({page})=>{
 await load(page);
 const original=await page.evaluate(()=>localStorage.getItem('homeworlds.session.v1'));
 await page.getByRole('button',{name:'Game menu'}).click();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'New game',exact:true}).click();
 await page.getByRole('button',{name:'Learning mode',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Learn the rules first?'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Show walkthrough',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Skip walkthrough',exact:true})).toBeVisible();
 await expect(page.locator('.coin-intro')).toHaveCount(0);
 await page.getByRole('button',{name:'Back to modes',exact:true}).click();
 await page.getByRole('button',{name:'Resume saved game'}).click();
 expect(await page.evaluate(()=>localStorage.getItem('homeworlds.session.v1'))).toBe(original);
 await expect(page.locator('.status')).toHaveText('Turn 1 · You');
});

test('walkthrough uses real pieces, legal before/after examples, arrows and a level-4 game at the end',async({page})=>{
 test.setTimeout(60000);
 await coin(page);await page.goto('/');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'Learning mode',exact:true}).click();
 await page.getByRole('button',{name:'Show walkthrough',exact:true}).click();
 await expect(page.getByRole('heading',{name:lessons[0].title,exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Previous lesson'})).toBeDisabled();
 await page.getByRole('button',{name:'Next lesson'}).click();
 await expect(page.getByRole('heading',{name:'Meet the pieces'})).toBeVisible();
 await expect(page.locator('#learning-dialog .pyramid.star')).toHaveCount(1);
 await expect(page.locator('#learning-dialog .pyramid.owner-0')).toHaveCount(1);
 await page.getByRole('button',{name:'Previous lesson'}).click();
 await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('heading',{name:'Meet the pieces'})).toBeVisible();
 await page.screenshot({path:`/tmp/homeworlds-learning-pieces-${test.info().project.name}.png`});
 for(let i=1;i<lessons.length;i++) {
  const lesson=lessons[i];
  await expect(page.getByRole('heading',{name:lesson.title,exact:true})).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'Walkthrough progress'})).toHaveAttribute('aria-valuenow',String(i+1));
  if(lesson.example?.actions.length) {
   await page.getByRole('button',{name:'▶ Show move',exact:true}).click();
   await expect(page.locator('.lesson-scene')).toHaveAttribute('aria-label','After example');
   await expect(page.locator('.lesson-caption')).toHaveText(lesson.example.afterCaption);
   await page.getByRole('button',{name:'↶ Reset example',exact:true}).click();
   await expect(page.locator('.lesson-caption')).toHaveText(lesson.example.caption);
  }
  await expect(page.locator('.coin-intro')).toHaveCount(0);
  if(i<lessons.length-1)await page.getByRole('button',{name:'Next lesson'}).click();
 }
 await page.getByRole('button',{name:'Start learning game'}).click();
 await expect(page.locator('.coin-intro')).toBeVisible();
 await page.clock.fastForward(6200);
 await expect(page.locator('.status')).toHaveText('You · Setup');
 await bank(page,'blue',3).click();await bank(page,'red',1).click();
 await expect(bank(page,'green',1)).toBeDisabled();await expect(bank(page,'green',2)).toBeDisabled();
 await expect(bank(page,'green',3)).toHaveAttribute('data-legal-option','bank');
 await bank(page,'green',3).click();await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Turn 1 · You');
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('homeworlds.session.v1')!));
 expect(save).toMatchObject({mode:'learning',humanPlayer:1,difficulty:4,starter:1});
 await expect(bank(page,'green',1)).toHaveAttribute('data-legal-option','bank');
 await expect(bank(page,'green',2)).toBeDisabled();
 await page.screenshot({path:`/tmp/homeworlds-learning-board-${test.info().project.name}.png`});
 await bank(page,'green',1).click();
 await expect(page.locator('.learning-cue')).toContainText('Your action is complete');
 await expect(page.locator('[data-ship][data-legal-option]')).toHaveCount(0);
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Turn 3 · You');
 expect(errors).toEqual([]);
});

test('skipping the tour starts at level 4, highlights legal bank choices and restores them after undo/reload',async({page})=>{
 await coin(page);await page.goto('/');
 await page.getByRole('button',{name:'Learning mode',exact:true}).click();
 await page.getByRole('button',{name:'Skip walkthrough',exact:true}).click();await page.clock.fastForward(6200);
 for(const [color,size] of [['blue',3],['red',1],['green',3]]as const)await bank(page,color,size).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Turn 1 · You');
 await expect(page.locator('[data-system="south"]')).toHaveClass(/learn-build-system/);
 const own=page.getByRole('button',{name:'Player 2 green ship 3 at South homeworld',exact:true});
 await expect(own).toHaveAttribute('data-legal-option','select');await own.click();
 await expect(page.getByRole('button',{name:'Trade',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Travel',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Trade',exact:true}).click();
 await expect(bank(page,'yellow',3)).toHaveAttribute('data-legal-option','bank');
 await expect(bank(page,'yellow',1)).toBeDisabled();
 await bank(page,'yellow',3).click();
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeEnabled();
 await page.reload();await page.getByRole('button',{name:'Resume saved game'}).click();
 await expect(page.locator('.learning-cue')).toContainText('Your action is complete');
 await page.getByRole('button',{name:'Undo action'}).click();
 await expect(own).toHaveAttribute('data-legal-option','select');
 await expect(bank(page,'green',1)).toHaveAttribute('data-legal-option','bank');
});

test('legal travel destinations and discovery sizes follow the selected ship and stars',async({page})=>{
 const save={version:1,mode:'learning',humanPlayer:1,starter:1,opening:[opening[0],{stars:[{color:'green',size:2},{color:'blue',size:1}],shipColor:'yellow'}],actions:[
  {type:'build',system:'south',color:'yellow'},{type:'end'},{type:'end'},
 ]};
 await load(page,save);
 await page.getByRole('button',{name:'Player 2 yellow ship 1 at South homeworld',exact:true}).click();
 await page.getByRole('button',{name:'Travel',exact:true}).click();
 await expect(bank(page,'red',3)).toHaveAttribute('data-legal-option','bank');
 await expect(bank(page,'red',1)).toBeDisabled();await expect(bank(page,'red',2)).toBeDisabled();
 await bank(page,'red',3).click();
 await expect(page.locator('[data-system="system-1"]')).toBeVisible();
 // Finish this recorded turn and give the opponent a legal pass for a fixed next-turn example.
 const updated=await page.evaluate(()=>JSON.parse(localStorage.getItem('homeworlds.session.v1')!));
 updated.actions.push({type:'end'},{type:'end'});await load(page,updated);
 await page.getByRole('button',{name:'Player 2 yellow ship 1 at Frontier 1',exact:true}).click();
 await expect(page.getByRole('button',{name:'Trade',exact:true})).toBeDisabled();
 await expect(page.locator('[data-system="south"]')).toHaveClass(/destination/);
 await expect(page.locator('[data-system="north"]')).not.toHaveClass(/destination/);
 await page.getByRole('button',{name:'Select South homeworld',exact:true}).click();
 await expect(page.locator('[data-system="system-1"]')).toHaveCount(0);
});

test('legal captures glow red and dangerous home abandonment gets a warning',async({page})=>{
 const save={version:1,mode:'learning',humanPlayer:1,starter:0,opening:[{stars:[{color:'red',size:1},{color:'yellow',size:2}],shipColor:'green'},opening[1]],actions:[
  {type:'build',system:'north',color:'green'},{type:'end'},
  {type:'build',system:'south',color:'green'},{type:'end'},
  {type:'discover',system:'north',ship:1,star:{color:'yellow',size:3}},{type:'end'},{type:'end'},
  {type:'move',system:'system-1',ship:0,destination:'south'},{type:'end'},
 ]};
 await load(page,save);
 const target=page.getByRole('button',{name:'Player 1 green ship 1 at South homeworld',exact:true});
 await expect(target).toHaveAttribute('data-legal-option','capture');await expect(target).toHaveClass(/learn-capture/);
 await target.click();await expect(target).toHaveCount(0);
 await load(page);
 await page.getByRole('button',{name:'Player 2 green ship 3 at South homeworld',exact:true}).click();
 await page.getByRole('button',{name:'Sacrifice',exact:true}).click();
 await expect(page.locator('.learning-cue')).toContainText('avoid losing');
 await page.getByRole('button',{name:'Undo action'}).click();
 await expect(page.locator('.learning-cue')).not.toContainText('avoid losing');
});

test('reopening the walkthrough preserves the match and the whole bank fits on a short screen',async({page})=>{
 await page.setViewportSize({width:844,height:390});await load(page);
 // Background advice updates the controls once. Measure the settled board,
 // rather than holding element handles across that asynchronous render.
 await expect(page.locator('[data-move-advice="recommended"]')).toHaveCount(1);
 for(const button of await page.locator('.bank-piece').all()) {
  const rect=(await button.boundingBox())!;
  expect(rect.y).toBeGreaterThanOrEqual(0);expect(rect.y+rect.height).toBeLessThanOrEqual(390);
 }
 expect(await page.locator('#space').evaluate(e=>getComputedStyle(e).overflow)).toBe('clip');
 const before=await page.evaluate(()=>localStorage.getItem('homeworlds.session.v1'));
 await page.getByRole('button',{name:'Game menu'}).click();await page.getByRole('button',{name:'Rules walkthrough'}).click();
 await page.getByRole('button',{name:'Next lesson'}).click();
 await page.getByRole('button',{name:'Back to game',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('homeworlds.session.v1'))).toBe(before);
 await expect(page.locator('.status')).toHaveText('Turn 1 · You');
});

test('setup marks recommended pieces and offers real-piece presets without auto-confirming',async({page})=>{
 await coin(page);await page.goto('/');
 await page.getByRole('button',{name:'Learning mode',exact:true}).click();
 await page.getByRole('button',{name:'Skip walkthrough',exact:true}).click();await page.clock.fastForward(6200);
 await expect(bank(page,'red',1)).toHaveAttribute('data-recommended','true');
 await bank(page,'red',1).click();await expect(bank(page,'blue',3)).toHaveAttribute('data-recommended','true');
 await bank(page,'blue',3).click();await expect(bank(page,'green',3)).toHaveAttribute('data-recommended','true');
 await page.getByRole('button',{name:'Starting tips',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Recommended starts'})).toBeVisible();
 await expect(page.locator('.starting-card')).toHaveCount(4);
 await expect(page.locator('.starting-pieces .pyramid')).toHaveCount(12);
 await page.getByRole('button',{name:'Use Goldilocks',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('You · Setup');
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeEnabled();
 const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('homeworlds.setup.v1')!));
 expect(progress.player).toBe(1);expect(progress.pieces[0]).toEqual([]);
 expect(progress.pieces[1]).toEqual([{color:'red',size:1},{color:'blue',size:3},{color:'green',size:3}]);
 await page.getByRole('button',{name:'Undo action'}).click();
 await expect(bank(page,'green',3)).toHaveAttribute('data-recommended','true');
 await page.reload();await expect(page.getByRole('button',{name:'Starting tips',exact:true})).toBeVisible();
 await expect(bank(page,'green',3)).toHaveAttribute('data-recommended','true');
});

test('a difficult legal start explains the risks and a preset can replace it',async({page})=>{
 await coin(page);await page.goto('/');
 await page.getByRole('button',{name:'Learning mode',exact:true}).click();
 await page.getByRole('button',{name:'Skip walkthrough',exact:true}).click();await page.clock.fastForward(6200);
 for(let i=0;i<3;i++)await bank(page,'red',3).click();
 await expect(page.locator('.learning-cue')).toContainText('No green power');
 await page.getByRole('button',{name:'Starting tips',exact:true}).click();
 await expect(page.locator('.starting-warnings')).toContainText('No blue power');
 await expect(page.locator('.starting-warnings')).toContainText('Same-size stars');
 await page.screenshot({path:`/tmp/homeworlds-starting-tips-${test.info().project.name}.png`});
 await page.getByRole('button',{name:'Use Explorer',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('You · Setup');
 await expect(bank(page,'red',3)).toContainText('×3');
 const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('homeworlds.setup.v1')!));
 expect(progress.pieces[1]).toEqual([{color:'blue',size:1},{color:'yellow',size:2},{color:'green',size:3}]);
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toBeEnabled();
});

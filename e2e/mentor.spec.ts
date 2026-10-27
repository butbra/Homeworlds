import {expect,test,type Page} from '@playwright/test';
const opening=[
 {stars:[{color:'blue',size:3},{color:'red',size:1}],shipColor:'green'},
 {stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'},
];
const base={version:1,mode:'learning',humanPlayer:1,starter:1,difficulty:1,opening,actions:[]};
async function load(page:Page,save:object=base) {
 await page.goto('/');await page.evaluate(save=>localStorage.setItem('homeworlds.session.v1',JSON.stringify(save)),save);
 await page.reload();await page.getByRole('button',{name:'Resume saved game'}).click();
}
const saved=(page:Page)=>page.evaluate(()=>localStorage.getItem('homeworlds.session.v1'));
const bank=(page:Page,color:string,size:number)=>page.getByRole('button',{name:`Bank ${color} ${size}`,exact:true});

test('Learning advice explains a good opening and guides the actual clicks without making moves',async({page})=>{
 await load(page);const before=await saved(page);
 await expect(bank(page,'green',1)).toHaveAttribute('data-move-advice','recommended');
 await expect(page.locator('.learning-cue')).toContainText('second ship at home');
 expect(await saved(page)).toBe(before);
 await page.getByRole('button',{name:'Why / alternatives',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Suggested turn and alternatives'})).toBeVisible();
 await expect(page.locator('#mentor-dialog')).toContainText('Building a second ship at home');
 await expect(page.locator('#mentor-dialog')).toContainText('No similar-strength alternative');
 await page.screenshot({path:`/tmp/homeworlds-move-advice-${test.info().project.name}.png`});
 await page.getByRole('button',{name:'Guide this line',exact:true}).click();
 expect(await saved(page)).toBe(before);
 await bank(page,'green',1).click();
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toHaveAttribute('data-move-advice','recommended');
 await expect(page.locator('.learning-cue')).toContainText('suggested line is complete');
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Turn 3 · You');
});

test('reasonable alternatives explain the tradeoff and guide a selected different line',async({page})=>{
 await load(page,{...base,opening:[opening[0],{stars:[{color:'yellow',size:3},{color:'blue',size:1}],shipColor:'green'}],actions:[
  {type:'build',system:'south',color:'green'},{type:'end'},
  {type:'build',system:'north',color:'green'},{type:'end'},
 ]});
 await expect(page.getByRole('button',{name:'Why / alternatives',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Why / alternatives',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Reasonable alternative 1',exact:true})).toBeVisible();
 const alternative=page.locator('.mentor-line').nth(1);
 await expect(alternative).toContainText('capture');
 await alternative.getByRole('button',{name:'Guide this line',exact:true}).click();
 const small=page.getByRole('button',{name:'Player 2 green ship 1 at South homeworld',exact:true});
 await expect(small).toHaveAttribute('data-move-advice','recommended');await small.click();
 await expect(page.getByRole('button',{name:'Trade',exact:true})).toHaveAttribute('data-move-advice','recommended');
 await page.getByRole('button',{name:'Trade',exact:true}).click();
 await expect(bank(page,'red',1)).toHaveAttribute('data-move-advice','recommended');await bank(page,'red',1).click();
 await expect(page.getByRole('button',{name:'Player 2 red ship 1 at South homeworld',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toHaveAttribute('data-move-advice','recommended');
});

test('a green catastrophe that destroys your home fleet is optional, not highlighted advice, and previews its damage',async({page})=>{
 await load(page,{...base,opening:[opening[1],{stars:[{color:'green',size:1},{color:'blue',size:3}],shipColor:'green'}],actions:[
  {type:'build',system:'south',color:'green'},{type:'end'},{type:'end'},
  {type:'build',system:'south',color:'green'},
 ]});
 const button=page.getByRole('button',{name:'green catastrophe at South homeworld',exact:true});
 await expect(button).not.toHaveClass(/learn-option/);
 await expect(page.getByRole('button',{name:'Undo action'})).toHaveAttribute('data-move-advice','recommended');
 await expect(button).not.toHaveAttribute('data-move-advice','recommended');
 const before=await saved(page);await button.click();
 await expect(page.getByRole('heading',{name:'Before you destroy these pieces'})).toBeVisible();
 await expect(page.locator('#catastrophe-preview')).toContainText('3 of your ships, 0 enemy ships');
 await expect(page.locator('#catastrophe-preview')).toContainText('would lose your homeworld');
 await page.screenshot({path:`/tmp/homeworlds-catastrophe-warning-${test.info().project.name}.png`});
 expect(await saved(page)).toBe(before);
 await page.getByRole('button',{name:'Keep pieces',exact:true}).click();expect(await saved(page)).toBe(before);
 await button.click();await page.getByRole('button',{name:'Trigger catastrophe',exact:true}).click();
 await expect(page.locator('[data-system="south"] [data-ship]')).toHaveCount(0);
 await expect(page.locator('.learning-cue')).toContainText('avoid losing');
 await page.getByRole('button',{name:'Undo action'}).click();
 await expect(page.locator('[data-system="south"] [data-ship]')).toHaveCount(3);
});

test('deviating from the suggestion never grants another basic action and warns about lost powers',async({page})=>{
 await load(page);
 await expect(bank(page,'green',1)).toHaveAttribute('data-move-advice','recommended');
 await page.getByRole('button',{name:'Player 2 green ship 3 at South homeworld',exact:true}).click();
 await page.getByRole('button',{name:'Trade',exact:true}).click();await bank(page,'yellow',3).click();
 await expect(page.getByRole('button',{name:'Undo action'})).toHaveAttribute('data-move-advice','recommended');
 await expect(page.locator('.learning-cue')).toContainText('removes your local build access');
 await expect(page.locator('[data-ship][data-move-advice]')).toHaveCount(0);
 await expect(bank(page,'green',1)).toBeDisabled();
 await page.getByRole('button',{name:'Why / alternatives',exact:true}).click();
 await expect(page.locator('#mentor-dialog')).toContainText('stronger turn before these actions');
 await expect(page.locator('#mentor-dialog')).toContainText('removes your local build access');
});

test('background advice failure and retry leave the board playable',async({page})=>{
 await page.route('**/*.wasm',route=>route.abort());await load(page);
 await expect(page.locator('.learning-cue')).toContainText('Advice unavailable');
 await expect(bank(page,'green',1)).toBeEnabled();
 await page.unroute('**/*.wasm');await page.getByRole('button',{name:'Retry advice',exact:true}).click();
 await expect(bank(page,'green',1)).toHaveAttribute('data-move-advice','recommended');
 await bank(page,'green',1).click();await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Turn 3 · You');
});

test('new game cancels background teaching without stale suggestions or board changes',async({page})=>{
 await page.route('**/*.wasm',async route=>{await new Promise(r=>setTimeout(r,900));await route.continue().catch(()=>{});});
 await load(page);await page.getByRole('button',{name:'Game menu'}).click();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'New game',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Choose your opponent'})).toBeVisible();
 await page.waitForTimeout(1100);await expect(page.locator('[data-move-advice]')).toHaveCount(0);
 await expect(page.locator('#mentor-dialog')).toHaveCount(0);
});

test('a winning catastrophe is explained as a win and guided to confirmation',async({page})=>{
 await load(page,{...base,starter:0,opening:[{stars:[{color:'green',size:1},{color:'blue',size:3}],shipColor:'green'},opening[1]],actions:[
  {type:'build',system:'north',color:'green'},{type:'end'},{type:'end'},
  {type:'build',system:'north',color:'green'},{type:'end'},
 ]});
 await page.getByRole('button',{name:'green catastrophe at North homeworld',exact:true}).click();
 await page.getByRole('button',{name:'Trigger catastrophe',exact:true}).click();
 await expect(page.getByRole('button',{name:'End turn',exact:true})).toHaveAttribute('data-move-advice','recommended');
 await expect(page.getByRole('button',{name:'Why / alternatives',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Why / alternatives',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your staged turn wins'})).toBeVisible();
 await page.getByRole('button',{name:'Back to board',exact:true}).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('#result-title')).toHaveText('You win');
});

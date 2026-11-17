import {test,expect} from '@playwright/test';

test('finished game automatically analyzes its actual moves and can replay in either direction',async({page})=>{
 const saved={version:1,opening:[{stars:[{color:'yellow',size:1},{color:'blue',size:3}],shipColor:'green'},{stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'}],actions:[{type:'build',system:'north',color:'green'},{type:'end'},{type:'build',system:'south',color:'green'},{type:'end'},{type:'discover',system:'north',ship:1,star:{color:'red',size:2}},{type:'end'},{type:'resign'}]};
 await page.addInitScript(value=>{localStorage.setItem('homeworlds.session.v1',JSON.stringify(value));localStorage.setItem('homeworlds.table-view','true');},saved);
 await page.goto('/');await page.getByRole('button',{name:'Resume saved game'}).click();
 const result=page.locator('#result');await expect(result).toBeVisible();await expect(result.locator('#result-title')).toHaveText('Player 1 wins');
 await expect(result.getByText('Analysis complete',{exact:true})).toBeVisible({timeout:20000});
 await expect(result.locator('.review-chart circle')).toHaveCount(10);
 const before=await page.evaluate(()=>localStorage.getItem('homeworlds.session.v1'));
 await result.getByRole('button',{name:/^Replay Turn 2:/}).click();
 await expect(page.locator('.replay-controls .status')).toHaveText('GAME REPLAY · 2/4 actions');
 await page.locator('#replay-exit').click();
 await result.getByRole('button',{name:'Replay from start'}).click();await expect(page.locator('.system')).toHaveCount(2);
 await expect(page.locator('.replay-controls .status')).toHaveText('GAME REPLAY · 0/4 actions');
 await expect(page.locator('#replay-odds')).toContainText('Player 1 50%');
 await expect(page.locator('.replay-odds-north')).toHaveAttribute('style','width:50%');
 await page.locator('#replay-next').click();await expect(page.getByRole('button',{name:'Player 1 green ship 1 at North homeworld',exact:true})).toBeVisible();
 await expect(page.locator('.replay-description')).toContainText('Build');
 await expect(page.locator('#replay-odds')).toContainText('Turn 1 estimate');
 await page.locator('#replay-next').click();await expect(page.getByRole('button',{name:'Player 2 green ship 1 at South homeworld',exact:true})).toBeVisible();
 await page.locator('#replay-prev').click();
 await page.locator('#replay-prev').click();await expect(page.getByRole('button',{name:'Player 1 green ship 1 at North homeworld',exact:true})).toHaveCount(0);
 await page.locator('#replay-last').click();await expect(page.locator('.system')).toHaveCount(3);
 await expect(page.locator('#replay-odds')).toContainText('Player 1 100%');
 await expect(page.locator('.replay-odds-north')).toHaveAttribute('style','width:100%');
 await expect(page.locator('.replay-odds-south')).toHaveAttribute('style','width:0%');
 await page.locator('#replay-exit').click();await expect(result).toBeVisible();
 await result.getByRole('button',{name:'Replay from end'}).click();await expect(page.locator('.replay-controls .status')).toHaveText('GAME REPLAY · 4/4 actions');
 await page.locator('#replay-prev').click();await expect(page.locator('.replay-controls .status')).toHaveText('GAME REPLAY · 3/4 actions');
 await expect(page.locator('.bank-piece').first()).toBeDisabled();
 expect(await page.evaluate(()=>localStorage.getItem('homeworlds.session.v1'))).toBe(before);
});

test('confirmed turns are analyzed and cached before the game ends, including after a reload',async({page})=>{
 const saved={version:1,opening:[{stars:[{color:'yellow',size:1},{color:'blue',size:3}],shipColor:'green'},{stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'}],actions:[{type:'build',system:'north',color:'green'},{type:'end'},{type:'build',system:'south',color:'green'}]};
 await page.addInitScript(value=>{if(!localStorage.getItem('homeworlds.session.v1'))localStorage.setItem('homeworlds.session.v1',JSON.stringify(value));},saved);
 await page.goto('/');await page.getByRole('button',{name:'Resume saved game'}).click();
 const cached=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('homeworlds.review.v1')??'[]').length);
 await expect.poll(cached,{timeout:20000}).toBe(1);
 await page.getByRole('button',{name:'End turn'}).click();await expect.poll(cached,{timeout:20000}).toBe(2);
 await expect(page.locator('#result')).not.toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Resume saved game'}).click();
 await page.getByRole('button',{name:'Game menu'}).click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Resign',exact:true}).click();
 await expect(page.locator('#result')).toBeVisible();await expect(page.locator('#result').getByText('Analysis complete',{exact:true})).toBeVisible();
 await expect(page.locator('.review-chart circle')).toHaveCount(8);
});

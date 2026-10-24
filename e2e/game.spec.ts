import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test.beforeEach(async ({page}) => {await page.goto('/');});
test('plays multiple turns through discovery, sacrifice, and victory',async ({page})=>{
 const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'Apply build',exact:true}).click();
 await expect(page.locator('.system').first().locator('.fleet .piece')).toHaveCount(2);
 await page.getByRole('button',{name:'Undo action'}).click();
 await expect(page.locator('.system').first().locator('.fleet .piece')).toHaveCount(1);
 await page.getByRole('button',{name:'Apply build',exact:true}).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('.status')).toContainText('Player 2');
 await expect(page.getByRole('button',{name:'Undo action'})).toBeDisabled();
 await page.getByRole('button',{name:'Apply build',exact:true}).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await page.locator('[data-category="trade"]').click();
 await page.locator('#order').selectOption({label:'Trade small green ship #2 for yellow'});
 await page.getByRole('button',{name:'Apply trade',exact:true}).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await page.getByRole('button',{name:'Pass / end turn',exact:true}).click();
 await page.locator('[data-category="discover"]').click();
 await page.locator('#order').selectOption({label:'Discover medium red star with small yellow ship #2'});
 await page.getByRole('button',{name:'Apply discover',exact:true}).click();
 await expect(page.locator('.system')).toHaveCount(3);
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await page.getByRole('button',{name:'Pass / end turn',exact:true}).click();
 await page.locator('[data-category="sacrifice"]').click();
 await page.getByRole('button',{name:'Apply sacrifice',exact:true}).click();
 await page.getByRole('button',{name:'End turn',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Player 2 wins');
 expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('restores autosave and current-turn undo after reload',async ({page})=>{
 await page.getByRole('button',{name:'Apply build',exact:true}).click();
 await page.reload();
 await expect(page.locator('.system').first().locator('.fleet .piece')).toHaveCount(2);
 await page.getByRole('button',{name:'Undo action'}).click();
 await expect(page.locator('.system').first().locator('.fleet .piece')).toHaveCount(1);
 await page.reload();
 await expect(page.locator('.system').first().locator('.fleet .piece')).toHaveCount(1);
});
test('exports and imports a portable save and rejects invalid files',async ({page})=>{
 await page.getByRole('button',{name:'Apply build',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export save'}).click();
 const download=await downloadPromise;
 const data=await readFile((await download.path())!);
 expect(JSON.parse(data.toString()).actions).toHaveLength(1);
 await page.getByRole('button',{name:'Undo action'}).click();
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#save-file').setInputFiles({name:'save.json',mimeType:'application/json',buffer:data});
 await expect(page.getByRole('status')).toHaveText('Saved game imported.');
 await expect(page.locator('.system').first().locator('.fleet .piece')).toHaveCount(2);
 await page.locator('#save-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":999}')});
 await expect(page.getByRole('status')).toContainText('Import failed');
 await expect(page.locator('.system').first().locator('.fleet .piece')).toHaveCount(2);
});
test('supports custom opening, rejects exhausted pieces, and resets to suggested',async ({page})=>{
 await page.getByRole('button',{name:'New game',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 for(const i of [0,1]) {
  for(const j of [0,1]) {
   await page.locator(`[name="p${i}s${j}color"]`).selectOption('red');
   await page.locator(`[name="p${i}s${j}size"]`).selectOption('3');
  }
  await page.locator(`[name="p${i}ship"]`).selectOption('red');
 }
 await page.getByRole('button',{name:'Start game',exact:true}).click();
 await expect(page.locator('#setup-error')).toContainText('unavailable');
 await page.getByRole('button',{name:'Use suggested opening'}).click();
 await page.locator('[name="p0ship"]').selectOption('yellow');
 await page.getByRole('button',{name:'Start game',exact:true}).click();
 await expect(page.locator('.system').first().locator('.fleet .yellow')).toHaveCount(1);
 await page.reload();
 await expect(page.locator('.system').first().locator('.fleet .yellow')).toHaveCount(1);
 await page.getByRole('button',{name:'New game',exact:true}).click();
 await page.getByRole('button',{name:'Use suggested opening'}).click();
 await page.getByRole('button',{name:'Start game',exact:true}).click();
 await expect(page.locator('.system').first().locator('.fleet .green')).toHaveCount(1);
});
test('resignation requires confirmation and survives reload',async ({page})=>{
 page.once('dialog',dialog=>dialog.dismiss());
 await page.getByRole('button',{name:'Resign',exact:true}).click();
 await expect(page.locator('.status')).toContainText('Turn 1');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Resign',exact:true}).click();
 await expect(page.locator('.status')).toHaveText('Player 2 wins');
 await page.reload();
 await expect(page.locator('.status')).toHaveText('Player 2 wins');
 await expect(page.getByRole('button',{name:'Agree draw'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Undo action'})).toBeDisabled();
});
test('requires both players to agree to a draw',async ({page})=>{
 let count=0;
 const declineSecond=async (dialog: import('@playwright/test').Dialog) => {count++; if(count===1) await dialog.accept(); else await dialog.dismiss();};
 page.on('dialog',declineSecond);
 await page.getByRole('button',{name:'Agree draw'}).click();
 await expect(page.locator('.status')).toContainText('Turn 1');
 page.off('dialog',declineSecond);
 page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Agree draw'}).click();
 await expect(page.locator('.status')).toHaveText('Game over · Draw');
});

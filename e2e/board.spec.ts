import {test,expect} from '@playwright/test';

test('a crowded map fits every viewport and cannot scroll, with usable action controls',async({page})=>{
 const actions:Record<string,unknown>[]=[];
 const passRound=()=>actions.push({type:'end'},{type:'end'});
 const shipColors=['red','red','red','yellow','yellow','blue','blue','green','green','green'];
 const starColors=['red','red','yellow','yellow','yellow','blue','blue','blue','green','green'];
 for(let i=0;i<shipColors.length;i++){
  actions.push({type:'build',system:'north',color:'green'});passRound();
  if(shipColors[i]!=='green'){actions.push({type:'trade',system:'north',ship:1,color:shipColors[i]});passRound();}
  actions.push({type:'discover',system:'north',ship:1,star:{color:starColors[i],size:2}});passRound();
 }
 const saved={version:1,opening:[{stars:[{color:'yellow',size:1},{color:'blue',size:3}],shipColor:'green'},{stars:[{color:'red',size:2},{color:'blue',size:1}],shipColor:'green'}],actions};
 await page.addInitScript(value=>localStorage.setItem('homeworlds.session.v1',JSON.stringify(value)),saved);
 await page.goto('/');await page.getByRole('button',{name:'Resume saved game'}).click();
 await expect(page.locator('.system')).toHaveCount(12);
 for(const size of [{width:1366,height:768},{width:1920,height:900},{width:390,height:844},{width:375,height:667},{width:844,height:390}]){
  await page.setViewportSize(size);
  await expect.poll(async()=>page.locator('#space').evaluate(space=>{
   const frame=space.getBoundingClientRect();
   return Array.from(space.querySelectorAll('.system')).every(card=>{const box=card.getBoundingClientRect();return box.left>=frame.left-1&&box.right<=frame.right+1&&box.top>=frame.top-1&&box.bottom<=frame.bottom+1;});
  })).toBe(true);
  expect(await page.locator('#space').evaluate(space=>getComputedStyle(space).overflow)).toBe('clip');
  await page.locator('#space').evaluate(space=>space.scrollTo(9999,9999));
  await page.mouse.move(50,200);await page.mouse.wheel(900,900);await page.keyboard.press('PageDown');
  expect(await page.locator('#space').evaluate(space=>({x:space.scrollLeft,y:space.scrollTop}))).toEqual({x:0,y:0});
  expect(await page.evaluate(()=>({x:scrollX,y:scrollY}))).toEqual({x:0,y:0});
  for(const piece of await page.locator('.bank-piece').all()){
   const box=(await piece.boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(size.height);
  }
  await page.getByRole('button',{name:'Player 1 green ship 3 at North homeworld',exact:true}).click();
  const frame=(await page.locator('#space').boundingBox())!,menu=(await page.locator('.ship-actions').boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(frame.x);expect(menu.x+menu.width).toBeLessThanOrEqual(frame.x+frame.width);
  expect(menu.y).toBeGreaterThanOrEqual(frame.y);expect(menu.y+menu.height).toBeLessThanOrEqual(frame.y+frame.height);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
 }
});

import { chromium } from '../../quest/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true});
try {
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://localhost:5183/');
await page.waitForFunction(()=>typeof window.gardenDiagnostics==='function',null,{timeout:90000});
await page.waitForTimeout(1500);await page.screenshot({path:'vr3/play/checks/dusk.png'});
console.log(JSON.stringify({errors,stats:await page.evaluate(()=>window.gardenDiagnostics())}));
await page.locator('#mood').fill('1');await page.waitForTimeout(300);await page.screenshot({path:'vr3/play/checks/twilight.png'});
console.log(JSON.stringify({phase:await page.locator('#phase').textContent(),stats:await page.evaluate(()=>window.gardenDiagnostics())}));
await page.locator('#restart').click();await page.waitForTimeout(500);console.log('restart',await page.evaluate(()=>window.gardenDiagnostics()));
await page.locator('#controls summary').click();await page.locator('#quality').selectOption('low');await page.locator('#motion').uncheck();await page.waitForTimeout(200);console.log('low',await page.evaluate(()=>window.gardenDiagnostics()));
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'vr3/play/checks/mobile.png'});
if(errors.length)throw new Error(errors.join('\n'));
} finally {await browser.close();}

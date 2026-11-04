/**
 * Capture actual current-version extension views for seven native-language
 * Chrome/Edge/Firefox store screenshot packages. No fake follower counts,
 * no simulated completed actions, no X login, no account modifications.
 *
 * Requires Playwright Core and Chrome for Testing (local dev tools). Can use
 * QGG_PLAYWRIGHT_MODULE and QGG_CHROMIUM_BINARY overrides.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const extensionRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const releaseRoot='/Volumes/15055751248/vibe的脚本/04-发布包/取关狗';
const locales=['ja','ko','fr','es','ms','vi','id'];
const native=JSON.parse(fs.readFileSync(path.join(extensionRoot,'本地化产品名称.json'),'utf8'));
const docs=JSON.parse(fs.readFileSync(path.join(extensionRoot,'商店SEO文案.json'),'utf8'));
const {chromium}=require(process.env.QGG_PLAYWRIGHT_MODULE||'/tmp/qgg-playwright/node_modules/playwright-core');
const exe=process.env.QGG_CHROMIUM_BINARY||path.join(os.homedir(),'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const rel=(lang,filename)=>`${['ja','ko','fr','es'].includes(lang)?'新增四语商店上传图片-v0.2.68':'新增三语商店上传图片-v0.2.70'}`;
const labels={ja:'日本語',ko:'한국어',fr:'Français',es:'Español',ms:'Bahasa Melayu',vi:'Tiếng Việt',id:'Bahasa Indonesia'};
const svgEscape=(s)=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function textFromPage(page,selector){return page.locator(selector).first().textContent({timeout:4000}).then(x=>(x||'').trim()).catch(()=>'');}
async function shot(page){await page.waitForTimeout(220);return await page.screenshot({animations:'disabled',timeout:13000});}
async function renderSlide(browser,locale,step,index,view,heading,desc,icon){
 const img=Buffer.from(view).toString('base64');
 const b64logo=Buffer.from(icon).toString('base64');
 const title=native[locale].name;
 const copy=desc.length>165?desc.slice(0,162)+'…':desc;
 const layout=`<!doctype html><html lang="${locale}"><head><meta charset="UTF-8"/><style>
 @font-face{font-family:local;src:local('Arial Unicode MS')}*{box-sizing:border-box}
 html,body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Apple SD Gothic Neo","Arial Unicode MS",system-ui,sans-serif}
 .page{display:flex;width:1280px;height:800px;position:relative;background:#f6f2ed}
 .left{position:relative;width:690px;height:800px;padding:77px 73px 85px;overflow:hidden}
 .top{display:flex;align-items:center;gap:17px;color:#a94c2e;font-weight:750;font-size:24px;max-width:550px}
 .top img{width:48px;height:48px;border-radius:12px}
 h1{font-size:46px;line-height:1.26;font-weight:780;color:#192b23;margin:58px 0 28px;max-width:550px;overflow-wrap:anywhere}
 p{font-size:22px;line-height:1.7;font-weight:450;color:#66756c;max-width:515px;max-height:275px;overflow:hidden;overflow-wrap:anywhere}
 .bottom{position:absolute;bottom:52px;left:73px;right:70px;border-top:1px solid #d8d0c6;padding-top:27px;display:flex;justify-content:space-between;color:#6c7b70;font-size:17px}
 .right{width:590px;position:relative;background:radial-gradient(circle at 150% 70%,#335d48,#1d3c30 78%);height:800px}
 .frame{position:absolute;top:38px;left:70px;width:470px;height:726px;overflow:hidden;border-radius:17px;background:#fff;box-shadow:0px 12px 42px #0b1b1544}
 .frame img{display:block;width:470px;height:750px;object-fit:cover;object-position:top center}
 .badge{position:absolute;top:55px;right:22px;background:#fff9ed;border:1px solid #d7cfbf;border-radius:40px;font-size:16px;padding:8px 14px;color:#495d4c}
 </style></head><body><div class="page"><section class="left"><div class="top"><img src="data:image/png;base64,${b64logo}" alt=""/><span>${svgEscape(title)}</span></div><h1>${svgEscape(heading)}</h1><p>${svgEscape(copy)}</p><div class="bottom"><span>${svgEscape(labels[locale])}</span><span>${index.toString().padStart(2,'0')} / 05</span></div></section><div class="right"><div class="frame"><img src="data:image/png;base64,${img}"/></div></div></div></body></html>`;
 const p=await browser.newPage();
 await p.setViewportSize({width:1280,height:800});
 try{await p.goto('data:text/html;charset=utf-8,'+encodeURIComponent(layout),{waitUntil:'load'});await p.evaluate(async()=>document.fonts.ready);return await p.screenshot({animations:'disabled'});}finally{await p.close()}
}
async function main(){
 const only=process.argv[2];const selected=only?[only]:locales;
 for(const l of selected)if(!native[l])throw Error('Bad locale '+l);
 for(const lang of selected){
  const userData=fs.mkdtempSync(path.join(os.tmpdir(),'qgg-native-store-'));
  const ctx=await chromium.launchPersistentContext(userData,{headless:true,executablePath:exe,locale:lang,args:['--lang='+lang,'--disable-extensions-except='+extensionRoot,'--load-extension='+extensionRoot]});
  try{
   const worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:16000});
   const extOrigin='chrome-extension://'+new URL(worker.url()).host;
   const page=await ctx.newPage();await page.setViewportSize({width:470,height:750});
   const popup=extOrigin+`/l10n/${lang}/popup.html`;
   await page.goto(popup,{waitUntil:'domcontentloaded'});
   const name=await textFromPage(page,'.brand h1');
   if(name!==native[lang].name)throw Error('Localized popup title mismatch '+lang+' '+name);
   const logo=fs.readFileSync(path.join(extensionRoot,'l10n/en/assets/icon-128.png'));
   const results=[];
   const add=async(step,heading,copy,source)=>results.push(await renderSlide(ctx,lang,step,results.length+1,source,heading,copy,logo));
   await add('mode',await textFromPage(page,'#modeView .section-title h2'),await textFromPage(page,'#modeView p.description'),await shot(page));
   await page.locator('#personalModeButton').click();
   await add('personal',await textFromPage(page,'#personalView .section-title h2'),await textFromPage(page,'#personalView .personal-feature p'),await shot(page));
   await page.locator('#personalBackButton').click();
   await page.locator('#communityModeButton').click();
   await add('community',await textFromPage(page,'#blocklistView .section-title h2'),await textFromPage(page,'#blocklistView .return-note'),await shot(page));
   await page.locator('#communityBackButton').click();
   await page.locator('#feedbackToggle').click();
   await add('feedback',await textFromPage(page,'#feedbackToggle'),await textFromPage(page,'.support-footer .support-copy'),await shot(page));
   const privacy=await ctx.newPage();await privacy.setViewportSize({width:470,height:750});
   await privacy.goto(extOrigin+`/l10n/${lang}/privacy.html`,{waitUntil:'domcontentloaded'});
   await add('privacy',await textFromPage(privacy,'h1'),await textFromPage(privacy,'p'),await shot(privacy));
   await privacy.close();await page.close();
   if(results.length!==5)throw Error('Expected exactly five screenshots');
   const names=['01-mode.png','02-personal.png','03-community.png','04-feedback.png','05-privacy.png'];
   const root=path.join(releaseRoot,rel(lang));
   for(const browser of ['Chrome','Edge','Firefox']){
    const folder=path.join(root,browser,lang);
    if(!fs.existsSync(folder))throw Error('Existing release screenshot directory missing '+folder);
    for(let i=0;i<5;i++)fs.writeFileSync(path.join(folder,names[i]),results[i]);
   }
   console.log('REAL_EXTENSION_NATIVE_UI_SCREENSHOTS_REGENERATED',lang,results.length,'Chrome+Edge+Firefox','native brand',native[lang].name,'PNG 1280x800');
  }finally{await ctx.close();fs.rmSync(userData,{recursive:true,force:true})}
 }
}
await main();

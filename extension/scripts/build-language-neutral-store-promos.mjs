/** Chrome / Edge promotional tiles are shared across languages.
 * Render text-free, language-neutral visuals; never reuse the English or
 * Chinese title on an unlocalizable global promo tile.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.QGG_PLAYWRIGHT_MODULE||'/tmp/qgg-playwright/node_modules/playwright-core');
const extensionRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const releaseRoot='/Volumes/15055751248/vibe的脚本/04-发布包/取关狗';
const exe=process.env.QGG_CHROMIUM_BINARY||path.join(os.homedir(),'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const logo=fs.readFileSync(path.join(extensionRoot,'l10n/en/assets/icon-128.png')).toString('base64');
const b=await chromium.launch({headless:true,executablePath:exe});
try{
 for(const [width,height,name] of [[440,280,'small-tile-440x280.png'],[1400,560,'large-tile-1400x560.png']]){
  const p=await b.newPage({viewport:{width,height},deviceScaleFactor:1});
  await p.goto('data:text/html,'+encodeURIComponent(`<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;width:${width}px;height:${height}px;background:radial-gradient(circle at 80% 28%,#356a51 0%,#163f30 56%,#122b23 100%);display:flex;align-items:center;justify-content:center;overflow:hidden}.circle{position:absolute;border:3px solid #e0d9bd44;border-radius:50%;width:${width*.89}px;height:${width*.89}px;left:${-width*.15}px;top:${-width*.16}px}.circle.alt{left:auto;top:auto;right:${-width*.18}px;bottom:${-width*.49}px;border-color:#efba8255}img{width:${Math.round(Math.min(width,height)*.44)}px;height:${Math.round(Math.min(width,height)*.44)}px;border-radius:23%;box-shadow:0 12px 38px #0b231b88}</style></head><body><div class="circle"></div><div class="circle alt"></div><img src="data:image/png;base64,${logo}" alt="" /></body></html>`),{waitUntil:'load'});
  const png=await p.screenshot();
  if(png.readUInt32BE(16)!==width||png.readUInt32BE(20)!==height)throw Error('Bad promo dimensions');
  for(const lang of ['ja','ko','fr','es','ms','vi','id']){
   const source=['ja','ko','fr','es'].includes(lang)?'新增四语商店上传图片-v0.2.68':'新增三语商店上传图片-v0.2.70';
   for(const target of ['Chrome','Edge']){
    const dest=path.join(releaseRoot,source,target,lang,name);
    if(!fs.existsSync(dest))throw Error('Expected existing promo '+dest);
    fs.writeFileSync(dest,png);
   }
  }
  // Chrome promotional tiles are global, not independently localized.
  // Reuse the same neutral artwork for historical Chinese and Traditional
  // promo filenames, so there is no English/Chinese global tile fallback.
  const chinesePromo={
   'small-tile-440x280.png':[
    '商店图片-v0.2.55-新版/Chrome/Chrome小推广图-440x280.png',
    '繁體中文商店圖片-v0.2.65/01-Chrome-繁體/取關狗-繁體-小型宣傳圖-440x280.png'],
   'large-tile-1400x560.png':[
    '商店图片-v0.2.55-新版/Chrome/Chrome大推广图-1400x560.png',
    '繁體中文商店圖片-v0.2.65/01-Chrome-繁體/取關狗-繁體-大型宣傳圖-1400x560.png']
  };
  for(const rel of chinesePromo[name]){
   const dest=path.join(releaseRoot,rel);
   if(!fs.existsSync(dest))throw Error('Missing original global promo '+dest);
   fs.writeFileSync(dest,png);
  }
  console.log('NEUTRAL_TEXT_FREE_UNLOCALIZABLE_PROMO_CREATED',name,'locales',9,'browsers',2,'bytes',png.length);
  await p.close();
 }
}finally{await b.close()}

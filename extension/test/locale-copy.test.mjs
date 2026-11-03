import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getScanRestartText } from '../lib/scan-restart-text.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const ui=['zh-CN','zh-TW','en','ja','ko','fr','es','ms','vi','id'];
const stores=['zh_CN','zh_TW','zh_HK','en','ja','ko','fr','es','ms','vi','id'];
const uiPath=(lang)=>lang==='zh-CN'?'popup.html':`l10n/${lang}/popup.html`;
const collectIds=(html)=>[...html.matchAll(/\bid="([^"]+)"/g)].map((m)=>m[1]);
test('all 11 store-language folders and metadata keys are present',()=>{
 const found=fs.readdirSync(path.join(root,'_locales')).filter(name=>fs.statSync(path.join(root,'_locales',name)).isDirectory()).sort();
 assert.deepEqual(found,stores.slice().sort());
 for(const lang of stores){
  const obj=JSON.parse(read(`_locales/${lang}/messages.json`));
  for(const key of ['extensionName','extensionShortName','extensionDescription','extensionNameChrome','extensionNameEdge','extensionDescriptionChrome'])
   assert.ok(obj[key]?.message?.length>=2,`${lang}/${key}`);
 }
 assert.deepEqual(JSON.parse(read('_locales/zh_TW/messages.json')),JSON.parse(read('_locales/zh_HK/messages.json')));
});
test('all ten selectable interfaces have every control, matching HTML IDs, with no duplicates',()=>{
 const base=collectIds(read('popup.html')).sort();
 for(const lang of ui){
  const html=read(uiPath(lang));
  const ids=collectIds(html);
  assert.deepEqual(ids.slice().sort(),base,`${lang} missing or extra fields`);
  assert.equal(new Set(ids).size,ids.length,`${lang} duplicate ID`);
  assert.ok(ids.includes('personalStallHelp'),`${lang} missing new progress-recovery help`);
  const cssRefs=(html.match(/href="[^\"]*locale-switch\.css"/g)||[]).length;
  assert.equal(cssRefs,1,`${lang} duplicated language-toggle stylesheet`);
 }
});
test('native-language pages contain no stray Chinese UI text outside Japanese and Chinese',()=>{
 for(const lang of ['en','ko','fr','es','ms','vi','id']){
  for(const doc of ['popup.html','privacy.html']){
   const html=read(`l10n/${lang}/${doc}`);
   assert.doesNotMatch(html,/[\u4e00-\u9fff]/u,`${lang}/${doc}`);
  }
 }
});
test('privacy notices preserve the same eight substantive sections',()=>{
 const sections=(html)=>(html.match(/<h[123]\b/g)||[]).length;
 const expected=sections(read('privacy.html'));
 for(const lang of ui){
  const doc=lang==='zh-CN'?'privacy.html':`l10n/${lang}/privacy.html`;
  assert.equal(sections(read(doc)),expected,`${lang}/privacy.html`);
 }
 assert.doesNotMatch(read('l10n/zh-TW/privacy.html'),/許可權|發帖內容/);
});
test('recovery texts are complete for all ten selectable UI languages',()=>{
 for(const lang of ui){
  const copy=getScanRestartText(lang);
  for(const key of ['restart','schedule','running','cooling','paused','helpNormal','helpMissing','helpStalled','helpCooling','helpPaused'])
    assert.ok(typeof copy[key]==='string' && copy[key].length>=5,`${lang}/${key}`);
 }
});
test('English and Traditional Chinese running views include current window-health and saved-progress handling',()=>{
 for(const lang of ['en','zh-TW']){
  const script=read(`l10n/${lang}/popup.js`);
  assert.match(script,/scanStallKind\(scan, scanWindowHealth\)/);
  assert.match(script,/GET_PERSONAL_SCAN_HEALTH/);
  assert.match(script,/#personalStallHelp/);
 }
 assert.doesNotMatch(read('l10n/zh-TW/popup.js'),/讀取消追蹤注/);
 assert.doesNotMatch(read('l10n/zh-TW/traditional-runtime.js'),/讀取消追蹤注|此賬戶已被暫時限制使用/);
});
test('other seven language runtimes translate composite progress labels and stopped state',()=>{
 for(const lang of ['ja','ko','fr','es','ms','vi','id']){
  const js=read(`l10n/${lang}/ui-runtime.js`);
  assert.match(js,/\["Followers\)"/);
  assert.match(js,/\["Following\)"/);
  assert.match(js,/\[" · scan progress has stopped"/);
  assert.match(js,/\["Reading saved pages…"/);
 }
});

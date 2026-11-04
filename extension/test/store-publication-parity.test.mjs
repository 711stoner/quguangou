import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const report=fs.readFileSync(path.join(root,'商店线上语言核验.md'),'utf8');
const locales=['zh-CN','zh-TW','en','ja','ko','fr','es','ms','vi','id'];

test('published-store report distinguishes 10 supported languages from 11 project regional configs',()=>{
 assert.match(report,/LIVE_CHROME_STORE_LOCALES_START/);
 assert.match(report,/LIVE_CHROME_STORE_LOCALES_END/);
 assert.match(report,/LOCALIZED_CHROME_IMAGE_REVIEW_START/);
 assert.match(report,/LOCALIZED_CHROME_IMAGE_REVIEW_END/);
 for(const lang of locales){
  assert.ok(report.includes(`?hl=${lang}`),lang);
  assert.ok(report.includes(`\`${lang}\``),lang);
 }
 assert.match(report,/zh_HK.*zh_TW/);
 // Seven international screenshots were regenerated from real v0.2.75
 // extension UI, while the older Chinese, Traditional and English sets still
 // require an individual visual review. Never reclassify regenerated images as
 // legacy just to satisfy an outdated string assertion.
 assert.match(report,/七种非英语语言的 35 张已按 v0\.2\.75 真实插件界面重新拍摄/);
 assert.match(report,/中文、繁体及英文沿用原图/);
 assert.match(report,/仍需逐张对照 v0\.2\.75 的旧截图/);
 assert.match(report,/8 种语言|八种语言/);
 assert.match(report,/搜索.*语言/);
});

test('source project retains a single fixed set of supported store titles and a language-safe canonical manifest',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 const seo=JSON.parse(fs.readFileSync(path.join(root,'商店SEO文案.json'),'utf8'));
 assert.equal(m.name,'__MSG_extensionName__');
 assert.equal(m.description,'__MSG_extensionDescription__');
 assert.equal(m.default_locale,'zh_CN');
 assert.equal(Object.keys(seo).length,11);
 assert.deepEqual(seo.zh_HK,seo.zh_TW);
 for(const loc of ['zh_CN','zh_TW','en','ja','ko','fr','es','ms','vi','id']){
  const messages=JSON.parse(fs.readFileSync(path.join(root,'_locales',loc,'messages.json'),'utf8'));
  assert.equal(messages.extensionName.message,seo[loc].title,loc);
  assert.equal(messages.extensionDescription.message,seo[loc].short,loc);
 }
});

test('live-store metadata classifier separates a Japanese storefront suffix from a Japanese extension name',()=>{
 const result=spawnSync('python3',[path.join(root,'scripts','audit-chrome-store-locales.py'),'--self-test'],{encoding:'utf8',timeout:12000});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/OFFLINE_TESTS_PASS/);
});

test('Chromium release uses only supported i18n locale folders; Hong Kong retains the Traditional compatibility source',()=>{
 const build=fs.readFileSync(path.join(root,'scripts/build.py'),'utf8');
 assert.match(build,/chromium_locales=tuple\(lang for lang in languages if lang!='zh_HK'\)/);
 assert.match(build,/if browser in \('chrome','edge'\) and rel\.parts\[:2\]==\('_locales','zh_HK'\)/);
 assert.match(build,/assert '_locales\/zh_TW\/messages\.json' in names/);
 assert.ok(fs.existsSync(path.join(root,'_locales/zh_HK/messages.json')),'Keep HK region source without shipping unsupported Chromium locale');
});

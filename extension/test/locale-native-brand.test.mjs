import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const names=JSON.parse(fs.readFileSync(path.join(root,'本地化产品名称.json'),'utf8'));
const seo=JSON.parse(fs.readFileSync(path.join(root,'商店SEO文案.json'),'utf8'));
const locales=['ja','ko','fr','es','ms','vi','id'];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('every international non-English title and store description uses its own native-language brand',()=>{
 assert.deepEqual(Object.keys(names).sort(),locales.slice().sort());
 for(const lang of locales){
  const {name,title}=names[lang];
  assert.ok(name.length>5,lang);
  assert.equal(seo[lang].title,title,lang);
  assert.ok(title.includes(name),lang);
  assert.ok(title.length<=45,lang);
  assert.ok(!title.includes('Followback Watchdog'),`${lang}: leaked English brand`);
  assert.ok(!seo[lang].long.includes('Followback Watchdog'),`${lang}: long description leaked English`);
  assert.ok(!seo[lang].long.includes('取关狗'),`${lang}: long description leaked Chinese`);
  const messages=JSON.parse(read(`_locales/${lang}/messages.json`));
  for(const field of ['extensionName','extensionNameChrome','extensionNameEdge'])
   assert.equal(messages[field].message,title,`${lang} / ${field}`);
 }
 assert.ok(seo.en.title.includes('Followback Watchdog'),'English version remains English');
 assert.ok(seo.zh_CN.title.includes('取关狗'),'Simplified version remains Chinese');
 assert.ok(seo.zh_TW.title.includes('取關狗'),'Traditional version remains Traditional Chinese');
});

test('localized popup title, first heading, support and website copy contain no English product branding',()=>{
 for(const lang of locales){
  const html=read(`l10n/${lang}/popup.html`);
  assert.ok(html.includes(`<title>${names[lang].name}</title>`),`${lang}: popup title inconsistent`);
  assert.ok(html.includes(`<h1>${names[lang].name}</h1>`),`${lang}: visible popup heading inconsistent`);
  assert.ok(!html.includes('Followback Watchdog'),`${lang}: untranslated English popup text`);
  assert.ok(!html.includes('取关狗'),`${lang}: Chinese popup text`);
  const privacy=read(`l10n/${lang}/privacy.html`);
  assert.ok(!privacy.includes('Followback Watchdog'),`${lang}: privacy page English brand`);
 }
});

test('runtime translation dictionaries preserve English lookup keys but translate English product name only into native text',()=>{
 for(const lang of locales){
  const source=read(`l10n/${lang}/ui-runtime.js`);
  const match=source.match(/const dictionary=(\{[^\n]+\});/);
  assert.ok(match,`${lang}: no reviewed runtime dictionary`);
  const translations=JSON.parse(match[1]);
  assert.ok(Object.keys(translations).length>=190,`${lang}: missing UI translation keys`);
  const leaked=Object.entries(translations).filter(([key,value])=>value.includes('Followback Watchdog')||value.includes('取关狗'));
  assert.deepEqual(leaked,[],`${lang}: untranslated runtime values`);
  if(Object.hasOwn(translations,'Followback Watchdog'))
   assert.equal(translations['Followback Watchdog'],names[lang].name,`${lang}: brand mapping`);
  assert.ok(source.includes('const dictionary='),`${lang}: dictionary preserved`);
 }
});

test('the SEO generator, build script and locale registry are all stable single sources',()=>{
 const gen=read('scripts/sync-store-seo.py');
 assert.ok(gen.includes("len(title)<=45"));
 assert.ok(gen.includes("'extensionNameChrome'"));
 assert.ok(read('scripts/build.py').includes('chromium_locales'));
 assert.ok(read('README.md').includes('取关狗'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceLocales=['zh_CN','zh_TW','en','ja','ko','fr','es','ms','vi','id'];
const pages={'zh-CN':'','zh-TW':'zh-hant',en:'en',ja:'ja',ko:'ko',fr:'fr',es:'es',ms:'ms',vi:'vi',id:'id'};

test('the one-product, ten-locales publishing path is documented without creating ten separate extensions',()=>{
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 const seo=JSON.parse(fs.readFileSync(path.join(root,'商店SEO文案.json'),'utf8'));
 const guide=fs.readFileSync(path.join(root,'商店SEO上架文案.md'),'utf8');
 assert.equal(cfg.version,'0.2.75');
 assert.equal(cfg.default_locale,'zh_CN');
 assert.equal(cfg.name,'__MSG_extensionName__');
 assert.equal(cfg.description,'__MSG_extensionDescription__');
 assert.deepEqual(sourceLocales.every(x=>fs.existsSync(path.join(root,'_locales',x,'messages.json'))),true);
 assert.ok(guide.includes('只向既有商品'));
 assert.ok(guide.includes('一个插件 ID'));
 assert.ok(guide.includes('全球图片回退'));
 assert.ok(guide.includes('手动选语言'));
 for(const loc of sourceLocales){
  const message=JSON.parse(fs.readFileSync(path.join(root,'_locales',loc,'messages.json'),'utf8'));
  assert.equal(message.extensionName.message,seo[loc].title,loc);
  assert.equal(message.extensionDescription.message,seo[loc].short,loc);
  assert.ok(guide.includes(`## `)&&guide.includes(`— ${loc}`),loc);
 }
});

test('all installed privacy links use the same native-language product routes as the publishing campaign',()=>{
 for(const [loc,slug] of Object.entries(pages)){
  const file=loc==='zh-CN'?'privacy.html':`l10n/${loc}/privacy.html`;
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const target=`https://jiedanfadan.com/quguangou/${slug?slug+'/':''}`;
  assert.ok(html.includes(`href="${target}"`),`${loc}: wrong locale website`);
 }
});

test('the language-routing code prioritizes a deliberate user override, otherwise follows browser locale',()=>{
 const js=fs.readFileSync(path.join(root,'locale-redirect.js'),'utf8');
 assert.match(js,/chrome\.i18n\.getUILanguage\(\)/);
 assert.match(js,/quguangouUILanguageV1/);
 assert.match(js,/if \(Object\.hasOwn\(routes, saved\?\.\[KEY\]\)\) selected = saved\[KEY\]/);
 for(const slug of Object.values(pages))if(slug)assert.ok(js.includes(slug==='zh-hant'?'zh-TW':slug),slug);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const seo=JSON.parse(read('商店SEO文案.json'));
const sourceLocales=['zh_CN','zh_TW','zh_HK','en','ja','ko','fr','es','ms','vi','id'];

test('all 11 regional entries comply with official Chrome/Edge/Firefox listing character limits',()=>{
 assert.deepEqual(Object.keys(seo).sort(),sourceLocales.slice().sort());
 for(const loc of sourceLocales){
  const {title,short,long,edge_search_terms:terms}=seo[loc];
  assert.ok(title.length>=5&&title.length<=45,`${loc}: Edge and AMO name maximum 45`);
  assert.ok(title.length<=75,`${loc}: Chrome name maximum 75`);
  assert.ok(short.length>=20&&short.length<=132,`${loc}: Chromium manifest summary maximum 132`);
  assert.ok(short.length<=250,`${loc}: AMO listing summary maximum 250`);
  assert.ok(long.length>=250&&long.length<=10_000,`${loc}: Edge full listing description 250–10000`);
  assert.ok(Array.isArray(terms)&&terms.length>=1&&terms.length<=7,`${loc}: Edge max seven terms`);
  assert.equal(new Set(terms.map(t=>t.toLocaleLowerCase())).size,terms.length,`${loc}: duplicate terms`);
  assert.ok(terms.every(t=>t===t.trim()&&t.length<=30&&t.length>=1&&!/[\n\r]/.test(t)),`${loc}: Edge 30-char term cap`);
  assert.ok(terms.reduce((n,t)=>n+t.split(/\s+/u).length,0)<=21,`${loc}: Edge max 21 words`);
  const m=JSON.parse(read(`_locales/${loc}/messages.json`));
  for(const field of ['extensionName','extensionNameChrome','extensionNameEdge'])
   assert.equal(m[field].message,title,`${loc}/${field}`);
  for(const field of ['extensionDescription','extensionDescriptionChrome'])
   assert.equal(m[field].message,short,`${loc}/${field}`);
 }
 assert.deepEqual(seo.zh_TW,seo.zh_HK,'Hong Kong uses the reviewed Traditional translation');
});

test('no listings claim historical unfollow tracking or guaranteed mass action success',()=>{
 for(const [loc,e] of Object.entries(seo)){
  const name=e.title;
  assert.doesNotMatch(name,/100\s*%|guaranteed|official X|官方认证|官方認證|無料で無制限|永久無制限/i,loc);
  assert.ok(e.long.trim().length>=e.short.trim().length,loc);
  assert.ok(!/\bhttps?:\/\//i.test(e.title),`${loc}: URL in name`);
  assert.ok(!/\bhttps?:\/\//i.test(e.short),`${loc}: URL in summary`);
 }
});

test('the unique canonical SEO generator blocks overlong Edge/AMO titles, terms and description',()=>{
 const script=read('scripts/sync-store-seo.py');
 for(const part of [
  "5<=len(title)<=45", "20<=len(short)<=132", "len(short)<=250",
  "250<=len(long)<=10000", "len(terms)<=7", "len(t)<=30", "sum(len(t.split()) for t in terms)<=21"
 ])assert.ok(script.includes(part),`Missing official policy check ${part}`);
 const guide=read('商店SEO上架文案.md');
 assert.match(guide,/三端官方规则与本地 SEO 长度核对/);
 assert.match(guide,/Firefox AMO 页面只允许一组共用截图/);
 assert.match(guide,/Edge 搜索词/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const canonical=JSON.parse(fs.readFileSync(path.join(root,'商店SEO文案.json'),'utf8'));
const locales=['zh_CN','zh_TW','zh_HK','en','ja','ko','fr','es','ms','vi','id'];
test('SEO source includes 11 regional configurations without losing either Traditional Chinese locale',()=>{
  assert.deepEqual(Object.keys(canonical).sort(),locales.slice().sort());
  assert.deepEqual(canonical.zh_TW,canonical.zh_HK);
  assert.notDeepEqual(canonical.zh_TW,canonical.zh_CN);
});
test('all 11 storefront titles, summaries, and long descriptions satisfy metadata limits',()=>{
  for(const lang of locales){
    const e=canonical[lang];
    assert.ok(e.title.length>=5 && e.title.length<=75,`${lang} name ${e.title.length}`);
    assert.ok(e.short.length>=20 && e.short.length<=132,`${lang} short ${e.short.length}`);
    assert.ok(e.long.length>=250 && e.long.length<=10000,`${lang} full desc ${e.long.length}`);
    assert.ok(!e.long.match(/(?:##|#keyword|\bSEO\b)/),`${lang} unnatural long description`);
    assert.ok(!e.short.match(/\n/),`${lang} short description newlines`);
  }
});
test('Edge search terms comply with max 7, <=30 chars per term, <=21 words total',()=>{
  for(const lang of locales){
    const terms=canonical[lang].edge_search_terms;
    assert.ok(terms.length>=1 && terms.length<=7,lang);
    assert.equal(new Set(terms).size,terms.length,lang);
    assert.ok(terms.every(term=>term.length>=1 && term.length<=30),lang);
    assert.ok(terms.reduce((n,term)=>n+term.trim().split(/\s+/).length,0)<=21,lang);
  }
});
test('store metadata inside all 11 _locales matches canonical human-written copy',()=>{
  for(const lang of locales){
    const dir=path.join(root,'_locales',lang,'messages.json');
    const m=JSON.parse(fs.readFileSync(dir,'utf8'));
    for(const key of ['extensionName','extensionNameChrome','extensionNameEdge'])
      assert.equal(m[key].message,canonical[lang].title,`${lang} ${key}`);
    for(const key of ['extensionDescription','extensionDescriptionChrome'])
      assert.equal(m[key].message,canonical[lang].short,`${lang} ${key}`);
  }
});
test('every locale has its own meaningful copy, apart from the shared zh_TW/zh_HK pair',()=>{
  for(const lang of locales){
    if(lang==='zh_HK')continue;
    for(const other of locales){
      if(other===lang || other==='zh_HK')continue;
      assert.notEqual(canonical[lang].long,canonical[other].long,`${lang}/${other} duplicated copy`);
    }
  }
});
test('current listing guide has all languages and explicitly describes history and upload workflow',()=>{
  const doc=fs.readFileSync(path.join(root,'商店SEO上架文案.md'),'utf8');
  for(const loc of locales)assert.ok(doc.includes('— '+loc),loc);
  assert.ok(doc.includes('不会因为上传 ZIP 自动填好'));
  assert.ok(doc.includes('历史'));
});

test('English keeps English branding, while seven other international titles use entirely native brand names',()=>{
 const brands=JSON.parse(fs.readFileSync(path.join(root,'本地化产品名称.json'),'utf8'));
 assert.ok(canonical.en.title.includes('Followback Watchdog'));
 for(const lang of ['ja','ko','fr','es','ms','vi','id']){
  assert.ok(canonical[lang].title.includes(brands[lang].name),lang);
  assert.ok(!canonical[lang].title.includes('Followback Watchdog'),lang);
 }
 for(const lang of ['zh_CN','zh_TW','zh_HK'])assert.match(canonical[lang].title,/取[关關]狗/,lang);
});
test('upload guide distinguishes eleven project configs from supported Chrome locales and requires release version increment',()=>{
 const guide=fs.readFileSync(path.join(root,'商店SEO上架文案.md'),'utf8');
 assert.ok(guide.includes('Chrome 官方扩展 locale 列表'), 'Chrome locale compatibility note');
 assert.ok(guide.includes('没有独立的 `zh_HK`'), 'No unsupported HK store listing claims');
 assert.ok(guide.includes('重新上传版本号'), 'Store version increment reminder');
 assert.ok(guide.includes('ZIP 始终只保留固定文件名'), 'Keep stable artifact names');
});

test('live store mismatch is documented and existing package is newer than public 0.2.63',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 const report=fs.readFileSync(path.join(root,'商店线上语言核验.md'),'utf8');
 const pub=[0,2,63],cur=manifest.version.split('.').map(Number);
 assert.ok(cur.some((v,i)=>v!==pub[i]) && (cur[0]*1e6+cur[1]*1e3+cur[2])>(pub[0]*1e6+pub[1]*1e3+pub[2]));
 assert.match(report,/0\.2\.63/);
 assert.match(report,new RegExp(manifest.version.replaceAll('.','\\.')));
 assert.match(report,/搜索关键词不控制/);
 assert.match(report,/尚未完成实际线上上传\/发布/);
});
test('store listing release guide includes exact localized official Chrome Web Store entry points',()=>{
 const doc=fs.readFileSync(path.join(root,'商店SEO上架文案.md'),'utf8');
 for(const loc of ['zh-CN','zh-TW','en','ja','ko','fr','es','ms','vi','id']){
  assert.ok(doc.includes(`https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl=${loc}`),loc);
 }
 assert.ok(doc.includes('搜索词不决定展示语言')||doc.includes('搜索词不决定展示语言。'));
});

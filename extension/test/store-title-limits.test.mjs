import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const seo=JSON.parse(fs.readFileSync(path.join(root,'商店SEO文案.json'),'utf8'));
const regions=['zh_CN','zh_TW','zh_HK','en','ja','ko','fr','es','ms','vi','id'];

test('all 11 regional name/description strings fit Edge and Mozilla manifest limits as well as Chrome limits',()=>{
 for(const region of regions){
  const entry=seo[region];
  assert.ok(entry,region);
  assert.ok(entry.title.length<=45,`${region}: name ${entry.title.length} > 45`);
  assert.ok(entry.short.length<=132,`${region}: description ${entry.short.length} > 132`);
  assert.ok(entry.long.length>=250,`${region}: insufficient full description`);
  const locale=JSON.parse(fs.readFileSync(path.join(root,'_locales',region,'messages.json'),'utf8'));
  assert.equal(locale.extensionName.message,entry.title,`${region}: title differs from install package`);
  assert.equal(locale.extensionDescription.message,entry.short,`${region}: summary differs from install package`);
 }
 assert.deepEqual(seo.zh_HK,seo.zh_TW,'Hong Kong and Taiwan share the Traditional Chinese store text');
});

const nativeNames=Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(root,'本地化产品名称.json'),'utf8'))).map(([lang,x])=>[lang,x.name]));
test('new localized names keep core non-follower intent and identifiable brand without Chinese leftovers',()=>{
 for(const region of ['ja','ko','fr','es','ms','vi','id']){
  const title=seo[region].title;
  assert.ok(title.includes(nativeNames[region]),`${region} native brand name absent`);
  assert.doesNotMatch(title,/Followback Watchdog|取关狗|取關狗|未回关|黑名单|批量拉黑|商单搭档/u,`${region} contains untranslated English or Chinese branding`);
 }
});

test('all release builds enforce localized metadata limits at construction time',()=>{
 const build=fs.readFileSync(path.join(root,'scripts/build.py'),'utf8');
 assert.ok(build.includes("len(msgs['extensionName']['message'])<=45"));
 assert.ok(build.includes("len(msgs['extensionDescription']['message'])<=132"));
});

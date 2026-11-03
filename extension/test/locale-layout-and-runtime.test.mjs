import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getScanRestartText} from '../lib/scan-restart-text.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const all=['zh-CN','zh-TW','en','ja','ko','fr','es','ms','vi','id'];
const translated=all.filter(x=>x!=='zh-CN');
const read=(n)=>fs.readFileSync(path.join(root,n),'utf8');
const entry=lang=>lang==='zh-CN'?'popup.html':`l10n/${lang}/popup.html`;
const tags=(s)=>[...s.matchAll(/<\s*([a-z][a-z0-9-]*)\b/g)].map(m=>m[1]).filter(x=>!['script','meta','link'].includes(x));
const ids=(s)=>[...s.matchAll(/\bid="([^\"]+)"/g)].map(m=>m[1]).sort();
test('all ten selectable UIs exactly match the Chinese element order and control IDs',()=>{
 const baseline=read('popup.html');
 const tagsCn=tags(baseline), idsCn=ids(baseline);
 assert.equal(idsCn.length,85);
 for(const lang of all){
  const html=read(entry(lang));
  assert.deepEqual(tags(html),tagsCn,`structural element mismatch: ${lang}`);
  assert.deepEqual(ids(html),idsCn,`IDs mismatch: ${lang}`);
  const footer=html.match(/<footer>(.*?)<\/footer>/s)?.[1]||'';
  assert.equal((footer.match(/<a\b/g)||[]).length,1,`footer link parity: ${lang}`);
  assert.equal((html.match(/\bpopup\.css"/g)||[]).length,1,`shared styling: ${lang}`);
  assert.doesNotMatch(html,/\b(?:english|traditional)\.css"/,`special case CSS: ${lang}`);
  assert.ok(html.includes('id="personalStallHelp"'),`latest recovery help: ${lang}`);
  const match=html.match(/<html lang="([^"]+)">/);
  assert.equal(match?.[1],lang);
 }
});
test('all locale HTML references a real brand image in the single working directory',()=>{
 for(const lang of all){
  const page=entry(lang),html=read(page);
  for(const ref of [...html.matchAll(/<img\s+[^>]*src="([^"]+)"/g)]){
   const file=path.resolve(root,path.dirname(page),ref[1]);
   assert.ok(fs.existsSync(file),`${lang}: ${ref[1]} does not exist`);
  }
 }
});
test('11 region store metadata include both Traditional locales with identical native text',()=>{
 const locales=['zh_CN','zh_TW','zh_HK','en','ja','ko','fr','es','ms','vi','id'];
 assert.deepEqual(fs.readdirSync(path.join(root,'_locales')).filter(x=>fs.statSync(path.join(root,'_locales',x)).isDirectory()).sort(),locales.sort());
 const messages=locale=>JSON.parse(read(`_locales/${locale}/messages.json`));
 assert.deepEqual(messages('zh_HK'),messages('zh_TW'));
 assert.notDeepEqual(messages('zh_CN'),messages('zh_TW'));
});
test('remaining 9 languages do not reverse the non-followback feature meaning',()=>{
 assert.match(read('l10n/es/popup.html'),/no te sigue de vuelta/i);
 assert.doesNotMatch(read('l10n/es/popup.html'),/Comprueba quién te sigue de vuelta/);
 assert.match(read('l10n/fr/popup.html'),/ne vous suivent pas en retour/);
 assert.match(read('l10n/zh-TW/popup.html'),/沒有回追/);
 for(const lang of ['en','ko','fr','es','ms','vi','id']){
  const content=read(entry(lang));
  assert.doesNotMatch(content,/[\u4e00-\u9fff]/u,`Chinese residue in ${lang}`);
 }
});
test('native dynamic dictionaries preserve English source token boundaries in Latin-script languages',()=>{
 for(const lang of ['ms','vi','id']){
  const script=read(`l10n/${lang}/ui-runtime.js`);
  const match=script.match(/const segments=(\[.*?\]);/s);
  assert.ok(match,lang);
  const segments=JSON.parse(match[1]);
  assert.equal(segments.length,64,`${lang} template fragment count`);
  for(const [source,target] of segments){
   if(source.startsWith(' '))assert.ok(target.startsWith(' '),`${lang} missing opening separator for ${source}`);
   if(source.endsWith(' '))assert.ok(target.endsWith(' '),`${lang} missing end separator for ${source}`);
  }
 }
});
test('scan-window guidance is native-language and foreground advice is present everywhere',()=>{
 const nativeTokens={
  'zh-CN':'前台','zh-TW':'最前面',en:'foreground',ja:'最前面',ko:'맨 앞에',
  fr:'premier plan',es:'primer plano',ms:'di hadapan',vi:'phía trước',id:'di depan'
 };
 for(const lang of all){
  const text=getScanRestartText(lang);
  assert.ok(text.helpNormal.includes(nativeTokens[lang]),lang);
  for(const label of ['helpNormal','helpMissing','helpStalled','helpCooling','helpPaused','restart'])
   assert.ok(text[label]?.length>10,`${lang} ${label}`);
 }
});
test('English action selection captions do not mix CJK full-width parentheses',()=>{
 assert.doesNotMatch(read('l10n/en/popup.js'),/Block selected \(\$\{count\}）|Unfollow selected \(\$\{count\}）/);
});
test('English, Traditional and seven other locale controllers preserve recovery behavior',()=>{
 for(const l of ['en','zh-TW']){
  const s=read(`l10n/${l}/popup.js`);
  assert.match(s,/scanStallKind\(scan, scanWindowHealth\)/);
  assert.match(s,/GET_PERSONAL_SCAN_HEALTH/);
 }
 for(const l of ['ja','ko','fr','es','ms','vi','id']){
  const s=read(`l10n/${l}/ui-runtime.js`);
  assert.match(s,/const dictionary=/);
  assert.match(s,/const segments=/);
  assert.match(s,/window\.QGDTranslateUI/);
 }
});

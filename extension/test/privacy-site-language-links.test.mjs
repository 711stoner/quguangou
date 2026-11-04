import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cases={
 'zh-CN':'', 'zh-TW':'zh-hant',en:'en',ja:'ja',ko:'ko',fr:'fr',
 es:'es',ms:'ms',vi:'vi',id:'id'
};

test('all privacy notices link directly to the matching published-language product site',()=>{
 for(const [lang,slug] of Object.entries(cases)){
  const rel=lang==='zh-CN'?'privacy.html':`l10n/${lang}/privacy.html`;
  const text=fs.readFileSync(path.join(root,rel),'utf8');
  const url=`https://jiedanfadan.com/quguangou/${slug?slug+'/':''}`;
  assert.ok(text.includes(`href="${url}"`),`${lang}: wrong product-site language`);
  assert.doesNotMatch(text,/711stoner\.github\.io\/quguangou\/en\//,`${lang}: outdated English-only website`);
  if(lang!=='zh-CN')assert.ok(!text.includes('href="https://jiedanfadan.com/quguangou/"'),`${lang}: Simplified Chinese fallback`);
 }
});

test('non-English notices do not advertise a destination as English-only',()=>{
 const stale={'ja':'公式サイト（英語）','ko':'웹사이트(영어)',fr:'Site web (en anglais)',es:'Sitio web (en inglés)',ms:'Laman web (Inggeris)',vi:'Trang web (tiếng Anh)',id:'Situs web (Inggris)'};
 for(const [loc,phrase] of Object.entries(stale)){
  const text=fs.readFileSync(path.join(root,`l10n/${loc}/privacy.html`),'utf8');
  assert.ok(!text.includes(phrase),`${loc}: stale language label in privacy policy`);
 }
});

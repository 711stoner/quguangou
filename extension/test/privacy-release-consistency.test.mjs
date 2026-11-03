import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dates={
 'zh-CN':'2026 年 11 月 4 日',
 'zh-TW':'2026 年 11 月 4 日',
 en:'November 4, 2026',
 ja:'2026年11月4日',
 ko:'2026년 11월 4일',
 fr:'4 novembre 2026',
 es:'4 de noviembre de 2026',
 ms:'4 November 2026',
 vi:'4 tháng 11 năm 2026',
 id:'4 November 2026'
};

test('all privacy notices are current for the upload and retain data-sharing disclosures',()=>{
 for(const [lang,date] of Object.entries(dates)){
  const rel=lang==='zh-CN'?'privacy.html':`l10n/${lang}/privacy.html`;
  const s=fs.readFileSync(path.join(root,rel),'utf8');
  assert.ok(s.includes(date),`${lang}: outdated privacy date`);
  assert.ok(!s.includes('October 3, 2026')&&!s.includes('10月3日'),`${lang}: stale old date`);
  assert.equal((s.match(/<h2\b/g)||[]).length,8,`${lang}: missing privacy section`);
  assert.equal((s.match(/<p\b/g)||[]).length,(s.match(/<\/p>/g)||[]).length,`${lang}: unbalanced paragraphs`);
  assert.ok(s.includes('jiedanfadan.com/'),`${lang}: optional rate-check destination not disclosed`);
  assert.ok(s.includes('quguangou-locale-community.juejiangfm.workers.dev'),`${lang}: international data receiver not disclosed`);
 }
});

test('release manifest does not request unnecessary broad hosts or privileged cookies',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 assert.equal(m.manifest_version,3);
 assert.ok(m.host_permissions.length<=3);
 assert.ok(m.host_permissions.every(h=>h.startsWith('https://')));
 assert.ok(m.host_permissions.every(h=>!h.includes('<all_urls>')));
 for(const permission of ['cookies','webRequest','debugger','tabs','history'])
  assert.ok(!m.permissions.includes(permission),`unexpected sensitive permission ${permission}`);
});

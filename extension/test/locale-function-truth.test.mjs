import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getScanRestartText} from '../lib/scan-restart-text.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const locales=['zh_CN','zh_TW','zh_HK','en','ja','ko','fr','es','ms','vi','id'];
const uiLangs=['zh-CN','zh-TW','en','ja','ko','fr','es','ms','vi','id'];
const listing=JSON.parse(read('商店SEO文案.json'));

test('11 regional storefront configs exist, including separate Traditional Chinese HK and TW entries',()=>{
 assert.deepEqual(Object.keys(listing).sort(),locales.slice().sort());
 assert.deepEqual(listing.zh_TW,listing.zh_HK);
 for(const loc of locales){
  const metadata=JSON.parse(read(`_locales/${loc}/messages.json`));
  assert.equal(metadata.extensionName.message,listing[loc].title,loc);
  assert.equal(metadata.extensionDescription.message,listing[loc].short,loc);
 }
});

test('all 11 localized store descriptions distinguish community blocking from personal-mode unfollowing',()=>{
 const keywords={
  zh_CN:['社区名单模式','分批拉黑','私人账号模式','取关'],
  zh_TW:['社群名單模式','分批封鎖','個人帳號模式','取消追蹤'],
  zh_HK:['社群名單模式','分批封鎖','個人帳號模式','取消追蹤'],
  en:['Community blocklist','choose to block','personal account scan','unfollow'],
  ja:['コミュニティリスト','ブロック','個人アカウント','フォロー解除'],
  ko:['커뮤니티 차단 목록','일괄 차단','개인 계정 검사','언팔로우'],
  fr:['Liste de blocage communautaire','bloquer','analyse du compte personnel','désabonner'],
  es:['Lista de bloqueos comunitaria','bloquear','cuenta personal','dejar de seguir'],
  ms:['Mod Senarai Sekatan Komuniti','disekat','Akaun Peribadi','berhenti mengikuti'],
  vi:['Danh sách chặn cộng đồng','để chặn','tài khoản cá nhân','bỏ theo dõi'],
  id:['Mode Daftar Blokir Komunitas','diblokir','Akun Pribadi','berhenti mengikuti']
 };
 for(const loc of locales){
  const long=listing[loc].long;
  for(const key of keywords[loc])assert.ok(long.includes(key),`${loc}: missing ${key}`);
  assert.ok(long.length>=250,`${loc} full description too short`);
  if(['fr','es','ms','vi','id','en'].includes(loc))assert.doesNotMatch(long,/[\u4e00-\u9fff]/u,loc);
 }
 assert.doesNotMatch(listing.es.long,/historial de unfollows/i,'unnatural Spanish store copy');
});

test('every interface has natural native reasons for followback, restricted profile and paid subscription skip',()=>{
 for(const lang of uiLangs){
  const copy=getScanRestartText(lang);
  for(const key of ['skipFollowsYou','skipRestricted','skipSubscription','skipRestrictedTitle','skipSubscriptionTitle']){
   assert.ok(copy[key]?.length>=(key.endsWith("Title")?8:15),`${lang}/${key}`);
  }
  assert.ok(copy.skipFollowsYou!==copy.skipRestricted,lang);
  assert.ok(copy.skipSubscription!==copy.skipRestricted,lang);
  if(!['zh-CN','zh-TW'].includes(lang)){
   for(const key of ['skipFollowsYou','skipRestricted','skipSubscription'])
    assert.doesNotMatch(copy[key],/取关狗|白名单|未回关/,`${lang}/${key}: nonnative fragment`);
  }
 }
});

test('skip reason statuses in three controllers rely on native translations, not raw backend diagnostics',()=>{
 for(const rel of ['popup.js','l10n/zh-TW/popup.js','l10n/en/popup.js']){
  const src=read(rel);
  assert.match(src,/nativeReasons\.skipFollowsYou/,rel);
  assert.match(src,/nativeReasons\.skipRestricted/,rel);
  assert.match(src,/nativeReasons\.skipSubscription/,rel);
  assert.match(src,/\.skipRestrictedTitle/,rel);
  assert.match(src,/\.skipSubscriptionTitle/,rel);
 }
});

test('all ten localized privacy pages have the same eight policy sections and one working link element',()=>{
 const sectionTitlesCount=source=>(source.match(/<h2\b/g)||[]).length;
 const contactLinksCount=source=>(source.match(/<a\s+href=/g)||[]).length;
 for(const lang of uiLangs){
  const rel=lang==='zh-CN'?'privacy.html':`l10n/${lang}/privacy.html`;
  const source=read(rel);
  assert.equal(sectionTitlesCount(source),8,lang);
  assert.equal(contactLinksCount(source),1,lang);
  assert.match(source,/jiedanfadan\.com|711stoner\.github\.io/,lang);
 }
});

test('Traditional Chinese user-visible copy uses conventional words instead of machine-like variants',()=>{
 for(const rel of ['l10n/zh-TW/popup.html','l10n/zh-TW/popup.js','l10n/zh-TW/privacy.html']){
  const content=read(rel);
  assert.doesNotMatch(content,/稽核|引數|後臺|生成|當前/,rel);
 }
});

test('all ten privacy notices explain local whitelist backups and cross-installation isolation in native language',()=>{
 const terms={
  'zh-CN':['白名单','备份','当前浏览器'],
  'zh-TW':['白名單','備份','目前瀏覽器'],
  en:['whitelist','backup','browser profile'],
  ja:['保護リスト','バックアップ','ブラウザープロフィール'],
  ko:['보호 목록','백업','브라우저 프로필'],
  fr:['liste de protection','sauvegarde','profil de navigateur'],
  es:['lista de protección','copia de seguridad','perfil de navegador'],
  ms:['senarai perlindungan','sandaran','profil penyemak imbas'],
  vi:['danh sách bảo vệ','dự phòng','hồ sơ trình duyệt'],
  id:['daftar perlindungan','cadangan','profil browser']
 };
 for(const lang of uiLangs){
  const source=read(lang==='zh-CN'?'privacy.html':`l10n/${lang}/privacy.html`).toLocaleLowerCase();
  for(const needle of terms[lang]) assert.ok(source.includes(needle.toLocaleLowerCase()),`${lang}/${needle}`);
 }
});

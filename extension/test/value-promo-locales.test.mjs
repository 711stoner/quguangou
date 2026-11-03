import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const locales={'zh-CN':'zh-cn','zh-TW':'zh-hant',en:'en',ja:'ja',ko:'ko',fr:'fr',es:'es',ms:'ms',vi:'vi',id:'id'};
const placementCampaigns={valuePromo:'block_complete',stickyValuePromo:'cooldown_value',homeValuePromo:'home_value'};

test('all ten UI languages have three native sponsored-rate entry points with matching URLs and safe external clicks',()=>{
 for(const [lang,slug] of Object.entries(locales)){
  const text=read(lang==='zh-CN'?'popup.html':`l10n/${lang}/popup.html`);
  for(const [id,campaign] of Object.entries(placementCampaigns)){
   const element=new RegExp(`<\\w+[^>]+id="${id}"[^>]*>([\\s\\S]*?)<\\/(?:div|aside)>`,'m').exec(text);
   assert.ok(element,`${lang} missing ${id}`);
   const content=element[1];
   const href=content.match(/href="([^"]*\/value-check[^\"]*)"/)?.[1];
   assert.ok(href,`${lang}/${id}: missing value-check link`);
   const url=new URL(href.replaceAll('&amp;','&'));
   assert.equal(url.origin,'https://jiedanfadan.com');
   assert.equal(url.pathname,`/${slug}/value-check`);
   assert.equal(url.searchParams.get('utm_source'),'quguangou');
   assert.equal(url.searchParams.get('utm_medium'),'extension');
   assert.equal(url.searchParams.get('utm_campaign'),campaign);
   assert.match(content,/target="_blank"/);
   assert.match(content,/rel="noopener noreferrer"/);
   assert.match(content,/<strong>[^<]{8,}<\/strong>/u,`${lang}/${id} headline missing`);
   assert.match(content,/<a [^>]+>[^<]{3,}<\/a>/u,`${lang}/${id} CTA missing`);
  }
 }
});

test('the three UI controllers deterministically show one value-check card per state',()=>{
 for(const rel of ['popup.js','l10n/en/popup.js','l10n/zh-TW/popup.js']){
  const js=read(rel);
  assert.match(js,/function renderValuePromos\(viewName/);
  assert.match(js,/const showCompleted = inProgress && Boolean\(completed\)/);
  assert.match(js,/const showCooldown = inProgress && !showCompleted && Boolean\(cooling\)/);
  assert.match(js,/#homeValuePromo/);
  assert.match(js,/#valuePromo/);
  assert.match(js,/#stickyValuePromo/);
  assert.match(js,/renderValuePromos\(getViewName\(view\)\)/);
  assert.match(js,/renderValuePromos\("progress", \{ completed, cooling \}\)/);
  assert.doesNotMatch(js,/getValuePromoProbability|promoRandomUnit|scheduleValuePromo/);
  assert.doesNotMatch(js,/valuePromo\.classList\.add\("hidden"\)/);
 }
});

test('localized privacy notices explain always-available optional rate-check cards without transmitting scan data',()=>{
 const expected={
  'zh-CN':['模式选择','每个页面场景只显示一个入口'],
  'zh-TW':['選擇模式','每個頁面情境只顯示一個入口'],
  en:['choosing or using a mode','Only one such link'],
  ja:['モードの選択中','1画面につき'],
  ko:['모드를 선택','한 화면에'],
  fr:['choix ou de l’utilisation','Un seul lien'],
  es:['elegir o utilizar','Solo se muestra un enlace'],
  ms:['memilih atau menggunakan','Hanya satu pautan'],
  vi:['khi chọn hoặc sử dụng','Mỗi màn hình chỉ hiển thị một'],
  id:['memilih atau menggunakan','Hanya satu tautan']};
 for(const [lang,slug] of Object.entries(locales)){
  const text=read(lang==='zh-CN'?'privacy.html':`l10n/${lang}/privacy.html`);
  for(const v of expected[lang])assert.ok(text.includes(v),`${lang}: ${v}`);
  assert.ok(text.includes(`jiedanfadan.com/${slug}/value-check`),lang);
 }
});

test('the traditional Hong Kong store compatibility config retains the same UI routing as Taiwan Traditional',()=>{
 const tw=JSON.parse(read('_locales/zh_TW/messages.json'));
 const hk=JSON.parse(read('_locales/zh_HK/messages.json'));
 assert.deepEqual(tw,hk);
 assert.ok(read('locale-redirect.js').includes("'zh-TW'"));
});

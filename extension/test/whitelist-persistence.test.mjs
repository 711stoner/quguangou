import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WHITELIST_KEY,WHITELIST_BACKUP_KEY,WHITELIST_EVIDENCE_KEY,WHITELIST_LAST_OWNER_KEY,
  readWhitelist,updateWhitelist,resolveWhitelistOwner,whitelistOwnerKey,normalizeWhitelistEntries
} from '../lib/whitelist-store.js';
const OWNER='fixture_owner';
function memoryStorage(initial={}){
 const data=structuredClone(initial);
 const storage={
  async get(keys){
   const names=Array.isArray(keys)?keys:typeof keys==='string'?[keys]:Object.keys(keys||{});
   const out={};
   for(const k of names)if(Object.hasOwn(data,k))out[k]=structuredClone(data[k]);
   return out;
  },
  async set(updates){Object.assign(data,structuredClone(updates));},
  async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete data[k];}
 };
 return {storage,data};
}
const fixture={username:'alice_123',userId:'123456',displayName:'Alice'};
test('new whitelist addition writes two independent local copies and owner evidence',async()=>{
 const {storage,data}=memoryStorage();
 const result=await updateWhitelist(storage,OWNER,fixture,true);
 assert.equal(result.length,1);
 assert.equal(data[WHITELIST_LAST_OWNER_KEY],OWNER);
 assert.deepEqual(data[WHITELIST_KEY],data[WHITELIST_BACKUP_KEY]);
 assert.equal(data[WHITELIST_EVIDENCE_KEY]['x:'+OWNER],true);
});
test('browser/service-worker restart reads saved local entries without rescanning',async()=>{
 const {storage}=memoryStorage();
 await updateWhitelist(storage,OWNER,fixture,true);
 const recovered=await readWhitelist(storage,OWNER);
 assert.equal(recovered[0].username,fixture.username);
 assert.equal(await resolveWhitelistOwner(storage,''),OWNER);
});
test('legacy pre-backup local whitelist is recovered, backed up, and identified',async()=>{
 const {storage,data}=memoryStorage({[WHITELIST_KEY]:{'x:fixture_owner':[fixture]}});
 assert.equal(await resolveWhitelistOwner(storage,null),OWNER);
 const entries=await readWhitelist(storage,OWNER);
 assert.equal(entries.length,1);
 assert.ok(data[WHITELIST_BACKUP_KEY]['x:'+OWNER]);
 assert.equal(data[WHITELIST_LAST_OWNER_KEY],OWNER);
});
test('a missing primary key is restored from the independent browser-local backup',async()=>{
 const {storage,data}=memoryStorage();
 await updateWhitelist(storage,OWNER,fixture,true);
 await storage.remove(WHITELIST_KEY);
 assert.equal((await readWhitelist(storage,OWNER))[0].username,fixture.username);
 assert.equal(data[WHITELIST_KEY]['x:'+OWNER].length,1);
});
test('a missing backup is rebuilt from the primary record',async()=>{
 const {storage,data}=memoryStorage();
 await updateWhitelist(storage,OWNER,fixture,true);
 await storage.remove(WHITELIST_BACKUP_KEY);
 assert.equal((await readWhitelist(storage,OWNER)).length,1);
 assert.equal(data[WHITELIST_BACKUP_KEY]['x:'+OWNER].length,1);
});
test('known owner with both copies missing fails closed instead of appearing as zero',async()=>{
 const {storage}=memoryStorage();
 await updateWhitelist(storage,OWNER,fixture,true);
 await storage.remove([WHITELIST_KEY,WHITELIST_BACKUP_KEY]);
 await assert.rejects(readWhitelist(storage,OWNER),/以前保存过白名单/);
});
test('intentional removal keeps an authoritative empty primary list; backup cannot resurrect it',async()=>{
 const {storage,data}=memoryStorage();
 await updateWhitelist(storage,OWNER,fixture,true);
 await updateWhitelist(storage,OWNER,fixture,false);
 assert.deepEqual(await readWhitelist(storage,OWNER),[]);
 data[WHITELIST_BACKUP_KEY]['x:'+OWNER]=[fixture]; // simulates stale mirror
 assert.deepEqual(await readWhitelist(storage,OWNER),[]);
 assert.deepEqual(data[WHITELIST_BACKUP_KEY]['x:'+OWNER],[]);
});
test('different X accounts and handles remain partitioned and normalized',async()=>{
 const {storage}=memoryStorage();
 await updateWhitelist(storage,OWNER,fixture,true);
 await updateWhitelist(storage,'other_owner',{username:'@BobX',id_str:'999'},true);
 assert.deepEqual((await readWhitelist(storage,'other_owner')).map(x=>x.username),['bobx']);
 assert.deepEqual((await readWhitelist(storage,OWNER)).map(x=>x.username),['alice_123']);
 assert.equal(whitelistOwnerKey('@Fixture_Owner'),'x:fixture_owner');
 assert.deepEqual(normalizeWhitelistEntries([{username:'@ALICE_123',id:'7'},{username:'Alice_123',id:'8'}]).map(x=>x.username),['alice_123']);
});
test('the whitelist remains local to this installation: no sync or network storage',async()=>{
 const fs=await import('node:fs');
 const src=fs.readFileSync(new URL('../lib/whitelist-store.js',import.meta.url),'utf8');
 assert.doesNotMatch(src.replace(/^\s*\*.*$/gm,''),/chrome\.storage\.sync|fetch\(|XMLHttpRequest\(|browser\.storage\.sync/);
});
test('bulk actions cannot start while the whitelist is loading or unreadable',async()=>{
 const fs=await import('node:fs');
 const path=await import('node:path');
 const root=path.dirname(path.dirname((await import('node:url')).fileURLToPath(import.meta.url)));
 for(const rel of ['popup.js','l10n/en/popup.js','l10n/zh-TW/popup.js']){
   const src=fs.readFileSync(path.join(root,rel),'utf8');
   assert.match(src,/if \(whitelistLoadStatus !== "ready"\)/,rel);
   assert.match(src,/getScanRestartText\(document\.documentElement\.lang\)\.whitelistNotLoaded/,rel);
   assert.match(src,/whitelistLoadStatus === "loading" \? "…" : "—"/,rel);
 }
 const {getScanRestartText}=await import('../lib/scan-restart-text.js');
 for(const lang of ['zh-CN','zh-TW','en','ja','ko','fr','es','ms','vi','id']){
   assert.ok(getScanRestartText(lang).whitelistNotLoaded.length>25,lang);
 }
});

test('empty-whitelist bulk operation requires an explicit in-dialog acknowledgement in all controllers',async()=>{
 const fs=await import('node:fs');
 const path=await import('node:path');
 const root=path.dirname(path.dirname((await import('node:url')).fileURLToPath(import.meta.url)));
 const bg=fs.readFileSync(path.join(root,'background.js'),'utf8');
 assert.match(bg,/if \(!whitelist\.length && message\.acknowledgeEmptyWhitelist !== true\)/);
 for(const rel of ['popup.js','l10n/en/popup.js','l10n/zh-TW/popup.js']){
  const source=fs.readFileSync(path.join(root,rel),'utf8');
  assert.match(source,/emptyWhitelistWarningShown = whitelistLoadStatus === "ready" && personalWhitelistEntries\.length === 0/,rel);
  assert.match(source,/\.emptyWhitelistConfirm/,rel);
  assert.match(source,/acknowledgeEmptyWhitelist: emptyWhitelistWarningShown && whitelistLoadStatus === "ready"/,rel);
 }
 const {getScanRestartText}=await import('../lib/scan-restart-text.js');
 for(const lang of ['zh-CN','zh-TW','en','ja','ko','fr','es','ms','vi','id']){
  assert.ok(getScanRestartText(lang).emptyWhitelistConfirm?.length>60,lang);
 }
});

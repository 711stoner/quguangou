import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('all three controllers show personal action jobs across UI languages but isolate community jobs',()=>{
 for(const file of ['popup.js','l10n/en/popup.js','l10n/zh-TW/popup.js']){
  const source=read(file);
  assert.match(source,/if \(job\.mode === "community" && taskPartition !== currentPartition\)/,file);
  assert.doesNotMatch(source,/if \(taskPartition !== currentPartition\)/,file);
  assert.match(source,/const taskPartition = job\.communityLocale \|\| "zh"/,file);
  assert.match(source,/const currentPartition = uiLocale === "zh-CN" \|\| uiLocale === "zh-TW" \? "zh" : uiLocale/,file);
 }
});
test('the original personal-job community sharing language remains saved on the task',()=>{
 const code=read('background.js');
 assert.match(code,/mode: "personal",\s*action,\s*communityLocale: communityPartition\(message\.locale\)/);
 assert.match(code,/submitCommunityReviewAccounts\(accounts, job\.communityLocale \|\| "zh"\)/);
});
test('manifest title and description continue using localized placeholders',()=>{
 const manifest=JSON.parse(read('manifest.json'));
 assert.equal(manifest.name,'__MSG_extensionName__');
 assert.equal(manifest.description,'__MSG_extensionDescription__');
 assert.equal(manifest.default_locale,'zh_CN');
});

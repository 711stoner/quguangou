import test from 'node:test';
import assert from 'node:assert/strict';
import {remainingProfileCountGap} from '../lib/scan-last-mile.js';
import {getScanRestartText} from '../lib/scan-restart-text.js';
const scan=(patch={})=>({status:'running',phase:'followers',progress:{following:3796,followers:4270},profileFollowersCount:4290,profileFollowersExact:true,...patch});
test('near the end, a 20-account discrepancy is explanatory, not a completion claim',()=>{
 assert.deepEqual(remainingProfileCountGap(scan()),{phase:'followers',missing:20,expected:4290,read:4270});
});
test('when the last accounts arrive there is no missing-account alert',()=>{
 assert.equal(remainingProfileCountGap(scan({progress:{following:3796,followers:4290}})),null);
});
test('not near the end: do not distract user with final verification wording',()=>{
 assert.equal(remainingProfileCountGap(scan({progress:{following:3796,followers:3000}})),null);
});
test('approximate profile count is not presented as an exact difference',()=>{
 assert.equal(remainingProfileCountGap(scan({profileFollowersExact:false})),null);
});
test('a completed, paused, or invalid scan does not claim to be checking the last accounts',()=>{
 for(const status of ['completed','paused','failed'])assert.equal(remainingProfileCountGap(scan({status})),null);
 assert.equal(remainingProfileCountGap(scan({profileFollowersCount:NaN})),null);
});
test('following stage uses Following count, not Followers count',()=>{
 assert.deepEqual(remainingProfileCountGap(scan({phase:'following',profileFollowingCount:3797,profileFollowingExact:true,progress:{following:3796,followers:3000}})),
  {phase:'following',missing:1,expected:3797,read:3796});
});
test('ten native-language last-mile explanations contain a count placeholder and recovery advice',()=>{
 for(const lang of ['zh-CN','zh-TW','en','ja','ko','fr','es','ms','vi','id']){
  const text=getScanRestartText(lang);
  assert.ok(text.helpTail.includes('{count}'),lang);
  assert.ok(text.helpTail.length>100,lang);
  assert.equal(text.helpTail.replace('{count}','20').includes('20'),true,lang);
 }
});

test('validated terminal shortfall is still reported as a possible false-positive risk',async()=>{
 const {completedFollowerCountGap}=await import('../lib/scan-last-mile.js');
 const completed={status:'completed',profileFollowersCount:4290,profileFollowersExact:true,profileFollowersTolerance:0,
   followersCount:4270,progress:{followers:4270,followersMismatchEndValidated:true}};
 assert.deepEqual(completedFollowerCountGap(completed),{missing:20,actual:4270,required:4290});
 assert.equal(completedFollowerCountGap({...completed,followersCount:4290}),null);
 assert.equal(completedFollowerCountGap({...completed,profileFollowersExact:false}),null);
});
test('ten completed-scan warnings explain that follower-list gaps can affect accuracy',()=>{
 for(const lang of ['zh-CN','zh-TW','en','ja','ko','fr','es','ms','vi','id']){
  const text=getScanRestartText(lang);
  assert.ok(text.completedGapWarning.includes('{count}'),lang);
  assert.ok(text.completedGapWarning.length>80,lang);
 }
});

test('all ten locale completion states are natively authored and use the same placeholders',()=>{
 for(const lang of ['zh-CN','zh-TW','en','ja','ko','fr','es','ms','vi','id']){
   const copy=getScanRestartText(lang);
   assert.ok(copy.completedNote?.length>28,lang);
   assert.ok(copy.needsValidationNote?.length>50,lang);
   assert.ok(copy.relationFollowing && copy.relationFollowers,lang);
   for(const placeholder of ['{relation}','{actual}','{required}','{missing}'])
     assert.ok(copy.incompleteCountWarning.includes(placeholder),`${lang}/${placeholder}`);
 }
});

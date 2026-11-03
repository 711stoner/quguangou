import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const project=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const background=fs.readFileSync(path.join(project,'background.js'),'utf8');
const start=background.indexOf('async function performProfileActionInPage(');
const end=background.indexOf('\nconst ACTION_JOB_WORKER_NAME_PREFIX',start);
assert.ok(start>=0 && end>start);
const functionText=background.slice(start,end);
function fixture({restricted=true,label='Yes, view profile',owner='owner',target='testtarget',includeButton=true,source='owner',
  portal=false,heading='Caution:\nThis account\nis temporarily\nrestricted',delayProfileMs=0,duplicateCTA=false}={}) {
  const s={restricted,clicks:0,followingClicked:false,unfollowConfirmations:0,source};
  const el=(name,click=()=>{})=>({
    innerText:name, getClientRects:()=>[{}], getAttribute:(key)=>key==='href'?'/'+owner:null,
    click,querySelectorAll:()=>[]
  });
  const agree=el(label,()=>{
    s.clicks++;
    if(delayProfileMs) setTimeout(()=>{s.restricted=false},delayProfileMs);
    else s.restricted=false;
  });
  const following=el('Following',()=>{s.followingClicked=true;});
  const confirmed=el('Unfollow',()=>{s.unfollowConfirmations++;});
  const follow=el('Follow');
  const renderedText=()=>s.restricted?heading:'User profile';
  const buttons=()=>includeButton ? (duplicateCTA ? [agree,el(label)] : [agree]):[];
  const area={get innerText(){return renderedText();},
    getClientRects:()=>[{}],querySelectorAll:()=>portal?[]:buttons()};
  const body={get innerText(){return renderedText();},
    getClientRects:()=>[{}],querySelectorAll:()=>buttons()};
  const document={
    body,
    querySelector:(selector)=>{
      if(selector==='[data-testid="AppTabBar_Profile_Link"]')return el('owner');
      if(selector==='[data-testid$="-unfollow"], [data-testid$="-follow"]')return s.restricted?null:(s.unfollowConfirmations?follow:following);
      return null;
    },
    querySelectorAll:(selector)=>{
      if(selector==='[role="dialog"], [data-testid="primaryColumn"], main, [data-testid="cellInnerDiv"]')return portal?[]:[area];
      if(selector==='button, [role="button"]')return s.restricted?buttons():[following];
      if(selector==='[data-testid="userFollowIndicator"]')return [];
      if(selector==='[data-testid$="-unfollow"]')return s.restricted||s.unfollowConfirmations?[]:[following];
      if(selector.startsWith('[data-testid="confirmationSheetConfirm"]'))return s.followingClicked && !s.unfollowConfirmations?[confirmed]:[];
      if(selector==='[data-testid$="-follow"]')return s.unfollowConfirmations?[follow]:[];
      return [];
    }
  };
  const location={pathname:'/'+target};
  const doTimeout=(fn)=>setTimeout(fn,0); // speed up in-DOM wait while keeping retries bounded
  const fn=vm.runInNewContext(functionText+'\nperformProfileActionInPage;',
    {document,location,setTimeout:doTimeout,Math,Date,console});
  return {s,fn,target:{username:'testtarget',url:'https://x.com/testtarget'}};
}
test('X restricted Yes, view profile is clicked once; then recheck target and unfollow',async()=>{
  const f=fixture();
  const stageOne=await f.fn(f.target,'personal','owner','unfollow');
  assert.equal(stageOne.status,'retry_profile_after_restricted_consent');
  assert.equal(f.s.clicks,1);
  assert.equal(f.s.unfollowConfirmations,0,'consent click must not count as unfollow');
  const stageTwo=await f.fn(f.target,'personal','owner','unfollow',true);
  assert.equal(stageTwo.status,'unfollowed');
  assert.equal(f.s.unfollowConfirmations,1);
});
test('legal or cookie terms Agree button is never accepted automatically',async()=>{
  const f=fixture({label:'Agree to terms of service'});
  const result=await f.fn(f.target,'personal','owner','unfollow');
  assert.equal(result.status,'skipped_restricted');
  assert.equal(f.s.clicks,0);
});
test('unknown restricted prompt with no exact consent button is skipped',async()=>{
  const f=fixture({includeButton:false});
  const result=await f.fn(f.target,'personal','owner','unfollow');
  assert.equal(result.status,'skipped_restricted');
  assert.equal(f.s.clicks,0);
});
test('warning still present after one consent attempt is not clicked again',async()=>{
  const f=fixture();
  const result=await f.fn(f.target,'personal','owner','unfollow',true);
  assert.equal(result.status,'skipped_restricted');
  assert.equal(f.s.clicks,0);
});
test('wrong signed-in X account cannot acknowledge or unfollow',async()=>{
  const f=fixture({owner:'someoneelse'});
  const result=await f.fn(f.target,'personal','owner','unfollow');
  assert.equal(result.failureKind,'owner_mismatch');
  assert.equal(f.s.clicks,0);
});
test('wrong target profile cannot acknowledge or unfollow',async()=>{
  const f=fixture({target:'differenttarget'});
  const result=await f.fn(f.target,'personal','owner','unfollow');
  assert.equal(result.failureKind,'target_mismatch');
  assert.equal(f.s.clicks,0);
});
test('community block workflow does not accept restricted-profile consent',async()=>{
  const f=fixture();
  const result=await f.fn(f.target,'community',null,'block');
  assert.notEqual(result.status,'retry_profile_after_restricted_consent');
  assert.equal(f.s.clicks,0);
});

test('X heading split over several lines is recognized and its profile CTA clicked',async()=>{
  const f=fixture({heading:'Caution:\nThis account\nis temporarily\nrestricted',label:'Yes, view\nprofile'});
  const result=await f.fn(f.target,'personal','owner','unfollow');
  assert.equal(result.status,'retry_profile_after_restricted_consent');
  assert.equal(f.s.clicks,1);
  assert.equal(f.s.unfollowConfirmations,0);
});
test('X button rendered outside the main column is found by exact wording',async()=>{
  const f=fixture({portal:true});
  const result=await f.fn(f.target,'personal','owner','unfollow');
  assert.equal(result.status,'retry_profile_after_restricted_consent');
  assert.equal(f.s.clicks,1);
});
test('slow X transition after profile consent is awaited before unfollow',async()=>{
  const f=fixture({delayProfileMs:90});
  const first=await f.fn(f.target,'personal','owner','unfollow');
  assert.equal(first.status,'retry_profile_after_restricted_consent');
  assert.equal(f.s.restricted,true,'gate still visible just after click');
  const second=await f.fn(f.target,'personal','owner','unfollow',true);
  assert.equal(second.status,'unfollowed');
  assert.equal(f.s.clicks,1);
  assert.equal(f.s.unfollowConfirmations,1);
});
test('generic Agree is NOT clicked even on a restricted page',async()=>{
  const f=fixture({label:'Agree'});
  const result=await f.fn(f.target,'personal','owner','unfollow');
  assert.equal(result.status,'skipped_restricted');
  assert.equal(f.s.clicks,0);
});
test('multiple ambiguous View Profile controls are not clicked',async()=>{
  const f=fixture({duplicateCTA:true});
  const result=await f.fn(f.target,'personal','owner','unfollow');
  assert.equal(result.status,'skipped_restricted');
  assert.equal(f.s.clicks,0);
});
test('background worker rechecks local protection before second injection',()=>{
  const at=background.indexOf('outcome?.status === "retry_profile_after_restricted_consent"');
  const end=background.indexOf('outcome?.status === "retry_profile_after_subscription"',at);
  assert.ok(at>=0&&end>at);
  const flow=background.slice(at,end);
  assert.ok(flow.includes('isPersonalTargetProtected(job.sourceUsername, target)'));
  assert.ok(flow.includes('markActionJobWorker(job.workerTabId, job.id)'));
  assert.ok(flow.includes('consentPreviouslyClicked')||flow.includes('"unfollow", true'));
});

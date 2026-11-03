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
function fixture({restricted=true,label='同意',owner='owner',target='testtarget',includeButton=true,source='owner'}={}) {
  const s={restricted,clicks:0,followingClicked:false,unfollowConfirmations:0,source};
  const el=(name,click=()=>{})=>({
    innerText:name, getClientRects:()=>[{}], getAttribute:(key)=>key==='href'?'/'+owner:null,
    click,querySelectorAll:()=>[]
  });
  const agree=el(label,()=>{s.clicks++;s.restricted=false;});
  const following=el('Following',()=>{s.followingClicked=true;});
  const confirmed=el('Unfollow',()=>{s.unfollowConfirmations++;});
  const follow=el('Follow');
  const area={get innerText(){return s.restricted?'Caution: This account is temporarily restricted':'User profile';},
    getClientRects:()=>[{}],querySelectorAll:()=>includeButton?[agree]:[]};
  const document={
    body:{get innerText(){return s.restricted?'Caution: This account is temporarily restricted':'User profile';}},
    querySelector:(selector)=>selector==='[data-testid="AppTabBar_Profile_Link"]'?el('owner'):null,
    querySelectorAll:(selector)=>{
      if(selector==='[role="dialog"], [data-testid="primaryColumn"], main')return [area];
      if(selector==='[data-testid="userFollowIndicator"]')return [];
      if(selector==='[data-testid$="-unfollow"]')return s.restricted||s.unfollowConfirmations?[]:[following];
      if(selector.startsWith('[data-testid="confirmationSheetConfirm"]'))return s.followingClicked && !s.unfollowConfirmations?[confirmed]:[];
      if(selector==='[data-testid$="-follow"]')return s.unfollowConfirmations?[follow]:[];
      return [];
    }
  };
  const location={pathname:'/'+target};
  const doTimeout=(fn)=>setTimeout(fn,0); // deterministic fast test, real code uses human delays
  const fn=vm.runInNewContext(functionText+'\nperformProfileActionInPage;',
    {document,location,setTimeout:doTimeout,Math,Date,console});
  return {s,fn,target:{username:'testtarget',url:'https://x.com/testtarget'}};
}
test('restricted-profile Agree is clicked only once; then recheck target and unfollow',async()=>{
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
test('background worker rechecks local protection before second injection',()=>{
  const at=background.indexOf('outcome?.status === "retry_profile_after_restricted_consent"');
  const end=background.indexOf('outcome?.status === "retry_profile_after_subscription"',at);
  assert.ok(at>=0&&end>at);
  const flow=background.slice(at,end);
  assert.ok(flow.includes('isPersonalTargetProtected(job.sourceUsername, target)'));
  assert.ok(flow.includes('markActionJobWorker(job.workerTabId, job.id)'));
  assert.ok(flow.includes('consentPreviouslyClicked')||flow.includes('"unfollow", true'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const code=fs.readFileSync(path.join(root,'background.js'),'utf8');
const helperAt=code.indexOf('function isTargetSubscriptionRoute(');
const helperEnd=code.indexOf('const ACTION_JOB_WORKER_NAME_PREFIX',helperAt);
assert.ok(helperAt>=0&&helperEnd>helperAt);
const helpers=code.slice(helperAt,helperEnd);
const profileAt=code.indexOf('async function performProfileActionInPage(');
const profileEnd=code.indexOf('\n// Only a matching target profile',profileAt);
assert.ok(profileAt>=0&&profileEnd>profileAt);
const profile=code.slice(profileAt,profileEnd);
const evaluate=(s,env={})=>vm.runInNewContext(s+'\n({isTargetSubscriptionRoute,closeTargetSubscriptionPageInPage})',
 {URL,console,Math,Date,...env});
const dom=({target='jhdxhl',closeLabel='Close',showClose=true,closeTestId='app-bar-close',duplicate=false}={})=>{
 const counts={close:0,payment:0};
 const button=(label,isClose=false)=>({
  innerText:label,getAttribute:(key)=>key==='aria-label'?label:key==='title'?label:null,
  getClientRects:()=>[{}],click:()=>{counts[isClose?'close':'payment']++}
 });
 const close=button(closeLabel,true);
 const subscribe=button('Subscribe · ¥133/month');
 const buttons=showClose?[close,subscribe]:[subscribe];
 if(duplicate)buttons.push(button(closeLabel,true));
 const document={querySelectorAll:(sel)=>{
  if(sel.includes('app-bar-close'))return showClose&&closeTestId==='app-bar-close'?buttons.filter(x=>x===close):[];
  if(sel.includes('aria-label="Close"'))return showClose?buttons.filter(x=>x.getAttribute('aria-label')==='Close'):[];
  if(sel.includes('title="Close"'))return showClose?buttons.filter(x=>x.getAttribute('title')==='Close'):[];
  if(sel.includes('data-testid="close"'))return showClose&&closeTestId==='close'?buttons.filter(x=>x===close):[];
  if(sel==='button, [role="button"]')return buttons;
  return [];
 }};
 const location={pathname:`/${target}/creator-subscriptions/subscribe`};
 return {...evaluate(helpers,{document,location}),counts};
};
test('only matching X target subscription URLs pass route validation',()=>{
 const {isTargetSubscriptionRoute}=dom();
 assert.equal(isTargetSubscriptionRoute('https://x.com/jhdxhl/creator-subscriptions/subscribe','jhdxhl'),true);
 assert.equal(isTargetSubscriptionRoute('https://x.com/JHDXHL/creator-subscriptions/subscribe/','jhdxhl'),true);
 for(const url of ['https://x.com/other/creator-subscriptions/subscribe','https://evil.com/jhdxhl/creator-subscriptions/subscribe',
 'https://x.com/jhdxhl','https://x.com/jhdxhl/creator-subscriptions','javascript:foo']){
  assert.equal(isTargetSubscriptionRoute(url,'jhdxhl'),false,url);
 }
});
test('close the X subscription sheet without paying',async()=>{
 const f=dom();const result=await f.closeTargetSubscriptionPageInPage('jhdxhl');
 assert.equal(result.status,'close_clicked');assert.deepEqual(f.counts,{close:1,payment:0});
});
test('the route of a different target cannot be dismissed',async()=>{
 const f=dom();const result=await f.closeTargetSubscriptionPageInPage('notJhdxhl');
 assert.equal(result.status,'not_target_subscription');assert.deepEqual(f.counts,{close:0,payment:0});
});
test('a missing close button never turns into a purchase action',async()=>{
 const f=dom({showClose:false});const result=await f.closeTargetSubscriptionPageInPage('jhdxhl');
 assert.equal(result.status,'close_not_found');assert.deepEqual(f.counts,{close:0,payment:0});
});
test('an icon-only close control is recognized if unambiguous',async()=>{
 const f=dom({closeLabel:'×',closeTestId:'none'});
 const result=await f.closeTargetSubscriptionPageInPage('jhdxhl');
 assert.equal(result.status,'close_clicked');assert.deepEqual(f.counts,{close:1,payment:0});
});
test('subscription handling after clicking Following retries instead of reporting a failed unfollow',async()=>{
 const state={subscription:false,following:true,followClicked:0,purchaseClicked:0};
 const following={innerText:'Following',getClientRects:()=>[{}],click:()=>{state.followClicked++;state.subscription=true;}};
 const purchase={innerText:'Subscribe · ¥133/month',getClientRects:()=>[{}],click:()=>{state.purchaseClicked++}};
 const doc={body:{get innerText(){return state.subscription?'Subscribe\nStand out!\nSubscribe · ¥133/month':'Fox @jhdxhl';}},
 querySelector:(key)=>key==='[data-testid="AppTabBar_Profile_Link"]'?{getAttribute:()=>'/owner'}:
 key==='[data-testid$="-unfollow"], [data-testid$="-follow"]'?following:null,
 querySelectorAll:(key)=>{
  if(key==='[role="dialog"], [data-testid="primaryColumn"], main, [data-testid="cellInnerDiv"]')return [];
  if(key==='button, [role="button"]')return state.subscription?[purchase]:[following];
  if(key==='[data-testid="userFollowIndicator"]')return [];
  if(key==='[data-testid$="-unfollow"]')return [following];
  if(key==='[data-testid$="-follow"]')return [];
  return [];
 }};
 const fn=vm.runInNewContext(profile+'\nperformProfileActionInPage;',
   {document:doc,location:{pathname:'/jhdxhl'},console,Math,Date,setTimeout:(callback)=>setTimeout(callback,0)});
 const result=await fn({username:'jhdxhl'},'personal','owner','unfollow');
 assert.equal(result.status,'retry_profile_after_subscription');
 assert.equal(state.followClicked,1);assert.equal(state.purchaseClicked,0);
});
test('the worker only retries a verified target subscription once and rechecks protection',()=>{
 assert.match(code,/isTargetSubscriptionRoute\(latestTab\?\.url, target\.username\)/);
 assert.match(code,/func: closeTargetSubscriptionPageInPage/);
 const start=code.indexOf('outcome?.status === "retry_profile_after_subscription"');
 assert.ok(start>0);
 const chunk=code.slice(start,start+3300);
 assert.match(chunk,/chrome\.tabs\.update\(job\.workerTabId, \{ url: target\.url/);
 assert.match(chunk,/isPersonalTargetProtected\(job\.sourceUsername, target\)/);
 assert.match(chunk,/outcome\?\.status === "retry_profile_after_subscription"/);
});

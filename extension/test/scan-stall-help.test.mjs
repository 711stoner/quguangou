import test from 'node:test';
import assert from 'node:assert/strict';
import { scanStallKind } from '../lib/scan-stall-help.js';
import { getScanRestartText } from '../lib/scan-restart-text.js';
const t=Date.UTC(2026,10,3,13,0,0);
function scan(s={}) {return {id:'a',status:'running',startedAt:new Date(t-5*60_000).toISOString(),lastAccountProgressAt:t-4*60_000,...s};}
function health(windowPresent){return {scanId:'a',running:true,windowPresent};}
test('missing worker window is reported, even when UI says running',()=>{
 assert.equal(scanStallKind(scan(),health(false),t),'missing');
});
test('a live but stalled window is not falsely called fast reading',()=>{
 assert.equal(scanStallKind(scan(),health(true),t),'stalled');
});
test('recent real progress suppresses false stall alerts',()=>{
 assert.equal(scanStallKind(scan({lastAccountProgressAt:t-20000}),health(true),t),'normal');
});
test('new restart receives grace while X loads',()=>{
 assert.equal(scanStallKind(scan({lastForceRestartAt:t-15000}),health(false),t),'normal');
});
test('rate limit takes precedence over absent worker',()=>{
 assert.equal(scanStallKind(scan({rateLimitUntil:t+600000,lastRecoverableError:'HTTP_429'}),health(false),t),'cooldown');
});
test('another scan health ID cannot label this window missing',()=>{
 assert.equal(scanStallKind(scan(),{scanId:'b',running:true,windowPresent:false},t),'stalled');
});
test('ten locale copies include all five help states',()=>{
 for(const lang of ['zh-CN','zh-TW','en','ja','ko','fr','es','ms','vi','id']){
  const text=getScanRestartText(lang);
  for(const key of ['helpNormal','helpMissing','helpStalled','helpCooling','helpPaused'])
   assert.ok(text[key]?.length>30,lang+':'+key);
 }
});

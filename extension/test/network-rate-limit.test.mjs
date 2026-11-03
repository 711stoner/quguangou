import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../network-hook.js', import.meta.url), 'utf8');
test('cursor requests respect 429 and expose only reset duration, not auth', async () => {
  const url = 'https://x.com/i/api/graphql/fixture/Followers?variables='+encodeURIComponent(JSON.stringify({count:20}));
  let attempt=0;
  const originalFetch=async () => {
    attempt++;
    if(attempt===1) return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
    return new Response('{}',{status:429,headers:{'Retry-After':'14','x-rate-limit-reset':String(Math.floor(Date.now()/1000)+21)}});
  };
  const page={fetch:originalFetch};
  vm.runInNewContext(source,{window:page,location:{href:'https://x.com/testuser/followers'},URL,Request,Headers,Response,Date,Map,Set,Number,Object,String,Array,JSON,decodeURIComponent,encodeURIComponent}, {filename:'network-hook.js'});
  const first=await page.fetch(url,{method:'GET'});
  assert.equal(first.status,200);
  const state=page.__QG_RELATION_NETWORK_V2__;
  assert.equal(state.status('followers').templateReady,true);
  const result=await state.fetchCursorPage('followers','opaque-cursor');
  assert.equal(result.ok,false);
  assert.equal(result.status,429);
  assert.equal(result.error,'HTTP_429');
  assert.ok(result.retryAfterMs>=14000);
  assert.ok(result.retryAfterMs<=22000);
  assert.equal(attempt,2);
});

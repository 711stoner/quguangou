import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=fs.readFileSync(path.join(root,'network-hook.js'),'utf8');

function testHook(){
 const requests=[];
 class FakeXHR {
  open(method,url){this.url=url;this.method=method;}
  setRequestHeader(name,value){this.sentHeaders ||= {};this.sentHeaders[name]=value;}
  addEventListener(){}
  send(){}
 }
 const window={XMLHttpRequest:FakeXHR,fetch:async (url,options)=>{
  requests.push({url,options});
  return {ok:true,status:200,clone(){return {json:async()=>({data:{}})}}};
 }};
 vm.runInNewContext(source,{window,location:{href:'https://x.com/test/following'},URL,Map,Date,Headers,Request,Number,String,Boolean,Array,Object,JSON,Set,Math});
 return {window,requests};
}

test('the X network hook never retains request-header values in extension state',()=>{
 const {window}=testHook();
 const xhr=new window.XMLHttpRequest();
 xhr.open('GET','https://x.com/i/api/graphql/fake/Followers');
 xhr.setRequestHeader('Authorization','Bearer SECRET_TOKEN_DO_NOT_STORE');
 xhr.setRequestHeader('x-csrf-token','CSRF_SECRET_DO_NOT_STORE');
 assert.deepEqual(Object.values(xhr.__qg.headers),[]);
 assert.equal(xhr.sentHeaders.Authorization,'Bearer SECRET_TOKEN_DO_NOT_STORE','X request must still receive its original header');
 assert.ok(!JSON.stringify(xhr.__qg).includes('SECRET_TOKEN'));
 assert.ok(!JSON.stringify(xhr.__qg).includes('CSRF_SECRET'));
 assert.doesNotMatch(source,/new Headers\(/);
 assert.doesNotMatch(source,/this\.__qg\.headers\[/);
});

test('the hook can observe an X Following response without issuing any synthetic replay',async()=>{
 const {window,requests}=testHook();
 const url='https://x.com/i/api/graphql/fake/Following?variables=%7B%22cursor%22%3A%22abc%22%7D';
 await window.fetch(url,{headers:{authorization:'Bearer UNUSED_SECRET'},credentials:'include'});
 assert.equal(requests.length,1);
 const state=window.__QG_RELATION_NETWORK_V2__;
 assert.ok(state?.status('following').templateReady);
 const result=await state.fetchCursorPage('following','next-cursor');
 assert.equal(result.ok,false);
 assert.equal(result.error,'SYNTHETIC_CURSOR_DISABLED');
 assert.equal(requests.length,1,'No second X API request is made');
 assert.equal(state.status('following').requestCursor,'abc');
});

test('the background still observes X rate limits but never enables cursor replay',()=>{
 const bg=fs.readFileSync(path.join(root,'background.js'),'utf8');
 assert.match(bg,/const allowSyntheticCursorRequests = false/);
 assert.match(bg,/recentNetworkFailure\?\.startsWith\("HTTP_429"\)/);
 assert.match(source,/retryAfterMs/);
 assert.doesNotMatch(source,/originalFetch\(replay\.url/);
 assert.doesNotMatch(source,/withCursor\(/);
});

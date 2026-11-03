// Current-module source invariants. The old vm.Script harness predates the
// modular background and cannot represent browser tabs or worker ownership.
// These tests guard critical safety checks; they are NOT live X action tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseAccountList,parseAccountReference} from '../lib/accounts.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const js=fs.readFileSync(path.join(root,'background.js'),'utf8');
const section=(start,end)=>{
 const a=js.indexOf(start);const b=js.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,`source section missing: ${start}`);
 return js.slice(a,b);
};

test('action worker tabs are only closed after X URL and unique window marker verification',()=>{
 const code=section('async function getVerifiedActionJobWorker(','async function closeActionJobWorker(');
 assert.match(code,/isSafePersonalScanWorkerUrl\(tab\.url\)/);
 assert.match(code,/window\.name/);
 assert.match(code,/ACTION_JOB_WORKER_NAME_PREFIX \+ jobId/);
 assert.match(code,/if \(result\?\.\[0\]\?\.result !== ACTION_JOB_WORKER_NAME_PREFIX \+ jobId\) return null/);
 const close=section('async function closeActionJobWorker(','function humanizeActionFailureReason(');
 assert.match(close,/await getVerifiedActionJobWorker\(job, tabIdOverride\)/);
 assert.match(close,/if \(!verified\?\.id\) return false/);
 assert.match(close,/chrome\.tabs\.remove\(verified\.id\)/);
});

test('a run handles no more than twenty accounts and saves each batch boundary',()=>{
 assert.match(js,/const BATCH_SIZE = 20/);
 const job=section('async function runJob()','chrome.runtime.onMessage.addListener(');
 assert.match(job,/job\.batchEndIndex/);
 assert.match(job,/job\.currentIndex < batchEndIndex/);
 assert.match(job,/job\.batchEndIndex = Math\.min\(job\.batchStartIndex \+ job\.batchSize, job\.targets\.length\)/);
 assert.match(job,/job\.status = "paused"/);
 assert.match(job,/job\.pauseKind = "batch"/);
});

test('missing private-account owner fails closed and protected targets are skipped twice',()=>{
 assert.match(js,/if \(!whitelistOwnerKey\(owner\)\) return true; \/\/ No verified owner: fail closed/);
 const job=section('async function runJob()','chrome.runtime.onMessage.addListener(');
 assert.match(job,/await isPersonalTargetProtected\(job\.sourceUsername, pendingTarget\)/);
 assert.match(job,/await isPersonalTargetProtected\(job\.sourceUsername, target\)/);
 assert.match(job,/status: "skipped_whitelist"/);
});

test('unknown action failures pause safely and preserve the current diagnostic page',()=>{
 const job=section('async function runJob()','chrome.runtime.onMessage.addListener(');
 assert.match(job,/if \(!outcome\.failureKind\) outcome\.failureKind = "system"/);
 assert.match(job,/\["system", "page_load_timeout", "owner_unconfirmed", "owner_mismatch", "target_mismatch"\]/);
 assert.match(job,/job\.pauseKind = "failure"/);
 assert.match(job,/job\.retainedTabId = failedTabStillExists \? failedTabId : null/);
});

test('bulk actions never accept an account absent from the current scan or protected by a whitelist',()=>{
 const input=section('if (message?.type === "START_PERSONAL_ACTION_JOB")','if (message?.type === "RESUME_JOB")');
 assert.match(input,/if \(!allowed\.has\(key\)\)/);
 assert.match(input,/if \(isPersonalWhitelisted\(whitelist, allowed\.get\(key\)\)\) continue/);
 assert.match(input,/if \(!requested\.length\)/);
 assert.match(input,/acknowledgeEmptyWhitelist !== true/);
 assert.match(input,/sourceUsername: scan\.username/);
});

test('the cooldown override requires a paused batch and records the previous deadline',()=>{
 const code=section('if (message?.type === "SKIP_COOLDOWN")','if (message?.type === "END_JOB")');
 assert.match(code,/job\.status !== "paused" \|\| job\.pauseKind !== "batch"/);
 assert.match(code,/quota\.cooldownUntil > Date\.now\(\)/);
 assert.match(code,/const previousResumeAt = quota\.cooldownUntil/);
 assert.match(code,/job\.skippedCooldowns = \[/);
 assert.match(code,/previousResumeAt/);
});

test('subscription route recovery closes only the dialog and retries only the original profile URL',()=>{
 const job=section('async function runJob()','chrome.runtime.onMessage.addListener(');
 assert.match(job,/isTargetSubscriptionRoute\(sheetTab\?\.url, target\.username\)/);
 assert.match(job,/closeTargetSubscriptionPageInPage/);
 assert.match(job,/await chrome\.tabs\.update\(job\.workerTabId, \{ url: target\.url, active: false \}\)/);
 assert.match(job,/status: "skipped_subscription"/);
});

test('account identifiers retain separate numeric IDs and numeric handles',()=>{
 assert.equal(parseAccountReference('@665162').url,'https://x.com/665162');
 assert.equal(parseAccountReference('665162').url,'https://x.com/i/user/665162');
 const result=parseAccountList('@first @first @second');
 assert.equal(result.targets.length,2);
 assert.equal(result.duplicates.length,1);
});

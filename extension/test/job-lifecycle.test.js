import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { parseAccountList, parseAccountReference } from "../lib/accounts.js";
import { reserveAttempt } from "../lib/pacing.js";

const source = (await readFile(new URL("../background.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "").replace(/void runJob\(\);\s*$/, "");

function harness(targets, result, reservation = reserveAttempt) {
  const store = { quguangouJob: {
    status: "running", blocklistVersion: "2026.09.09.1",
    targets, currentIndex: 0, results: [], workerTabId: null
  } };
  const removed = [], navigated = [];
  let nextTab = 100;
  let messageListener = null;
  const chrome = {
    storage: { local: {
      get: async key => ({ [key]: structuredClone(store[key]) }),
      set: async values => Object.assign(store, structuredClone(values))
    } },
    runtime: {
      sendMessage: async () => {},
      onMessage: { addListener(listener) { messageListener = listener; } },
      onStartup: { addListener() {} }
    },
    tabs: {
      create: async () => ({ id: nextTab++ }),
      get: async () => ({ status: "complete" }),
      update: async (id, options) => navigated.push({ id, ...options }),
      remove: async id => removed.push(id)
    },
    scripting: { executeScript: async () => [{ result }] }
  };
  const context = vm.createContext({ chrome, parseAccountList, parseAccountReference,
    reserveAttempt: reservation, Date, setTimeout: fn => { fn(); return 0; }, clearTimeout() {} });
  vm.runInContext(source, context);
  const message = (payload) => new Promise((resolve, reject) => {
    if (!messageListener) return reject(new Error("message listener missing"));
    try {
      const result = messageListener(payload, {}, resolve);
      if (result !== true && result !== undefined) resolve(result);
    } catch (error) {
      reject(error);
    }
  });
  return { store, removed, navigated, run: () => vm.runInContext("runJob()", context), message };
}

test("an unavailable account is recorded and the batch continues automatically", async () => {
  const h = harness(parseAccountList("@first @second").targets, {
    status: "failed",
    failureKind: "unavailable",
    reason: "该账号被 X 停用、已注销或无法访问"
  });
  await h.run();
  assert.equal(h.store.quguangouJob.status, "completed");
  assert.equal(h.store.quguangouJob.currentIndex, 2);
  assert.equal(h.store.quguangouJob.results.length, 2);
  assert.equal(h.store.quguangouJob.results[0].failureKind, "unavailable");
  assert.equal(h.navigated.length, 2);
  assert.deepEqual(h.removed, [100]);
});

test("a system failure still pauses and preserves the diagnostic page", async () => {
  const h = harness(parseAccountList("@first @second").targets, { status: "failed", reason: "菜单未找到" });
  await h.run();
  assert.equal(h.store.quguangouJob.status, "paused");
  assert.equal(h.store.quguangouJob.pauseKind, "failure");
  assert.equal(h.store.quguangouJob.currentIndex, 1);
  assert.equal(h.store.quguangouJob.workerTabId, null);
  assert.equal(h.store.quguangouJob.retainedTabId, 100);
  assert.equal(h.navigated.length, 1);
  assert.deepEqual(h.removed, []);
});

test("even a system failure on the last target preserves the page", async () => {
  const h = harness(parseAccountList("@last").targets, { status: "failed", reason: "菜单未找到" });
  await h.run();
  assert.equal(h.store.quguangouJob.status, "paused");
  assert.deepEqual(h.removed, []);
});

test("saved bundled numeric handle is repaired before navigation", async () => {
  const h = harness(parseAccountList("665162").targets, { status: "failed", reason: "菜单未找到" });
  await h.run();
  assert.equal(h.navigated[0].url, "https://x.com/665162");
  assert.equal(h.store.quguangouJob.results[0].label, "@665162");
});

test("one click processes at most twenty targets before pausing for manual continuation", async () => {
  const accounts = Array.from({ length: 21 }, (_, index) => `@user${index + 1}`).join(" ");
  const alwaysReady = (state = {}) => ({ allowed: true, state: { ...state, count: (state.count || 0) + 1, nextAt: 0 } });
  const h = harness(parseAccountList(accounts).targets, { status: "blocked", reason: "已拉黑" }, alwaysReady);
  await h.run();
  assert.equal(h.store.quguangouJob.status, "paused");
  assert.equal(h.store.quguangouJob.pauseKind, "batch");
  assert.equal(h.store.quguangouJob.currentIndex, 20);
  assert.equal(h.navigated.length, 20);
  assert.deepEqual(h.removed, [100]);
});



test("skip cooldown requires an active paused batch and records the user's override", async () => {
  const targets = parseAccountList(Array.from({ length: 21 }, (_, index) => `@skip${index + 1}`).join(" ")).targets;
  const h = harness(targets, { status: "blocked", reason: "已拉黑" });
  const resumeAt = Date.now() + 1_800_000;
  h.store.quguangouJob = {
    status: "paused",
    pauseKind: "batch",
    blocklistVersion: "2026.09.09.1",
    targets,
    currentIndex: 20,
    results: targets.slice(0, 20).map((target) => ({ ...target, status: "blocked" })),
    workerTabId: null,
    batchSize: 20,
    batchNumber: 1,
    batchStartIndex: 0,
    batchEndIndex: 20,
    resumeAt,
    pauseReason: "本批已处理 20 个账号，冷却 30 分钟后请手动继续下一批"
  };
  h.store.quguangouQuota = { count: 20, nextAt: 0, cooldownUntil: resumeAt };

  const response = await h.message({ type: "SKIP_COOLDOWN" });
  assert.equal(response.ok, true);
  assert.equal(response.job.batchNumber, 2);
  assert.equal(response.job.batchStartIndex, 20);
  assert.equal(response.job.batchEndIndex, 21);
  assert.equal(response.job.skippedCooldowns.length, 1);
  assert.equal(response.job.skippedCooldowns[0].previousResumeAt, resumeAt);
});

test("skip cooldown is rejected when there is no active cooldown", async () => {
  const h = harness(parseAccountList("@only").targets, { status: "blocked", reason: "已拉黑" });
  h.store.quguangouJob.status = "paused";
  h.store.quguangouJob.pauseKind = "batch";
  h.store.quguangouQuota = { count: 0, nextAt: 0, cooldownUntil: 0 };
  const response = await h.message({ type: "SKIP_COOLDOWN" });
  assert.equal(response.ok, false);
});

test("successful completion still cleans up its worker tab", async () => {
  const h = harness(parseAccountList("@first").targets, { status: "blocked", reason: "已拉黑" });
  await h.run();
  assert.equal(h.store.quguangouJob.status, "completed");
  assert.deepEqual(h.removed, [100]);
});

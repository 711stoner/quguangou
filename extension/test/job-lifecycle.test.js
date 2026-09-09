import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { parseAccountList, parseAccountReference } from "../lib/accounts.js";
import { reserveAttempt } from "../lib/pacing.js";

const source = (await readFile(new URL("../background.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "").replace(/void runJob\(\);\s*$/, "");

function harness(targets, result) {
  const store = { quguangouJob: {
    status: "running", blocklistVersion: "2026.09.09.1",
    targets, currentIndex: 0, results: [], workerTabId: null
  } };
  const removed = [], navigated = [];
  let nextTab = 100;
  const chrome = {
    storage: { local: {
      get: async key => ({ [key]: structuredClone(store[key]) }),
      set: async values => Object.assign(store, structuredClone(values))
    } },
    runtime: { sendMessage: async () => {}, onMessage: { addListener() {} }, onStartup: { addListener() {} } },
    tabs: {
      create: async () => ({ id: nextTab++ }),
      get: async () => ({ status: "complete" }),
      update: async (id, options) => navigated.push({ id, ...options }),
      remove: async id => removed.push(id)
    },
    scripting: { executeScript: async () => [{ result }] }
  };
  const context = vm.createContext({ chrome, parseAccountList, parseAccountReference,
    reserveAttempt, Date, setTimeout: fn => { fn(); return 0; }, clearTimeout() {} });
  vm.runInContext(source, context);
  return { store, removed, navigated, run: () => vm.runInContext("runJob()", context) };
}

test("a failed profile is retained and remaining targets are not visited", async () => {
  const h = harness(parseAccountList("@first @second").targets, { status: "failed", reason: "菜单未找到" });
  await h.run();
  assert.equal(h.store.quguangouJob.status, "paused");
  assert.equal(h.store.quguangouJob.currentIndex, 1);
  assert.equal(h.store.quguangouJob.workerTabId, null);
  assert.equal(h.store.quguangouJob.retainedTabId, 100);
  assert.equal(h.navigated.length, 1);
  assert.deepEqual(h.removed, []);
  // A manually resumed job uses a new tab, leaving the failed page untouched.
  h.store.quguangouQuota.nextAt = 0;
  h.store.quguangouJob.status = "running";
  await h.run();
  assert.equal(h.navigated[1].id, 101);
  assert.deepEqual(h.removed, []);
});

test("even failure on the last target preserves the page", async () => {
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

test("successful completion still cleans up its worker tab", async () => {
  const h = harness(parseAccountList("@first").targets, { status: "blocked", reason: "已拉黑" });
  await h.run();
  assert.equal(h.store.quguangouJob.status, "completed");
  assert.deepEqual(h.removed, [100]);
});

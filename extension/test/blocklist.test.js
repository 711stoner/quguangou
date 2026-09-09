import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAccountList } from "../lib/accounts.js";

test("bundled blocklist has the expected shape", async () => {
  const url = new URL("../data/blocklist.json", import.meta.url);
  const payload = JSON.parse(await readFile(url, "utf8"));
  assert.equal(typeof payload.version, "string");
  assert.equal(typeof payload.description, "string");
  assert.ok(Array.isArray(payload.accounts));
  assert.ok(payload.accounts.every((account) => typeof account === "string"));
  const parsed = parseAccountList(payload.accounts.join("\n"));
  assert.ok(parsed.targets.some(target => target.label === "@665162" && target.url === "https://x.com/665162"));
  assert.ok(!parsed.targets.some(target => target.key === "id:665162"));
});

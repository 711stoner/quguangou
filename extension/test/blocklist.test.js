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
  assert.equal(parsed.invalid.length, 0);
  assert.equal(parsed.duplicates.length, 0);
  assert.equal(parsed.targets.length, payload.accounts.length);
});

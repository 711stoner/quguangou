import test from "node:test";
import assert from "node:assert/strict";
import { parseAccountList, parseAccountReference } from "../lib/accounts.js";

test("parses profile URLs, usernames, and numeric IDs", () => {
  assert.equal(parseAccountReference("https://x.com/OpenAI/status/123").label, "@OpenAI");
  assert.equal(parseAccountReference("twitter.com/OpenAI").url, "https://x.com/OpenAI");
  assert.equal(parseAccountReference("@OpenAI").key, "username:openai");
  assert.equal(parseAccountReference("123456").url, "https://x.com/i/user/123456");
});

test("deduplicates case-insensitively and reports invalid input", () => {
  const result = parseAccountList("@OpenAI, openai\nhttps://x.com/home\n123456");
  assert.deepEqual(result.targets.map((item) => item.label), ["@OpenAI", "用户 ID 123456"]);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.invalid.length, 1);
});

test("numeric handles are distinct from numeric user IDs", () => {
  assert.equal(parseAccountReference("@665162").url, "https://x.com/665162");
  assert.equal(parseAccountReference("https://x.com/665162").label, "@665162");
  assert.equal(parseAccountReference("665162").url, "https://x.com/i/user/665162");
});

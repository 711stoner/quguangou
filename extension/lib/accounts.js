const RESERVED_PATHS = new Set([
  "compose", "explore", "hashtag", "home", "i", "intent", "login", "messages",
  "notifications", "search", "settings", "share", "signup"
]);

export function parseAccountReference(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return { raw, error: "空白内容" };

  if (/^\d+$/.test(raw)) {
    return { raw, key: `id:${raw}`, label: `用户 ID ${raw}`, url: `https://x.com/i/user/${raw}` };
  }

  let candidate = raw;
  if (/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\//i.test(candidate)) {
    try {
      const normalized = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
      const url = new URL(normalized);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0]?.toLowerCase() === "i" && parts[1]?.toLowerCase() === "user" && /^\d+$/.test(parts[2] ?? "")) {
        const id = parts[2];
        return { raw, key: `id:${id}`, label: `用户 ID ${id}`, url: `https://x.com/i/user/${id}` };
      }
      candidate = parts[0] ?? "";
    } catch {
      return { raw, error: "X 链接格式无效" };
    }
  }

  candidate = candidate.replace(/^@/, "").trim();
  if (RESERVED_PATHS.has(candidate.toLowerCase())) return { raw, error: "这不是 X 用户主页链接" };
  if (!/^[A-Za-z0-9_]{1,15}$/.test(candidate)) {
    return { raw, error: "请输入 X 用户链接、@用户名或数字用户 ID" };
  }
  return {
    raw,
    key: `username:${candidate.toLowerCase()}`,
    label: `@${candidate}`,
    username: candidate,
    url: `https://x.com/${candidate}`
  };
}

export function parseAccountList(text, maxAccounts = 100) {
  const pieces = String(text ?? "")
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const targets = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();

  for (const piece of pieces) {
    const parsed = parseAccountReference(piece);
    if (parsed.error) {
      invalid.push(parsed);
      continue;
    }
    if (seen.has(parsed.key)) {
      duplicates.push(parsed);
      continue;
    }
    seen.add(parsed.key);
    targets.push(parsed);
  }

  if (targets.length > maxAccounts) {
    invalid.push({ raw: `共 ${targets.length} 个不同账号`, error: `单次最多处理 ${maxAccounts} 个账号` });
    targets.length = maxAccounts;
  }

  return { targets, invalid, duplicates, inputCount: pieces.length };
}

/**
 * Persistent, browser-only personal whitelist with an independent backup.
 * Chrome storage is isolated by extension ID; never claim that a different
 * unpacked extension installation shares this data.
 * No network calls, chrome.storage.sync, or export/import are involved.
 */
export const WHITELIST_KEY = "quguangouPersonalWhitelistV1";
export const WHITELIST_BACKUP_KEY = "quguangouPersonalWhitelistBackupV1";
export const WHITELIST_LAST_OWNER_KEY = "quguangouPersonalWhitelistLastOwnerV1";
export const WHITELIST_EVIDENCE_KEY = "quguangouPersonalWhitelistOwnerEvidenceV1";
const STORAGE_KEYS = [WHITELIST_KEY, WHITELIST_BACKUP_KEY, WHITELIST_LAST_OWNER_KEY, WHITELIST_EVIDENCE_KEY];

export function whitelistHandle(value) {
  const text = String(value || "").trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{1,15}$/.test(text) ? text : "";
}

export function whitelistOwnerKey(value) {
  const owner = whitelistHandle(value);
  return owner ? `x:${owner}` : "";
}

export function whitelistUserId(user) {
  const id = String(user?.userId || user?.rest_id || user?.id_str || user?.id || "");
  return /^\d+$/.test(id) ? id : "";
}

export function normalizeWhitelistEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const result = new Map();
  for (const item of raw) {
    const username = whitelistHandle(item?.username);
    if (!username) continue;
    result.set(username, {
      username,
      userId: whitelistUserId(item),
      displayName: String(item?.displayName || "").slice(0,80),
      addedAt: String(item?.addedAt || "")
    });
  }
  return [...result.values()];
}

const asMap = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const hasOwn = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

/** Returns live entries, falling back to the mirror only when necessary. */
export async function readWhitelist(storage, owner, {repair=true} = {}) {
  const ownerKey = whitelistOwnerKey(owner);
  if (!ownerKey) return [];
  const data = await storage.get(STORAGE_KEYS);
  const primary = asMap(data[WHITELIST_KEY]);
  const backup = asMap(data[WHITELIST_BACKUP_KEY]);
  const evidence = asMap(data[WHITELIST_EVIDENCE_KEY]);
  const primaryExists = Array.isArray(primary[ownerKey]);
  const backupExists = Array.isArray(backup[ownerKey]);
  if (!primaryExists && !backupExists) {
    if (evidence[ownerKey] === true) {
      // Never silently allow destructive operations when a formerly saved
      // whitelist is missing from BOTH independent snapshots.
      throw new Error("检测到以前保存过白名单，但当前插件存储无法读取。已停止相关操作；请保留现有插件和数据。");
    }
    return [];
  }
  // The primary is authoritative, including an intentionally emptied list;
  // a stale backup must never resurrect accounts that were removed.
  const entries = normalizeWhitelistEntries(primaryExists ? primary[ownerKey] : backup[ownerKey]);
  const updates = {};
  if (!primaryExists) updates[WHITELIST_KEY] = {...primary,[ownerKey]:entries};
  if (!backupExists || !same(normalizeWhitelistEntries(backup[ownerKey]),entries))
    updates[WHITELIST_BACKUP_KEY] = {...backup,[ownerKey]:entries};
  if (data[WHITELIST_LAST_OWNER_KEY] !== whitelistHandle(owner))
    updates[WHITELIST_LAST_OWNER_KEY] = whitelistHandle(owner);
  if (entries.length && evidence[ownerKey] !== true)
    updates[WHITELIST_EVIDENCE_KEY] = {...evidence,[ownerKey]:true};
  if (repair && Object.keys(updates).length) await storage.set(updates);
  return entries;
}

/** Single-writer caller must serialize concurrent changes to avoid lost edits. */
export async function updateWhitelist(storage, owner, user, protect) {
  const ownerKey = whitelistOwnerKey(owner);
  const username = whitelistHandle(user?.username);
  if (!ownerKey || !username) throw new Error("无法确认需要保护的 X 账号");
  const old = await readWhitelist(storage,owner);
  const next = old.filter(entry => entry.username !== username
    && !(whitelistUserId(user) && entry.userId === whitelistUserId(user)));
  if (protect) {
    next.push({
      username,userId:whitelistUserId(user),
      displayName:String(user?.displayName || "").slice(0,80),
      addedAt:new Date().toISOString()
    });
  }
  const data = await storage.get(STORAGE_KEYS);
  const primary = asMap(data[WHITELIST_KEY]);
  const backup = asMap(data[WHITELIST_BACKUP_KEY]);
  const evidence = asMap(data[WHITELIST_EVIDENCE_KEY]);
  await storage.set({
    [WHITELIST_KEY]:{...primary,[ownerKey]:next},
    [WHITELIST_BACKUP_KEY]:{...backup,[ownerKey]:next},
    [WHITELIST_LAST_OWNER_KEY]:whitelistHandle(owner),
    [WHITELIST_EVIDENCE_KEY]:{...evidence,[ownerKey]:evidence[ownerKey] === true || protect}
  });
  // Reply 'saved' only after BOTH browser-local copies can be read back.
  const verified = await storage.get([WHITELIST_KEY,WHITELIST_BACKUP_KEY]);
  if (!same(normalizeWhitelistEntries(asMap(verified[WHITELIST_KEY])[ownerKey]),next)
      || !same(normalizeWhitelistEntries(asMap(verified[WHITELIST_BACKUP_KEY])[ownerKey]),next)) {
    throw new Error("白名单保存校验失败，请重试。此前的记录不会被自动清空。");
  }
  return next;
}

export async function resolveWhitelistOwner(storage, currentScanOwner) {
  const scanned = whitelistHandle(currentScanOwner);
  if (scanned) return scanned;
  const data = await storage.get([WHITELIST_LAST_OWNER_KEY,WHITELIST_KEY,WHITELIST_BACKUP_KEY]);
  const remembered = whitelistHandle(data?.[WHITELIST_LAST_OWNER_KEY]);
  if (remembered) return remembered;
  // Pre-backup installations did not remember the owner separately. Recover
  // their existing per-account records without touching any other account.
  const primary = asMap(data[WHITELIST_KEY]);
  const backup = asMap(data[WHITELIST_BACKUP_KEY]);
  const owners = [...new Set([...Object.keys(primary),...Object.keys(backup)])]
    .filter(key => /^x:[a-z0-9_]{1,15}$/.test(key));
  return owners.length === 1 ? owners[0].slice(2) : "";
}

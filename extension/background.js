import { recentlyRateLimited, cursorPacingWindow, domPacingWindow, shouldClearRecoveryCount, advertisedRetryAfterMs } from "./lib/scan-pacing.js";
import { parseAccountList, parseAccountReference } from "./lib/accounts.js";
import { reserveAttempt } from "./lib/pacing.js";
import { dedupeUsers, mergeRunningPersonalScan, mergeUsersPreferLatest, shouldFallbackCursorToDom, evaluateUnknownDomEndCheckpoint, requiredRelationCount, shouldFallbackCursorAfterNoNewPages, getCompletedScanCountMismatch } from "./lib/relations.js";
import { planCommunityPromptSchedule } from "./lib/community-share.js";
import { shouldPauseForRepeatedXError, safeRelationFailure } from "./lib/scan-recovery.js";
import {
  WHITELIST_KEY, whitelistHandle, whitelistOwnerKey, whitelistUserId,
  readWhitelist, updateWhitelist, resolveWhitelistOwner
} from "./lib/whitelist-store.js";

const QG_BUILD_MARKER = "terminal-gap-v2-20261005-2235";
chrome.storage.local.set({ quguangouBuildMarker: QG_BUILD_MARKER }).catch(() => {});

const STORAGE_KEY = "quguangouJob";
const PERSONAL_SCAN_KEY = "quguangouPersonalScan";
const PERSONAL_SCAN_CHECKPOINT_PREFIX = "quguangouPersonalScanCheckpoint:";
let personalWhitelistWriteQueue = Promise.resolve();

function isPersonalWhitelisted(entries, user) {
  const handle = whitelistHandle(user?.username);
  const id = whitelistUserId(user);
  return (entries || []).some((entry) =>
    (Boolean(id) && Boolean(entry.userId) && String(entry.userId) === id)
      || (Boolean(handle) && whitelistHandle(entry.username) === handle));
}

async function readPersonalWhitelist(username) {
  if (!whitelistOwnerKey(username)) return [];
  // Reads must not race ahead of the queued whitelist write or its recovery.
  await personalWhitelistWriteQueue.catch(() => {});
  return readWhitelist(chrome.storage.local, username);
}

async function isPersonalTargetProtected(owner, target) {
  if (!whitelistOwnerKey(owner)) return true; // No verified owner: fail closed.
  return isPersonalWhitelisted(await readPersonalWhitelist(owner), target);
}

function updatePersonalWhitelist(owner, user, protect) {
  const task = personalWhitelistWriteQueue.catch(() => {}).then(() =>
    updateWhitelist(chrome.storage.local, owner, user, protect));
  personalWhitelistWriteQueue = task;
  return task;
}

const INSTALL_ID_KEY = "quguangouInstallId";
const PERSISTENT_WINDOW_KEY = "quguangouPersistentWindowId";
const COMMUNITY_API_URL = "https://quguangou-community-api.juejiangfm.workers.dev";
const LOCALE_COMMUNITY_API_URL = "https://quguangou-locale-community.juejiangfm.workers.dev";
const COMMUNITY_PARTITIONS = new Set(["en","ja","ko","fr","es","ms","vi","id"]);
function communityPartition(locale) {
  if (locale === "zh-CN" || locale === "zh-TW" || locale === "zh") return "zh";
  return COMMUNITY_PARTITIONS.has(locale) ? locale : "zh";
}

const PERSONAL_SCAN_ALARM = "quguangouPersonalScanWake";
const PERSONAL_SCAN_COOLDOWN_ALARM = "quguangouPersonalScanCooldownWake";
const BATCH_SIZE = 20;
let activeRun = false;
let activePersonalScan = false;
let activePersonalScanId = null;
// Once a scan is superseded by a forced window restart, its async callbacks
// must not overwrite the new scan, even if an old X request resolves late.
const retiredPersonalScanIds = new Set();
let sidePanelBehaviorReady = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const humanSleep = (min, max) => sleep(randomInt(min, max));

function getScanErrorMessage(error) {
  return String(error?.message || error || "").replace(/^SCAN_RECOVERABLE:/, "").trim();
}

function isPermanentPersonalScanError(error) {
  const message = getScanErrorMessage(error);
  return /X 登录状态已失效|当前浏览器中尚未登录 X|登录 X|Sign in to X|Log in to X|账号与生成这份私人名单的账号不一致|当前登录 X 账号与.*不一致/i.test(message);
}

function isPersonalScanRateLimited(reason) {
  return /HTTP_429|Too Many Requests|请求过多|rate.?limit/i.test(String(reason || ""));
}

function getPersonalScanRecoveryDelayMs(recoveryText, recoveryCount = 0) {
  const text = String(recoveryText || "");
  if (isPersonalScanRateLimited(text)) {
    // A rate limit needs a genuine cooldown, not a 3-5 minute retry loop.
    // 1st: 15-20 minutes; 2nd: 30-35 minutes; later: 60-65 minutes.
    const attempt = Math.max(1, Number(recoveryCount) || 1);
    const serverWaitMs = advertisedRetryAfterMs(text);
    return Math.max(serverWaitMs, Math.min(3600000, 900000 * (2 ** Math.min(2, attempt - 1))) + randomInt(0, 300000));
  }
  if (Number(recoveryCount || 0) >= 2 || /HTTP_5\d\d|GRAPHQL_ERROR|X 页面|分页暂时|持续显示临时错误/i.test(text))
    return randomInt(60000, 120000);
  return randomInt(15000, 30000);
}

function getExistingRateLimitUntil(scan, now = Date.now()) {
  const explicit = Number(scan?.rateLimitUntil || 0);
  if (explicit > now) return explicit;
  if (!isPersonalScanRateLimited(scan?.lastRecoverableError || scan?.pauseReason)) return 0;
  // Backward compatibility with a paused v0.2.59 scan: use the existing
  // timestamp instead of triggering an immediate request after an upgrade.
  const lastFailure = Date.parse(scan?.lastRecoveryAt || "");
  const minimum = Number.isFinite(lastFailure) ? lastFailure + 900000 : 0;
  return minimum > now ? minimum : 0;
}

function isRecoverableScanError(error) {
  const message = String(error?.message || error || "");
  if (message === "SCAN_CANCELLED") return false;
  if (isPermanentPersonalScanError(error)) return false;
  // 私人扫描的大多数失败都来自 X 页面加载、网络分页、标签页重建或脚本注入瞬断。
  // 默认保留已有进度并自动恢复；只有明确的登录/账号身份问题才要求人工处理。
  return true;
}

async function ensurePersonalScanAlarm() {
  try {
    const existing = await chrome.alarms.get(PERSONAL_SCAN_ALARM);
    if (!existing) {
      await chrome.alarms.create(PERSONAL_SCAN_ALARM, { periodInMinutes: 1 });
    }
  } catch {}
}

async function schedulePersonalScanCooldownWake(until) {
  const at = Number(until || 0);
  if (!(at > Date.now())) return;
  try {
    await chrome.alarms.create(PERSONAL_SCAN_COOLDOWN_ALARM, {
      when: Math.max(Date.now() + 1000, at + 1200)
    });
  } catch {}
}

async function clearPersonalScanAlarm() {
  try {
    await Promise.all([
      chrome.alarms.clear(PERSONAL_SCAN_ALARM),
      chrome.alarms.clear(PERSONAL_SCAN_COOLDOWN_ALARM)
    ]);
  } catch {}
}

async function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    sidePanelBehaviorReady = false;
    return false;
  }
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    sidePanelBehaviorReady = true;
    return true;
  } catch {
    sidePanelBehaviorReady = false;
    return false;
  }
}

async function openPersistentExtensionWindow() {
  const stored = await chrome.storage.local.get(PERSISTENT_WINDOW_KEY);
  const savedWindowId = Number(stored[PERSISTENT_WINDOW_KEY]);
  if (Number.isInteger(savedWindowId)) {
    const existing = await chrome.windows.get(savedWindowId).catch(() => null);
    const popupUrl = chrome.runtime.getURL("popup.html");
    let isOurWindow = false;

    if (existing?.id && typeof chrome.runtime.getContexts === "function") {
      const contexts = await chrome.runtime.getContexts({ windowIds: [savedWindowId] }).catch(() => []);
      isOurWindow = contexts.some((context) => String(context.documentUrl || "").startsWith(popupUrl));
    } else if (existing?.id) {
      isOurWindow = existing.type === "popup";
    }

    if (existing?.id && isOurWindow) {
      const updateInfo = { focused: true };
      if (existing.state === "minimized") updateInfo.state = "normal";
      await chrome.windows.update(existing.id, updateInfo).catch(() => {});
      return existing.id;
    }
    await chrome.storage.local.remove(PERSISTENT_WINDOW_KEY).catch(() => {});
  }

  const created = await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html?persistent=1"),
    type: "popup",
    width: 440,
    height: 760,
    focused: true
  });
  if (created?.id) {
    await chrome.storage.local.set({ [PERSISTENT_WINDOW_KEY]: created.id });
    return created.id;
  }
  throw new Error("无法打开取关狗窗口");
}

async function getAnonymousReporterHash() {
  const stored = await chrome.storage.local.get(INSTALL_ID_KEY);
  let installId = stored[INSTALL_ID_KEY];
  if (!installId) {
    installId = crypto.randomUUID();
    await chrome.storage.local.set({ [INSTALL_ID_KEY]: installId });
  }
  const bytes = new TextEncoder().encode(installId);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getCommunityCandidates(locale = "zh") {
  const partition = communityPartition(locale);
  const api = partition === "zh" ? COMMUNITY_API_URL : LOCALE_COMMUNITY_API_URL;
  const query = partition === "zh" ? "?limit=1000" :
    "?locale=" + encodeURIComponent(partition) + "&limit=1000";
  const response = await fetch(api + "/candidates" + query, {method:"GET",cache:"no-store"});
  if (!response.ok) throw new Error("社区名单暂时无法读取，请稍后再试");
  const payload = await response.json();
  if (!payload?.ok || !Array.isArray(payload.candidates)) {
    throw new Error(payload?.error || "社区名单暂时无法读取，请稍后再试");
  }
  // Fail closed: a legacy unpartitioned response must NEVER be mixed into a locale.
  if (partition !== "zh" && (payload.partitioned !== true || payload.locale !== partition)) {
    throw new Error("语言名单服务器尚未启用独立分区");
  }
  return payload.candidates.map((item) => ({
    username:String(item.username || "").replace(/^@/,"").trim(),
    submitCount:Math.max(1,Number(item.submitCount || 1)),
    firstSeen:item.firstSeen || null,
    lastSeen:item.lastSeen || null
  })).filter((item) => /^[A-Za-z0-9_]{1,15}$/.test(item.username));
}

async function submitCommunityReviewAccounts(accounts, locale = "zh") {
  const normalized = [];
  const seen = new Set();
  for (const item of Array.isArray(accounts) ? accounts : []) {
    const username = String(item?.username || "").replace(/^@/, "").trim();
    const action = item?.action === "unfollow" ? "unfollow" : item?.action === "block" ? "block" : null;
    const key = username.toLowerCase() + ":" + action;
    if (!/^[A-Za-z0-9_]{1,15}$/.test(username) || !action || seen.has(key)) continue;
    seen.add(key);
    normalized.push({ username, action });
  }
  if (!normalized.length) throw new Error("没有可加入社区名单的账号");

  const reporterHash = await getAnonymousReporterHash();
  const partition = communityPartition(locale);
  const api = partition === "zh" ? COMMUNITY_API_URL : LOCALE_COMMUNITY_API_URL;
  let accepted = 0;
  let duplicates = 0;
  let submitted = 0;

  for (let index = 0; index < normalized.length; index += 100) {
    const chunk = normalized.slice(index, index + 100);
    const response = await fetch(api + "/submit-review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(partition === "zh"
        ? { reporterHash, accounts: chunk }
        : { locale: partition, reporterHash, accounts: chunk })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || "社区名单上传失败，请稍后再试");
    }
    if (partition !== "zh" && (payload.partitioned !== true || payload.locale !== partition)) {
      throw new Error("语言名单服务器没有确认独立分区，已停止上传");
    }
    accepted += Number(payload.accepted || 0);
    duplicates += Number(payload.duplicates || 0);
    submitted += Number(payload.submitted || chunk.length);
  }

  return { ok: true, accepted, duplicates, submitted, destination: "review_queue" };
}

function getPendingCommunityShareAccounts(job) {
  if (!job || job.mode !== "personal") return [];
  const action = job.action === "unfollow" ? "unfollow" : "block";
  const allowedStatuses = action === "unfollow"
    ? new Set(["unfollowed", "already_unfollowed"])
    : new Set(["blocked", "already_blocked"]);
  const alreadySubmitted = new Set((job.communitySubmittedHandles || []).map((value) => String(value || "").toLowerCase()));
  const seen = new Set();
  const accounts = [];
  for (const resultItem of job.results || []) {
    if (!allowedStatuses.has(resultItem.status)) continue;
    const username = String(resultItem.username || "").replace(/^@/, "").trim();
    const key = username.toLowerCase();
    if (!/^[A-Za-z0-9_]{1,15}$/.test(username) || seen.has(key) || alreadySubmitted.has(key)) continue;
    seen.add(key);
    accounts.push({ username, action });
  }
  return accounts;
}

async function flushCommunityShareOptIn(job) {
  if (!job?.communityShareOptIn || job.mode !== "personal") return { job, submittedHandles: [] };
  const accounts = getPendingCommunityShareAccounts(job);
  if (!accounts.length) {
    job.communityShareLastError = null;
    return { job, submittedHandles: [] };
  }
  const result = await submitCommunityReviewAccounts(accounts, job.communityLocale || "zh");
  const submitted = new Set((job.communitySubmittedHandles || []).map((value) => String(value || "").toLowerCase()));
  accounts.forEach((item) => submitted.add(item.username.toLowerCase()));
  job.communitySubmittedHandles = [...submitted];
  job.communitySubmittedAt = new Date().toISOString();
  job.communitySubmittedCount = submitted.size;
  job.communityShareLastError = null;
  return { job, result, submittedHandles: accounts.map((item) => item.username) };
}

async function getJob() {
  const job = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? null;
  if (job && !job.mode) job.mode = "community";
  // Repair the numeric handle in saved bundled jobs without rewriting historical results.
  if (job?.blocklistVersion === "2026.09.09.1") {
    job.targets = job.targets.map((target, index) => index >= job.currentIndex && target.key === "id:665162"
      ? parseAccountReference("@665162") : target);
  }
  if (job?.status === "paused" && !job.pauseKind && (job.resumeAt || /冷却|20 个账号/.test(job.pauseReason || ""))) {
    job.pauseKind = "batch";
  }
  if (job?.communitySubmittedAt && !Array.isArray(job.communitySubmittedHandles)
      && job.mode === "personal") {
    const allowedStatuses = job.action === "unfollow"
      ? ["unfollowed", "already_unfollowed"]
      : ["blocked", "already_blocked"];
    job.communitySubmittedHandles = [...new Set((job.results || [])
      .filter((result) => allowedStatuses.includes(result.status))
      .map((result) => String(result.username || "").toLowerCase())
      .filter(Boolean))];
    job.communitySubmittedCount = job.communitySubmittedHandles.length;
  }
  return job;
}

async function setJob(job) {
  await chrome.storage.local.set({ [STORAGE_KEY]: job });
  chrome.runtime.sendMessage({ type: "JOB_UPDATED", job }).catch(() => {});
}

function normalizeBlocklist(payload, source, fetchedAt = null) {
  if (!payload || typeof payload !== "object") throw new Error("名单格式错误");
  if (!Array.isArray(payload.accounts)) throw new Error("名单格式错误：accounts 必须是数组");
  if (!payload.accounts.every((account) => typeof account === "string")) {
    throw new Error("名单格式错误：accounts 只能包含字符串");
  }
  const parsed = parseAccountList(payload.accounts.join("\n"), 1000);
  return {
    version: payload.version || "未标注",
    updatedAt: payload.updated_at || null,
    description: payload.description || "",
    reviewNote: payload.review_note || "",
    source,
    fetchedAt,
    ...parsed
  };
}

async function getBundledBlocklist() {
  const response = await fetch(chrome.runtime.getURL("data/blocklist.json"));
  if (!response.ok) throw new Error("无法读取扩展内置名单");
  return normalizeBlocklist(await response.json(), "bundled");
}

async function getBlocklist(locale = "zh") {
  const partition = communityPartition(locale);
  const bundled = partition === "zh"
    ? await getBundledBlocklist()
    : normalizeBlocklist({
        version: "locale-" + partition,
        updated_at: new Date().toISOString().slice(0,10),
        description: "",
        review_note: "",
        accounts: []
      }, "locale-empty");
  let approved = [];
  let remoteWarning = null;
  try {
    approved = await getCommunityCandidates(partition);
  } catch (error) {
    remoteWarning = error?.message || String(error);
  }

  const parsedApproved = parseAccountList(
    approved.map((item) => "@" + item.username).join("\n"),
    5000
  );
  const seen = new Set((bundled.targets || []).map((target) => target.key));
  const approvedTargets = [];
  for (const target of parsedApproved.targets || []) {
    if (seen.has(target.key)) continue;
    seen.add(target.key);
    approvedTargets.push(target);
  }

  return {
    ...bundled,
    locale: partition,
    version: approvedTargets.length ? bundled.version + " · 在线" : bundled.version,
    source: partition !== "zh"
      ? (approvedTargets.length ? "locale-approved" : "locale-empty")
      : (approvedTargets.length ? "bundled+approved" : "bundled"),
    targets: [...bundled.targets, ...approvedTargets],
    duplicates: [...bundled.duplicates, ...(parsedApproved.duplicates || [])],
    invalid: [...bundled.invalid, ...(parsedApproved.invalid || [])],
    approvedOnlineCount: approvedTargets.length,
    remoteWarning,
    remoteFetchedAt: new Date().toISOString()
  };
}

async function getBlocklistForJob(locale = "zh") {
  return getBlocklist(locale);
}

const personalScanCheckpointCache = new Map();

function personalScanCheckpointKey(scanId, relation) {
  return PERSONAL_SCAN_CHECKPOINT_PREFIX + scanId + ":" + relation;
}

async function getPersonalScanCheckpoint(scanId, relation) {
  if (!scanId) return [];
  const key = personalScanCheckpointKey(scanId, relation);
  if (personalScanCheckpointCache.has(key)) return personalScanCheckpointCache.get(key);
  const stored = await chrome.storage.local.get(key);
  const users = Array.isArray(stored[key]) ? stored[key] : [];
  personalScanCheckpointCache.set(key, users);
  return users;
}

async function savePersonalScanCheckpoint(scanId, relation, users = []) {
  if (!scanId || !["following", "followers"].includes(relation)) return [];
  const key = personalScanCheckpointKey(scanId, relation);
  const existing = personalScanCheckpointCache.has(key)
    ? personalScanCheckpointCache.get(key)
    : await getPersonalScanCheckpoint(scanId, relation);
  const merged = mergeUsersPreferLatest(existing, users);
  if (merged.length !== existing.length) {
    await chrome.storage.local.set({ [key]: merged });
    // Cache only after durable storage succeeds. A failed write must remain retryable.
    personalScanCheckpointCache.set(key, merged);
  }
  return merged;
}

async function clearPersonalScanCheckpoints(scanId) {
  if (!scanId) return;
  const followingKey = personalScanCheckpointKey(scanId, "following");
  const followersKey = personalScanCheckpointKey(scanId, "followers");
  personalScanCheckpointCache.delete(followingKey);
  personalScanCheckpointCache.delete(followersKey);
  await chrome.storage.local.remove([followingKey, followersKey]).catch(() => {});
}

async function getPersonalScan() {
  const scan = (await chrome.storage.local.get(PERSONAL_SCAN_KEY))[PERSONAL_SCAN_KEY] ?? null;
  if (!scan?.id || scan.status !== "running") return scan;

  const [followingCheckpoint, followersCheckpoint] = await Promise.all([
    getPersonalScanCheckpoint(scan.id, "following"),
    getPersonalScanCheckpoint(scan.id, "followers")
  ]);
  const hydrated = { ...scan };
  hydrated.progress = { following: 0, followers: 0, ...(scan.progress || {}) };
  hydrated.partial = { following: [], followers: [], ...(scan.partial || {}) };
  hydrated.relationCompleted = { following: false, followers: false, ...(scan.relationCompleted || {}) };

  for (const [relation, checkpoint] of [["following", followingCheckpoint], ["followers", followersCheckpoint]]) {
    if (!checkpoint.length) continue;
    // Checkpoint supplies missing handles; the main snapshot wins for overlapping metadata.
    const merged = mergeUsersPreferLatest(checkpoint, hydrated.partial[relation] || []);
    hydrated.partial[relation] = merged;
    hydrated.progress[relation] = Math.max(Number(hydrated.progress[relation] || 0), merged.length);
  }
  hydrated.followingCount = Math.max(
    Number(hydrated.followingCount || 0),
    Number(hydrated.progress.following || 0),
    hydrated.partial.following.length
  );
  hydrated.followersCount = Math.max(
    Number(hydrated.followersCount || 0),
    Number(hydrated.progress.followers || 0),
    hydrated.partial.followers.length
  );
  if (hydrated.phase === "followers" || Number(hydrated.progress.followers || 0) > 0) {
    hydrated.relationCompleted.following = true;
  }
  return hydrated;
}

function toPublicPersonalScan(scan) {
  if (!scan) return scan;
  const publicScan = { ...scan };
  delete publicScan.partial;
  return publicScan;
}

let personalScanWriteQueue = Promise.resolve();

async function setPersonalScan(scan, notify = true, allowTerminalResume = false) {
  const write = async () => {
    const existing = await getPersonalScan();
    if (scan?.id && retiredPersonalScanIds.has(scan.id)) {
      // Dropping late callbacks is vital: a retired worker may still have a
      // pending network response when the replacement window has started.
      return existing;
    }
    let next = scan;

    if (existing?.id && scan?.id && existing.id === scan.id) {
      // Never let a stale worker resurrect a scan that already reached a terminal state.
      if (existing.status === "paused" && scan.status !== "paused" && !allowTerminalResume) {
        // Old asynchronous workers must not resurrect or complete paused scans.
        next = existing;
      } else if (existing.status !== "running" && scan.status === "running" && !allowTerminalResume) {
        next = existing;
      } else if (existing.status === "running" && scan.status === "paused") {
        const saved = mergeRunningPersonalScan(existing, { ...scan, status: "running" });
        next = { ...saved, ...scan, partial: saved.partial, progress: saved.progress,
          relationCompleted: saved.relationCompleted, status: "paused" };
      } else if (existing.status === "running" && scan.status === "running") {
        // Running checkpoints are monotonic: partial users are unioned and counts cannot go backwards.
        next = mergeRunningPersonalScan(existing, scan);
      } else if (["failed", "cancelled"].includes(scan.status) && existing.partial && scan.partial) {
        // Preserve the deepest partial checkpoint even when this run stops.
        const preserved = mergeRunningPersonalScan(
          { ...existing, status: "running" },
          { ...scan, status: "running" }
        );
        next = { ...preserved, ...scan, partial: preserved.partial, progress: preserved.progress, relationCompleted: preserved.relationCompleted };
      }
    }

    if (next?.id && next.status === "running") {
      const following = Array.isArray(next.partial?.following) ? next.partial.following : [];
      const followers = Array.isArray(next.partial?.followers) ? next.partial.followers : [];
      if (following.length) {
        const mergedFollowing = await savePersonalScanCheckpoint(next.id, "following", following);
        next.partial = { ...(next.partial || {}), following: mergedFollowing };
        next.progress = { ...(next.progress || {}), following: Math.max(Number(next.progress?.following || 0), mergedFollowing.length) };
      }
      if (followers.length) {
        const mergedFollowers = await savePersonalScanCheckpoint(next.id, "followers", followers);
        next.partial = { ...(next.partial || {}), followers: mergedFollowers };
        next.progress = { ...(next.progress || {}), followers: Math.max(Number(next.progress?.followers || 0), mergedFollowers.length) };
      }

      // Keep the legacy scalar counters in lockstep with the deepest saved checkpoint.
      // Some older snapshots kept followersCount/followingCount stale while progress/partial
      // had already advanced, which made recovery diagnostics look like the scan went backwards.
      next.followingCount = Math.max(
        Number(next.followingCount || 0),
        Number(next.progress?.following || 0),
        Array.isArray(next.partial?.following) ? next.partial.following.length : 0
      );
      next.followersCount = Math.max(
        Number(next.followersCount || 0),
        Number(next.progress?.followers || 0),
        Array.isArray(next.partial?.followers) ? next.partial.followers.length : 0
      );
    }
    // Heartbeat saves happen even when the X list is frozen. Only advance this
    // timestamp when new account identities are actually saved.
    if (next?.id && next.status === "running") {
      const oldCounts = ["following", "followers"].map((relation) => Math.max(
        Number(existing?.progress?.[relation] || 0),
        Array.isArray(existing?.partial?.[relation]) ? existing.partial[relation].length : 0
      ));
      const newCounts = ["following", "followers"].map((relation) => Math.max(
        Number(next.progress?.[relation] || 0),
        Array.isArray(next.partial?.[relation]) ? next.partial[relation].length : 0
      ));
      const advanced = existing?.id === next.id && newCounts.some((count, index) => count > oldCounts[index]);
      next.lastAccountProgressAt = advanced ? Date.now()
        : Number(next.lastAccountProgressAt || existing?.lastAccountProgressAt || Date.now());
    }
    if (scan && next !== scan) Object.assign(scan, next);
    await chrome.storage.local.set({ [PERSONAL_SCAN_KEY]: next });
    if (notify) {
      chrome.runtime.sendMessage({ type: "PERSONAL_SCAN_UPDATED", scan: toPublicPersonalScan(next) }).catch(() => {});
    }
    return next;
  };

  const queued = personalScanWriteQueue.then(write, write);
  personalScanWriteQueue = queued.catch(() => {});
  return queued;
}

async function markPersonalScanStale(job, reason = "关注关系已发生变化，请重新检测") {
  if (job?.mode !== "personal" || !job.sourceScanId) return;
  const scan = await getPersonalScan();
  if (!scan || scan.id !== job.sourceScanId || scan.status !== "completed") return;
  scan.status = "stale";
  scan.phase = "stale";
  scan.staleReason = reason;
  scan.staleAt = new Date().toISOString();
  await setPersonalScan(scan);
}

function detectCurrentAccountInPage() {
  const loginPattern = /Log in to X|Sign in to X|登录 X|登入 X/i;
  if (/\/i\/flow\/login/.test(location.pathname) || loginPattern.test(document.body?.innerText || "")) {
    return { ok: false, error: "当前浏览器中尚未登录 X" };
  }

  const candidates = [];
  const addCandidate = (value) => {
    const username = String(value || "").replace(/^@/, "").trim();
    if (/^[A-Za-z0-9_]{1,15}$/.test(username)) candidates.push(username);
  };

  const profileLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
  addCandidate((profileLink?.getAttribute("href") || "").split("/").filter(Boolean)[0] || "");

  const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  const switcherMatch = (switcher?.innerText || "").match(/@([A-Za-z0-9_]{1,15})/);
  addCandidate(switcherMatch?.[1] || "");
  const avatar = switcher?.querySelector?.('[data-testid^="UserAvatar-Container-"]');
  const avatarTestId = avatar?.getAttribute?.("data-testid") || "";
  if (avatarTestId.startsWith("UserAvatar-Container-")) {
    addCandidate(avatarTestId.slice("UserAvatar-Container-".length));
  }

  const unique = [...new Map(candidates.map((value) => [value.toLowerCase(), value])).values()];
  if (unique.length > 1) {
    return { ok: false, error: "X 当前账号状态尚未稳定，页面中的账号信息不一致" };
  }
  if (!unique.length) {
    return { ok: false, error: "无法识别当前登录的 X 账号，页面结构可能已变化" };
  }
  return { ok: true, username: unique[0] };
}

async function verifyPersonalScanOwnerInTab(tabId, expectedUsername) {
  const injection = await chrome.scripting.executeScript({
    target: { tabId },
    func: detectCurrentAccountInPage
  });
  const account = injection?.[0]?.result;
  if (!account?.ok) {
    throw new Error(account?.error || "无法识别当前登录账号");
  }
  if (String(account.username || "").toLowerCase() !== String(expectedUsername || "").toLowerCase()) {
    throw new Error("当前登录 X 账号与本次检测账号 @" + expectedUsername + " 不一致，请切回原账号后点击继续检测");
  }
  return account.username;
}

function inspectProfileRelationInPage(username, relation) {
  const expectedHrefs = relation === "followers"
    ? ["/" + username + "/followers", "/" + username + "/verified_followers"]
    : ["/" + username + "/following"];
  const normalizedExpected = new Set(expectedHrefs.map((value) => value.toLowerCase()));
  const link = [...document.querySelectorAll('a[href]')].find((item) => {
    const href = item.getAttribute("href") || "";
    let pathname = "";
    try {
      pathname = new URL(href, location.origin).pathname;
    } catch {
      pathname = href.split("?")[0];
    }
    return normalizedExpected.has(pathname.replace(/\/$/, "").toLowerCase());
  });
  if (!link) return { known: false, raw: "" };

  const candidates = [
    (link.getAttribute("aria-label") || "").trim(),
    (link.innerText || "").trim()
  ].filter(Boolean);

  const parseCandidate = (value) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    const match = normalized.match(/([\d][\d,.]*)\s*([KMB万億亿])?/i);
    if (!match) return null;
    const unit = (match[2] || "").toUpperCase();
    const token = match[1];
    const normalizedToken = token.replace(",", ".");
    const numeric = unit
      ? Number.parseFloat(normalizedToken)
      : Number.parseInt(token.replace(/[,.]/g, ""), 10);
    if (!Number.isFinite(numeric)) return null;
    const multipliers = { K: 1000, M: 1000000, B: 1000000000, "万": 10000, "億": 100000000, "亿": 100000000 };
    const multiplier = multipliers[unit] || 1;
    const count = Math.round(numeric * multiplier);
    const decimals = unit && normalizedToken.includes(".") ? normalizedToken.split(".")[1].length : 0;
    const roundingTolerance = unit ? Math.ceil(0.5 * multiplier * (10 ** -decimals)) : 0;
    return { count, exact: !unit, tolerance: roundingTolerance, raw: value };
  };

  const parsed = candidates.map(parseCandidate).filter(Boolean);
  if (!parsed.length) return { known: false, raw: candidates[0] || "" };
  const best = parsed.find((item) => item.exact) || parsed[0];
  return {
    known: true,
    count: best.count,
    exact: best.exact,
    minimumExpected: best.count,
    tolerance: best.exact ? 0 : Number(best.tolerance || 0),
    isZero: best.count === 0,
    raw: best.raw
  };
}


async function ensureXRelationNetworkHook(tabId) {
  try {
    const versionResult = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => Number(window.__QG_RELATION_NETWORK_V2__?.version || 0)
    });
    const currentVersion = Number(versionResult?.[0]?.result || 0);

    // Never refresh the user's scan page just to upgrade the network hook.
    // Injecting the current hook in-place is sufficient; if no usable template is
    // captured, the scanner falls back to DOM mode without restarting the page.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["network-hook.js"],
      world: "MAIN"
    });

    const readyResult = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => Number(window.__QG_RELATION_NETWORK_V2__?.version || 0)
    });
    return Number(readyResult?.[0]?.result || 0) >= 4;
  } catch {
    return false;
  }
}

async function getXRelationNetworkStatus(tabId, relation) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (relationName) => {
        const state = window.__QG_RELATION_NETWORK_V2__;
        if (!state?.status) return { ok: false, error: "HOOK_NOT_READY" };
        return state.status(relationName);
      },
      args: [relation]
    });
    return result?.[0]?.result || { ok: false, error: "NO_RESULT" };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function pullXRelationNetworkPages(tabId, relation) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (relationName) => {
        const state = window.__QG_RELATION_NETWORK_V2__;
        if (!state?.pull) return { ok: false, error: "HOOK_NOT_READY", items: [] };
        return state.pull(relationName);
      },
      args: [relation]
    });
    return result?.[0]?.result || { ok: false, error: "NO_RESULT", items: [] };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), items: [] };
  }
}

async function fetchXRelationCursorPage(tabId, relation, cursor) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: async (relationName, savedCursor) => {
        const state = window.__QG_RELATION_NETWORK_V2__;
        if (!state?.fetchCursorPage) return { ok: false, error: "HOOK_NOT_READY" };
        return await state.fetchCursorPage(relationName, savedCursor);
      },
      args: [relation, cursor]
    });
    return result?.[0]?.result || { ok: false, error: "NO_RESULT" };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}


async function waitForXRelationNetworkTemplate(tabId, relation, timeoutMs = 7000) {
  await ensureXRelationNetworkHook(tabId);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await getXRelationNetworkStatus(tabId, relation);
    if (status?.templateReady) return true;
    await sleep(250);
  }
  return false;
}

function collectRelationRowsInPage(relation, stallRounds = 0, expectedRemaining = 0, resumeForwardOnly = false) {
  const relationPath = relation === "followers" ? "followers" : "following";
  const reserved = new Set(["home","explore","notifications","messages","search","settings","compose","i","login","logout","tos","privacy","about"]);
  const loginPattern = /Log in to X|Sign in to X|登录 X|登入 X/i;
  const pageText = document.body?.innerText || "";
  const loginRequired = /\/i\/flow\/login/.test(location.pathname) || loginPattern.test(pageText);
  const errorPhrase = /Something went wrong|Try reloading|出了点问题|出错了|发生错误/i.test(pageText);
  const retryControl = [...document.querySelectorAll('button,[role="button"]')].find((node) => {
    const text = (node.innerText || node.textContent || "").trim();
    const visible = typeof node.getClientRects !== "function" || node.getClientRects().length > 0;
    return visible && /^(Retry|Try again|Reload|重试|再试一次|重新加载)$/i.test(text);
  });
  const temporaryError = !loginRequired && errorPhrase && Boolean(retryControl);
  const routeValid = location.pathname.toLowerCase().replace(/\/$/, "").endsWith("/" + relationPath);
  const relationRoot = document.querySelector('[data-testid="primaryColumn"]')
    || document.querySelector('main[role="main"]')
    || document.querySelector('main');
  const cells = relationRoot ? [...relationRoot.querySelectorAll('[data-testid="UserCell"]')] : [];
  const users = [];

  for (const cell of cells) {
    const nameArea = cell.querySelector('[data-testid="User-Name"]');
    const links = [...(nameArea?.querySelectorAll('a[href^="/"]') || cell.querySelectorAll('a[href^="/"]'))];
    let username = "";
    for (const link of links) {
      const href = (link.getAttribute("href") || "").split("?")[0].split("#")[0];
      const parts = href.split("/").filter(Boolean);
      if (parts.length !== 1) continue;
      const candidate = parts[0];
      if (!/^[A-Za-z0-9_]{1,15}$/.test(candidate) || reserved.has(candidate.toLowerCase())) continue;
      username = candidate;
      break;
    }
    if (!username) continue;
    const linkTexts = links.map((link) => (link.innerText || "").trim()).filter(Boolean);
    const displayName = linkTexts.find((text) => !text.startsWith("@"))
      || (nameArea?.innerText || "").split("\n").map((part) => part.trim()).find((part) => part && !part.startsWith("@"))
      || "";
    const avatar = cell.querySelector('[data-testid*="UserAvatar"] img')?.getAttribute("src") || "";
    const verified = Boolean(cell.querySelector('[data-testid="icon-verified"]'));
    users.push({ username, displayName, avatar, verified });
  }

  const doc = document.documentElement;
  const scrollHeight = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
  const atBottom = window.scrollY + window.innerHeight >= scrollHeight - 240;
  const viewport = Math.max(480, window.innerHeight);
  const motion = Math.random();
  const visiblePage = document.visibilityState === "visible";
  const needsMore = Number(expectedRemaining || 0) > 0;

  const moveBy = (distance, smooth = visiblePage) => {
    const target = Math.max(0, window.scrollY + distance);
    window.scrollTo({
      top: target,
      behavior: smooth ? "smooth" : "auto"
    });
  };

  const cellMetrics = cells
    .map((cell) => ({ cell, rect: cell.getBoundingClientRect() }))
    .filter((item) => item.rect.height > 0 && item.rect.bottom > -120 && item.rect.top < window.innerHeight * 1.8)
    .sort((a, b) => a.rect.bottom - b.rect.bottom);
  const bottomCell = cellMetrics.at(-1)?.cell || null;
  let usedAnchorAdvance = false;

  if (resumeForwardOnly) {
    // Checkpoint catch-up mode: move only forward and never use random backtracking.
    // The goal is to rediscover the saved tail handles, not to collect a second copy.
    if (bottomCell) {
      bottomCell.scrollIntoView({ block: "end", behavior: "auto" });
      moveBy(Math.floor(viewport * 0.62), false);
    } else {
      window.scrollTo({ top: Math.max(0, scrollHeight), behavior: "auto" });
    }
  } else if (atBottom && needsMore) {
    // Stay pinned to the currently loaded bottom so X can trigger the next lazy-loaded batch.
    window.scrollTo({ top: Math.max(0, scrollHeight), behavior: "auto" });
  } else if (stallRounds >= 4 && bottomCell) {
    // When unique users stop increasing, advance from the last rendered user card instead of
    // trusting scrollHeight alone. This is much more reliable on X's virtualized long lists.
    bottomCell.scrollIntoView({
      block: stallRounds >= 9 ? "start" : "center",
      behavior: "auto"
    });
    moveBy(Math.floor(viewport * (stallRounds >= 10 ? 0.72 : 0.28)), false);
    usedAnchorAdvance = true;
  } else if (atBottom) {
    window.scrollTo({ top: Math.max(0, scrollHeight), behavior: "auto" });
  } else if (stallRounds > 0) {
    moveBy(Math.floor(viewport * (0.34 + Math.random() * 0.20)), false);
  } else if (motion < 0.10) {
    moveBy(-Math.floor(viewport * (0.04 + Math.random() * 0.05)));
  } else if (motion < 0.36) {
    moveBy(Math.floor(viewport * (0.20 + Math.random() * 0.13)));
  } else {
    moveBy(Math.floor(viewport * (0.32 + Math.random() * 0.18)));
  }

  return {
    users,
    totalCells: cells.length,
    scrollY: window.scrollY,
    scrollHeight: Math.max(doc.scrollHeight, document.body?.scrollHeight || 0),
    atBottom,
    usedAnchorAdvance,
    visibilityState: document.visibilityState,
    loginRequired,
    temporaryError,
    routeValid,
    pathname: location.pathname
  };
}


function recoverTemporaryXErrorInPage() {
  const text = document.body?.innerText || "";
  const hasErrorPhrase = /Something went wrong|Try reloading|出了点问题|出错了|发生错误/i.test(text);
  const candidates = [...document.querySelectorAll('button,[role="button"]')].filter((node) =>
    typeof node.getClientRects !== "function" || node.getClientRects().length > 0
  );
  const retry = candidates.find((node) => /^(Retry|Try again|Reload|重试|再试一次|重新加载)$/i.test((node.innerText || node.textContent || "").trim()));
  if (!hasErrorPhrase || !retry) return { hadError: false, clicked: false };
  if (retry) {
    retry.click();
    return { hadError: true, clicked: true, label: (retry.innerText || retry.textContent || "").trim() };
  }
  return { hadError: true, clicked: false };
}

function fastSeekCheckpointInPage(targetRatio, savedScrollY, savedScrollHeight, tailKeys, strongTailKeys, seekRound) {
  const doc = document.documentElement;
  const viewport = Math.max(480, window.innerHeight);
  const scrollHeight = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
  const maxScroll = Math.max(0, scrollHeight - viewport);
  const safeTargetRatio = Math.max(0.01, Math.min(0.995, Number(targetRatio || 0)));
  const savedMax = Math.max(0, Number(savedScrollHeight || 0) - viewport);
  const savedRatio = savedMax > 0 ? Math.max(0, Math.min(0.995, Number(savedScrollY || 0) / savedMax)) : 0;
  const blendedRatio = savedRatio > 0
    ? Math.max(0.01, Math.min(0.995, safeTargetRatio * 0.72 + savedRatio * 0.28))
    : safeTargetRatio;

  const relationRoot = document.querySelector('[data-testid="primaryColumn"]')
    || document.querySelector('main[role="main"]')
    || document.querySelector('main');
  const cells = relationRoot ? [...relationRoot.querySelectorAll('[data-testid="UserCell"]')] : [];
  const keys = [];
  for (const cell of cells) {
    const nameArea = cell.querySelector('[data-testid="User-Name"]');
    const links = [...(nameArea?.querySelectorAll('a[href^="/"]') || cell.querySelectorAll('a[href^="/"]'))];
    for (const link of links) {
      const href = (link.getAttribute("href") || "").split("?")[0].split("#")[0];
      const parts = href.split("/").filter(Boolean);
      if (parts.length !== 1) continue;
      const candidate = String(parts[0] || "").toLowerCase();
      if (!/^[a-z0-9_]{1,15}$/.test(candidate)) continue;
      keys.push(candidate);
      break;
    }
  }

  const tail = new Set((tailKeys || []).map((value) => String(value || "").toLowerCase()));
  const strong = new Set((strongTailKeys || []).map((value) => String(value || "").toLowerCase()));
  const strongMatch = keys.some((key) => strong.has(key));
  const tailMatchCount = keys.reduce((count, key) => count + (tail.has(key) ? 1 : 0), 0);
  const anchorMatched = strongMatch || tailMatchCount >= 2;

  if (!anchorMatched) {
    let targetY;
    const savedY = Math.max(0, Number(savedScrollY || 0));

    // If the newly opened virtual list has not expanded anywhere near the old depth,
    // jump directly to its current bottom to make X materialize the next virtual range.
    if (savedY > 0 && maxScroll + viewport * 3 < savedY) {
      targetY = maxScroll;
    } else {
      const base = Math.max(
        maxScroll * blendedRatio,
        savedY > 0 ? Math.min(savedY, maxScroll) : 0
      );

      // Search only around the estimated checkpoint. Start a few viewports before it
      // so normal scanning has overlap and cannot skip accounts if the list shifted.
      const offsets = [0, -3, 2, -6, 5, -10, 9, -15, 14, -22, 20];
      const offset = offsets[Math.min(offsets.length - 1, Math.max(0, seekRound - 3))] || 0;
      targetY = base - viewport * 4 + viewport * offset;
    }

    window.scrollTo({
      top: Math.max(0, Math.min(maxScroll, targetY)),
      behavior: "auto"
    });
  }

  return {
    anchorMatched,
    tailMatchCount,
    strongMatch,
    scrollY: window.scrollY,
    scrollHeight,
    maxScroll,
    viewport,
    blendedRatio,
    visibilityState: document.visibilityState
  };
}

async function scanRelationPage(tabId, username, scanId, relation, profileRelation = { known: false }, resumeFromCheckpoint = false) {
  const relationPath = relation === "followers" ? "followers" : "following";
  const relationLabel = relation === "followers" ? "粉丝" : "关注";
  const expectedPath = ("/" + username + "/" + relationPath).toLowerCase();
  const scanAtStart = await getPersonalScan();
  if (!scanAtStart || scanAtStart.id !== scanId || scanAtStart.status !== "running") throw new Error("SCAN_CANCELLED");

  const found = new Map();
  for (const user of (Array.isArray(scanAtStart.partial?.[relation]) ? scanAtStart.partial[relation] : [])) {
    const key = String(user?.username || "").toLowerCase();
    if (key) found.set(key, user);
  }
  const hadSavedRelationProgress = found.size > 0;

  let latestCursor = String(scanAtStart.progress?.[relation + "Cursor"] || "");
  let cursorFoundCount = Number(scanAtStart.progress?.[relation + "CursorCount"] || 0);
  let cursorObservedAt = scanAtStart.progress?.[relation + "CursorObservedAt"] || null;

  const mergeNetworkRecords = (records) => {
    let added = 0;
    for (const record of Array.isArray(records) ? records : []) {
      let recordAdded = 0;
      const recordKeys = [];
      for (const user of Array.isArray(record?.users) ? record.users : []) {
        const key = String(user?.username || "").toLowerCase();
        if (!key) continue;
        recordKeys.push(key);
        const previous = found.get(key);
        if (!previous) {
          added += 1;
          recordAdded += 1;
        }
        found.set(key, previous ? {
          ...previous,
          ...user,
          displayName: user.displayName || previous.displayName || "",
          avatar: user.avatar || previous.avatar || "",
          verified: Boolean(previous.verified || user.verified)
        } : user);
      }

      // A freshly loaded first page must never overwrite a deep saved checkpoint.
      // Map insertion order preserves scan order, so the current tail represents the frontier.
      const frontier = new Set([...found.keys()].slice(-120));
      const touchesFrontier = recordKeys.some((key) => frontier.has(key));
      if (record?.bottomCursor && (recordAdded > 0 || touchesFrontier)) {
        latestCursor = String(record.bottomCursor);
        cursorFoundCount = found.size;
        cursorObservedAt = new Date(record.observedAt || Date.now()).toISOString();
      }
    }
    return added;
  };

  let currentTab = await chrome.tabs.get(tabId).catch(() => null);
  if (!currentTab) {
    throw new Error("SCAN_RECOVERABLE:扫描标签已被浏览器关闭或回收");
  }
  if (currentTab.discarded) {
    await chrome.tabs.reload(tabId).catch(() => {
      throw new Error("SCAN_RECOVERABLE:扫描标签已被浏览器休眠");
    });
    await waitForTabComplete(tabId).catch(() => {
      throw new Error("SCAN_RECOVERABLE:扫描标签恢复超时");
    });
    await humanSleep(800, 1400);
    currentTab = await chrome.tabs.get(tabId).catch(() => null);
    if (!currentTab) throw new Error("SCAN_RECOVERABLE:扫描标签恢复失败");
  }

  let currentPath = "";
  if (currentTab?.url) {
    try { currentPath = new URL(currentTab.url).pathname.replace(/\/$/, "").toLowerCase(); } catch {}
  }

  if (currentPath !== expectedPath) {
    await chrome.tabs.update(tabId, { url: "https://x.com/" + username + "/" + relationPath, active: true });
    await waitForTabComplete(tabId);
    await humanSleep(1100, 1900);
  } else {
    await humanSleep(350, 750);
  }

  await verifyPersonalScanOwnerInTab(tabId, username);
  await ensureXRelationNetworkHook(tabId);

  // Prefer X's own paginated GraphQL stream. Wait briefly for the first response so
  // a fresh scan can switch to cursor mode without scrolling thousands of DOM rows.
  let networkTemplateReady = await waitForXRelationNetworkTemplate(tabId, relation, 3200);
  for (let initialWait = 0; initialWait < 12 && !latestCursor; initialWait += 1) {
    const initialBatch = await pullXRelationNetworkPages(tabId, relation);
    if (initialBatch?.ok && Array.isArray(initialBatch.items) && initialBatch.items.length) {
      mergeNetworkRecords(initialBatch.items);
    }
    if (latestCursor) break;
    await sleep(180);
  }

  const savedScrollY = Number(scanAtStart.progress?.[relation + "ScrollY"] || 0);
  const savedScrollHeight = Number(scanAtStart.progress?.[relation + "ScrollHeight"] || 0);
  const savedUsers = [...found.values()];
  const tailUsers = savedUsers.slice(-80);
  const tailKeys = tailUsers.map((user) => String(user?.username || "").toLowerCase()).filter(Boolean);
  const strongTailKeys = tailUsers.slice(-12).map((user) => String(user?.username || "").toLowerCase()).filter(Boolean);
  const shouldResumeNearCheckpoint = Boolean((resumeFromCheckpoint || latestCursor) && found.size >= 24 && tailKeys.length);
  const expectedForRatio = Number(profileRelation?.minimumExpected || 0);
  const checkpointRatio = expectedForRatio > 0
    ? Math.max(0.01, Math.min(0.995, found.size / expectedForRatio))
    : 0.5;

  const relationTolerance = Number(profileRelation?.tolerance || 0);
  const relationRequired = requiredRelationCount(profileRelation);

  let cursorResumeSucceeded = false;
  let cursorReachedEnd = false;
  let cursorHadSuccessfulPage = false;
  let cursorDisabledForRelation = Boolean(scanAtStart.progress?.[relation + "CursorDisabled"]);
  // Do not replay GraphQL cursor requests: let X load its own pages while
  // the extension only reads visible DOM and observed responses. This avoids
  // sending an extra request stream on top of X's own lazy loading.
  const allowSyntheticCursorRequests = false;
  if (allowSyntheticCursorRequests && latestCursor && !cursorDisabledForRelation) {
    let templateReady = networkTemplateReady;

    if (!templateReady && (resumeFromCheckpoint || hadSavedRelationProgress)) {
      // Do not reload the scan page just to obtain a GraphQL request template.
      // A missing template only disables the fast cursor path for this pass; the
      // saved checkpoint is still resumed through the DOM scanner below.
      templateReady = false;
      networkTemplateReady = false;
    }

    if (templateReady) {
      let cursor = latestCursor;
      const usedCursors = new Set();
      let cursorPage = 0;
      let cursorError = null;
      let cursorNoNewUserPages = 0;
      let cursorStoppedAfterNoNewUsers = false;

      const publishCursorProgress = async (_force = false) => {
        const latest = await getPersonalScan();
        if (!latest || latest.id !== scanId || latest.status !== "running") throw new Error("SCAN_CANCELLED");
        latest.phase = relation;
        latest.recoveryPending = true;
        latest.recoveryMessage = "正在从已保存位置继续读取";
        latest.progress = {
          ...(latest.progress || {}),
          [relation]: found.size,
          [relation + "CursorResumeActive"]: true,
          [relation + "CursorResumeFromCheckpoint"]: Boolean(resumeFromCheckpoint || hadSavedRelationProgress),
          [relation + "CursorResumePages"]: cursorPage,
          [relation + "Cursor"]: cursor,
          [relation + "CursorCount"]: found.size,
          [relation + "CursorObservedAt"]: cursorObservedAt
        };
        latest.partial = { ...(latest.partial || {}), [relation]: dedupeUsers([...found.values()]) };
        latest.resumeSavedAt = new Date().toISOString();
        await setPersonalScan(latest, true);
      };

      await publishCursorProgress(true);

      for (; cursorPage < 360; cursorPage += 1) {
        const current = await getPersonalScan();
        if (!current || current.id !== scanId || current.status !== "running") throw new Error("SCAN_CANCELLED");
        if (!cursor || usedCursors.has(cursor)) break;
        usedCursors.add(cursor);

        const page = await fetchXRelationCursorPage(tabId, relation, cursor);
        if (!page?.ok) {
          cursorError = (page?.error || ("HTTP_" + (page?.status || "unknown")))
            + (page?.retryAfterMs > 0 ? " RETRY_AFTER_MS=" + Math.floor(page.retryAfterMs) : "");
          break;
        }
        cursorHadSuccessfulPage = true;

        const addedThisPage = mergeNetworkRecords([{
          users: page.users || [],
          bottomCursor: page.bottomCursor || null,
          observedAt: Date.now()
        }]);
        cursorNoNewUserPages = addedThisPage > 0 ? 0 : cursorNoNewUserPages + 1;

        const nextCursor = String(page.bottomCursor || "");
        if (nextCursor) {
          latestCursor = nextCursor;
          cursorFoundCount = found.size;
          cursorObservedAt = new Date().toISOString();
        }

        await publishCursorProgress(false);

        if (nextCursor && shouldFallbackCursorAfterNoNewPages(profileRelation, found.size, cursorNoNewUserPages)) {
          cursorStoppedAfterNoNewUsers = true;
          cursorDisabledForRelation = true;
          latestCursor = "";
          break;
        }

        if (!nextCursor) {
          cursorReachedEnd = true;
          cursorResumeSucceeded = !profileRelation?.known
            || relationRequired <= 0
            || found.size >= relationRequired;
          break;
        }
        if (nextCursor === cursor) {
          cursorError = "CURSOR_STALLED";
          break;
        }

        cursor = nextCursor;
        // Previous versions could send 15-24 pagination requests per minute.
        // Even with occasional short rests, that was unsustainable for large lists.
        const recent429 = recentlyRateLimited(current.lastRateLimitAt);
        const [minWait, maxWait] = cursorPacingWindow(cursorPage + 1, recent429);
        await sleep(randomInt(minWait, maxWait));
      }

      const latest = await getPersonalScan();
      if (!latest || latest.id !== scanId || latest.status !== "running") throw new Error("SCAN_CANCELLED");
      latest.progress = {
        ...(latest.progress || {}),
        [relation]: found.size,
        [relation + "CursorResumeActive"]: false,
        [relation + "CursorResumeFromCheckpoint"]: false,
        [relation + "CursorResumePages"]: cursorPage,
        [relation + "Cursor"]: cursorDisabledForRelation ? "" : (latestCursor || latest.progress?.[relation + "Cursor"] || ""),
        [relation + "CursorDisabled"]: cursorDisabledForRelation,
        [relation + "CursorDisableReason"]: cursorStoppedAfterNoNewUsers
          ? "NO_NEW_USERS_AT_TARGET"
          : (latest.progress?.[relation + "CursorDisableReason"] || ""),
        [relation + "CursorNoNewPages"]: cursorNoNewUserPages,
        [relation + "CursorCount"]: cursorFoundCount || found.size,
        [relation + "CursorObservedAt"]: cursorObservedAt
      };
      latest.partial = { ...(latest.partial || {}), [relation]: dedupeUsers([...found.values()]) };
      latest.resumeSavedAt = new Date().toISOString();
      latest.recoveryPending = false;
      latest.recoveryMessage = null;
      if (cursorError) latest.lastCursorResumeError = cursorError;
      else latest.lastCursorResumeError = null;
      await setPersonalScan(latest, true);

      const cursorEndIsComplete = cursorReachedEnd && cursorHadSuccessfulPage && (
        profileRelation?.known
          ? (profileRelation?.isZero || relationRequired <= 0 || found.size >= relationRequired)
          : found.size > 0
      );
      if (cursorEndIsComplete) {
        const directUsers = dedupeUsers([...found.values()]);
        latest.relationCompleted = { ...(latest.relationCompleted || {}), [relation]: true };
        latest.progress = {
          ...(latest.progress || {}),
          [relation]: directUsers.length,
          [relation + "CursorEnded"]: Boolean(cursorReachedEnd),
          [relation + "CursorResumeActive"]: false,
          [relation + "CursorResumeFromCheckpoint"]: false,
          resting: false,
          restingRelation: null
        };
        latest.partial = { ...(latest.partial || {}), [relation]: directUsers };
        latest.resumeSavedAt = new Date().toISOString();
        await setPersonalScan(latest, true);
        return directUsers;
      }

      if (cursorError) {
        if (shouldFallbackCursorToDom(cursorError)) {
          // Some X relation GraphQL templates (especially Followers) can become invalid
          // and return a stable 4xx for direct cursor requests. Retrying the same cursor
          // forever cannot recover. Disable only this relation's fast path and continue
          // immediately with DOM scrolling from the saved checkpoint.
          cursorDisabledForRelation = true;
          latestCursor = "";
          latest.progress = {
            ...(latest.progress || {}),
            [relation]: found.size,
            [relation + "Cursor"]: "",
            [relation + "CursorDisabled"]: true,
            [relation + "CursorDisableReason"]: cursorError,
            [relation + "CursorResumeActive"]: false,
            [relation + "CursorResumeFromCheckpoint"]: false,
            [relation + "ResumeTarget"]: Math.max(Number(latest.progress?.[relation + "ResumeTarget"] || 0), found.size)
          };
          latest.partial = { ...(latest.partial || {}), [relation]: dedupeUsers([...found.values()]) };
          latest.recoveryPending = false;
          latest.recoveryMessage = null;
          latest.lastCursorResumeError = cursorError;
          latest.resumeSavedAt = new Date().toISOString();
          await setPersonalScan(latest, true);
        } else {
          const readableCursorError = cursorError === "CURSOR_STALLED"
            ? relationLabel + "分页暂时卡住"
            : relationLabel + "分页请求暂时失败（" + cursorError + "）";
          throw new Error("SCAN_RECOVERABLE:" + readableCursorError);
        }
      }
    }
  }

  if (shouldResumeNearCheckpoint && !cursorResumeSucceeded) {
    let anchorMatched = false;
    let lastSeekState = null;
    const seekStarted = Date.now();

    const publishSeek = async (seekRound, state) => {
      const latest = await getPersonalScan();
      if (!latest || latest.id !== scanId || latest.status !== "running") throw new Error("SCAN_CANCELLED");
      latest.phase = relation;
      latest.recoveryPending = true;
      latest.recoveryMessage = "正在回到上次保存的位置";
      latest.progress = {
        ...(latest.progress || {}),
        [relation]: found.size,
        [relation + "ResumeActive"]: true,
        [relation + "ResumeSeekRound"]: seekRound,
        [relation + "ResumeTarget"]: found.size,
        [relation + "ResumeRatio"]: Math.round((state?.blendedRatio || checkpointRatio) * 100)
      };
      await setPersonalScan(latest, true);
    };

    // Bounded seek: never replay thousands of saved users from the top.
    for (let seekRound = 0; seekRound < 18; seekRound += 1) {
      const current = await getPersonalScan();
      if (!current || current.id !== scanId || current.status !== "running") throw new Error("SCAN_CANCELLED");

      let injection;
      try {
        injection = await chrome.scripting.executeScript({
          target: { tabId },
          func: fastSeekCheckpointInPage,
          args: [checkpointRatio, savedScrollY, savedScrollHeight, tailKeys, strongTailKeys, seekRound]
        });
      } catch (error) {
        throw new Error("SCAN_RECOVERABLE:快速定位断点时页面暂时无法读取：" + (error?.message || String(error)));
      }

      const state = injection[0]?.result;
      if (!state) throw new Error("SCAN_RECOVERABLE:快速定位断点时没有读取到页面");
      lastSeekState = state;
      if (state.anchorMatched) {
        anchorMatched = true;
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.scrollBy({ top: Math.max(260, window.innerHeight * 0.40), behavior: "auto" })
        }).catch(() => {});
        break;
      }

      if (seekRound === 0 || seekRound % 2 === 1) await publishSeek(seekRound + 1, state);
      if (Date.now() - seekStarted > 18000) break;
      await sleep(seekRound < 4 ? 320 : 480);
    }

    const latest = await getPersonalScan();
    if (!latest || latest.id !== scanId || latest.status !== "running") throw new Error("SCAN_CANCELLED");
    latest.progress = {
      ...(latest.progress || {}),
      [relation + "ResumeActive"]: false,
      [relation + "ResumeTarget"]: found.size,
      [relation + "ResumeRatio"]: Math.round((lastSeekState?.blendedRatio || checkpointRatio) * 100)
    };

    if (anchorMatched) {
      latest.recoveryPending = false;
      latest.recoveryMessage = null;
      latest.lastResumeAnchorMatchedAt = new Date().toISOString();
    } else {
      // Do not restart from the top. Continue from the coarse checkpoint with several
      // viewports of overlap. Dedupe protects already-saved users while new users resume.
      latest.recoveryPending = false;
      latest.recoveryMessage = null;
      latest.lastResumeCoarseAt = new Date().toISOString();
    }
    await setPersonalScan(latest, true);
  } else if (savedScrollY > 0 && !resumeFromCheckpoint) {
    // Same live worker page: pixel position is only a small assist.
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (targetY) => {
        if (Math.abs(window.scrollY - targetY) > window.innerHeight * 2) {
          window.scrollTo({ top: targetY, behavior: "auto" });
        }
      },
      args: [savedScrollY]
    }).catch(() => {});
  }

  let stableRounds = 0;
  let temporaryErrorRounds = 0;
  let lastHealthyScrollY = Number(savedScrollY || 0);
  let lastHealthyScrollHeight = Number(savedScrollHeight || 0);
  let domConfirmedEnd = false;
  let lastHeight = 0;
  let sameHeightRounds = 0;
  let nextHumanPauseAt = found.size + randomInt(85, 130);
  let humanPauseCount = Number(scanAtStart.progress?.humanPauseCount || 0);
  let lastPersistedSize = found.size;
  let lastPersistAt = Date.now();
  const maxRounds = 1200;

  const persistState = async (page, notify = true) => {
    const latest = await getPersonalScan();
    if (!latest || latest.id !== scanId || latest.status !== "running") throw new Error("SCAN_CANCELLED");
    const now = Date.now();
    const previousSavedCount = Number(latest.progress?.[relation] || 0);
    const madeRealProgress = found.size > previousSavedCount;
    latest.phase = relation;
    if (madeRealProgress) {
      latest.recoveryPending = false;
      latest.recoveryMessage = null;
      // Do not reset the 429 circuit breaker after a single successful page.
      // Account-level limits span multiple scan windows and resumed sessions.
      if (shouldClearRecoveryCount(latest.lastRateLimitAt)) latest.consecutiveRecoveryCount = 0;
      latest.nextRecoveryAt = null;
      latest.rateLimitUntil = null;
    }
    latest.progress = {
      ...(latest.progress || {}),
      ...(madeRealProgress ? {
        [relation + "UnknownEndConfirmations"]: 0,
        [relation + "UnknownEndCount"]: 0,
        [relation + "UnknownEndTail"]: "",
        [relation + "UnknownEndValidated"]: false,
        [relation + "MismatchEndConfirmations"]: 0,
        [relation + "MismatchEndCount"]: 0,
        [relation + "MismatchEndTail"]: "",
        [relation + "MismatchEndValidated"]: false
      } : {}),
      [relation]: found.size,
      [relation + "ScrollY"]: Number(page?.scrollY || latest.progress?.[relation + "ScrollY"] || 0),
      [relation + "ScrollHeight"]: Number(page?.scrollHeight || latest.progress?.[relation + "ScrollHeight"] || 0),
      [relation + "ResumeTarget"]: Math.max(Number(latest.progress?.[relation + "ResumeTarget"] || 0), found.size),
      [relation + "Cursor"]: latestCursor || latest.progress?.[relation + "Cursor"] || "",
      [relation + "CursorCount"]: cursorFoundCount || latest.progress?.[relation + "CursorCount"] || 0,
      [relation + "CursorObservedAt"]: cursorObservedAt || latest.progress?.[relation + "CursorObservedAt"] || null,
      humanPauseCount
    };
    if (found.size !== lastPersistedSize || now - lastPersistAt >= 4000) {
      latest.partial = { ...(latest.partial || {}), [relation]: dedupeUsers([...found.values()]) };
      latest.resumeSavedAt = new Date().toISOString();
      lastPersistedSize = found.size;
      lastPersistAt = now;
    }
    await setPersonalScan(latest, notify);
  };

  for (let round = 0; round < maxRounds; round += 1) {
    const current = await getPersonalScan();
    if (!current || current.id !== scanId || current.status !== "running") throw new Error("SCAN_CANCELLED");

    // Respect a 429 from X's own lazy-load requests immediately. Previously
    // the network error was only examined after the page displayed an error,
    // which allowed additional scrolling while X was already rejecting calls.
    const relationNetwork = await getXRelationNetworkStatus(tabId, relation);
    const recentNetworkFailure = safeRelationFailure(relationNetwork?.lastFailure);
    if (recentNetworkFailure?.startsWith("HTTP_429")) {
      const failure = relationNetwork.lastFailure;
      const retryAfter = Math.max(0, Number(failure?.retryAfterMs || 0));
      throw new Error("SCAN_RECOVERABLE:HTTP_429" +
        (retryAfter ? " RETRY_AFTER_MS=" + retryAfter : "") +
        "：X 已限制请求，已保存进度并停止继续加载");
    }

    let injection;
    try {
      const expectedMinimumForScroll = Number(profileRelation?.minimumExpected || 0);
      const expectedRemainingForScroll = expectedMinimumForScroll > 0
        ? Math.max(0, expectedMinimumForScroll - found.size)
        : 0;
      injection = await chrome.scripting.executeScript({
        target: { tabId },
        func: collectRelationRowsInPage,
        args: [relation, stableRounds, expectedRemainingForScroll, false]
      });
    } catch (error) {
      throw new Error("SCAN_RECOVERABLE:页面暂时无法继续读取：" + (error?.message || String(error)));
    }
    const page = injection[0]?.result;
    if (!page) throw new Error("SCAN_RECOVERABLE:" + relationLabel + "列表页面暂时没有返回扫描结果");
    if (page.loginRequired) throw new Error("X 登录状态已失效，请重新登录后再检测");
    if (page.temporaryError) {
      temporaryErrorRounds += 1;
      await persistState({
        ...page,
        scrollY: lastHealthyScrollY || page.scrollY,
        scrollHeight: lastHealthyScrollHeight || page.scrollHeight
      }, true);

      // X sometimes replaces the final virtual-list viewport with "Something went wrong"
      // even though the relation list has effectively reached its terminal frontier.
      // Treat that as terminal evidence only when ALL safeguards agree:
      // - profile count is exact
      // - the gap is tiny (<= 1%, capped at 50)
      // - the last healthy scroll position was effectively at the bottom
      // - this worker has observed the error repeatedly
      // The same frontier must still be confirmed in a second recovery pass.
      const tempExpected = Number(profileRelation?.minimumExpected || 0);
      const tempExact = Boolean(profileRelation?.known && profileRelation?.exact && tempExpected > 0);
      const tempMissing = tempExact ? Math.max(0, tempExpected - found.size) : 0;
      const tempGapLimit = tempExact
        ? Math.min(50, Math.floor(tempExpected * 0.01))
        : 0;
      const tempScrollHeight = Number(lastHealthyScrollHeight || page.scrollHeight || 0);
      const tempScrollY = Number(lastHealthyScrollY || page.scrollY || 0);
      const tempRemainingPx = Math.max(0, tempScrollHeight - tempScrollY);
      const tempNearBottom = tempScrollHeight > 0 && (
        tempScrollY / tempScrollHeight >= 0.985
        || tempRemainingPx <= 2500
      );

      if (temporaryErrorRounds >= 3
          && tempMissing > 0
          && tempMissing <= tempGapLimit
          && tempNearBottom) {
        const terminalScan = await getPersonalScan();
        if (!terminalScan || terminalScan.id !== scanId || terminalScan.status !== "running") {
          throw new Error("SCAN_CANCELLED");
        }
        const terminalUsers = dedupeUsers([...found.values()]);
        const terminalHandles = terminalUsers
          .map((user) => String(user?.username || "").toLowerCase())
          .filter(Boolean);
        const terminalTail = terminalHandles.slice(-12).join("|");
        const previousCount = Number(terminalScan.progress?.[relation + "MismatchEndCount"] ?? -1);
        const previousTail = String(terminalScan.progress?.[relation + "MismatchEndTail"] || "");
        const previousConfirmations = Number(terminalScan.progress?.[relation + "MismatchEndConfirmations"] || 0);
        const sameTerminalFrontier = previousCount === terminalUsers.length && previousTail === terminalTail;
        const confirmations = sameTerminalFrontier ? previousConfirmations + 1 : 1;

        terminalScan.progress = {
          ...(terminalScan.progress || {}),
          [relation]: terminalUsers.length,
          [relation + "MismatchEndConfirmations"]: confirmations,
          [relation + "MismatchEndCount"]: terminalUsers.length,
          [relation + "MismatchEndTail"]: terminalTail,
          [relation + "MismatchEndValidated"]: confirmations >= 2
        };
        terminalScan.partial = { ...(terminalScan.partial || {}), [relation]: terminalUsers };
        terminalScan.resumeSavedAt = new Date().toISOString();
        await setPersonalScan(terminalScan, true);

        if (confirmations >= 2) {
          domConfirmedEnd = true;
          break;
        }
        throw new Error(
          "SCAN_RECOVERABLE:" + relationLabel + "已到列表末端附近，但 X 返回临时错误；"
          + "当前比主页少 " + tempMissing + " 个，已记录终点，将再校验一次"
        );
      }
      const networkStatus = await getXRelationNetworkStatus(tabId, relation);
      const diagnostic = safeRelationFailure(networkStatus?.lastFailure);
      if (diagnostic) {
        throw new Error("SCAN_RECOVERABLE:" + relationLabel + "读取失败（" + diagnostic + "），已保存断点");
      }
      const recoveringScan = await getPersonalScan();
      if (recoveringScan?.id === scanId && recoveringScan.status === "running") {
        recoveringScan.recoveryPending = true;
        recoveringScan.lastRecoverableError = "X 页面出现临时错误（Something went wrong）";
        recoveringScan.recoveryMessage = "X 列表加载异常，已保存 " + found.size + " 个账号；先自动尝试恢复，持续失败就暂停并等待你手动继续。";
        recoveringScan.lastRecoveryAt = new Date().toISOString();
        await setPersonalScan(recoveringScan, true);
      }

      // One page Retry per recovery cycle, not an endless click/reload loop.
      // Preserve the v0.2.56 terminal-gap validator by observing a 3rd round.
      if (temporaryErrorRounds === 2) {
        await humanSleep(12000, 18000);
        continue;
      }
      if (temporaryErrorRounds >= 3) {
        throw new Error("SCAN_RECOVERABLE:X 页面持续显示临时错误，自动恢复失败，已保存进度");
      }
      await humanSleep(12000, 18000);
      let retryResult = null;
      try {
        const retryInjection = await chrome.scripting.executeScript({
          target: { tabId },
          func: recoverTemporaryXErrorInPage
        });
        retryResult = retryInjection?.[0]?.result || null;
      } catch {}
      if (retryResult?.clicked) {
        await humanSleep(6500, 11000);
      } else {
        throw new Error("SCAN_RECOVERABLE:X 页面错误且找不到重试入口，已保存进度");
      }

      // X 的 Retry 可能把虚拟列表带回顶部。恢复后主动跳回已保存进度附近，
      // 避免从第 1 个账号重新滚到几百/几千的位置。
      const recoveryExpected = Number(profileRelation?.minimumExpected || 0);
      const recoveryRatio = recoveryExpected > 0
        ? Math.max(0.01, Math.min(0.995, found.size / recoveryExpected))
        : 0.5;
      const liveKeys = [...found.keys()];
      const recoveryTailKeys = liveKeys.slice(-80);
      const recoveryStrongTailKeys = liveKeys.slice(-12);
      for (let seekRound = 0; seekRound < 8; seekRound += 1) {
        try {
          const seekInjection = await chrome.scripting.executeScript({
            target: { tabId },
            func: fastSeekCheckpointInPage,
            args: [
              recoveryRatio,
              lastHealthyScrollY,
              lastHealthyScrollHeight,
              recoveryTailKeys,
              recoveryStrongTailKeys,
              seekRound
            ]
          });
          const seekState = seekInjection?.[0]?.result;
          if (seekState?.anchorMatched) break;
        } catch {}
        await sleep(450);
      }

      const resumedScan = await getPersonalScan();
      if (resumedScan?.id === scanId && resumedScan.status === "running") {
        resumedScan.recoveryPending = false;
        resumedScan.recoveryMessage = null;
        await setPersonalScan(resumedScan, true);
      }
      continue;
    }
    temporaryErrorRounds = 0;
    lastHealthyScrollY = Number(page.scrollY || lastHealthyScrollY || 0);
    lastHealthyScrollHeight = Number(page.scrollHeight || lastHealthyScrollHeight || 0);
    if (!page.routeValid) throw new Error("SCAN_RECOVERABLE:" + relationLabel + "列表页面暂时发生跳转");

    const before = found.size;
    for (const user of page.users || []) {
      const key = String(user.username || "").toLowerCase();
      if (!key) continue;
      const previous = found.get(key);
      found.set(key, previous ? {
        ...previous, ...user,
        displayName: user.displayName || previous.displayName || "",
        avatar: user.avatar || previous.avatar || "",
        verified: Boolean(previous.verified || user.verified)
      } : user);
    }

    const networkBatch = await pullXRelationNetworkPages(tabId, relation);
    if (networkBatch?.ok && Array.isArray(networkBatch.items) && networkBatch.items.length) {
      mergeNetworkRecords(networkBatch.items);
    }

    stableRounds = found.size === before ? stableRounds + 1 : 0;
    sameHeightRounds = page.scrollHeight === lastHeight ? sameHeightRounds + 1 : 0;
    lastHeight = page.scrollHeight;
    if (round % 2 === 0 || found.size !== before) await persistState(page, true);
    else if (Date.now() - lastPersistAt >= 4000) await persistState(page, false);

    const expectedMinimum = Number(profileRelation?.minimumExpected || 0);
    const tolerance = Number(profileRelation?.tolerance || 0);
    const exactTarget = Boolean(profileRelation?.known && profileRelation?.exact);
    const exactNearReached = exactTarget && found.size >= Math.max(0, expectedMinimum - tolerance);
    const approximateRequired = Math.max(0, expectedMinimum - tolerance);
    const approximateReached = Boolean(profileRelation?.known && !profileRelation?.exact && expectedMinimum > 0 && found.size >= approximateRequired);

    if (page.atBottom && stableRounds >= 12 && exactNearReached) break;
    if (page.atBottom && stableRounds >= 24 && sameHeightRounds >= 16 && approximateReached) break;

    // X can report an exact profile count while its Followers/Following list omits a
    // very small number of unavailable/withheld accounts. If the virtual list is
    // genuinely at the same terminal frontier twice, stop infinite recovery loops.
    // Keep this deliberately narrow: <= 1% of the profile count, capped at 50.
    const exactMissing = exactTarget ? Math.max(0, expectedMinimum - found.size) : 0;
    const exactTerminalGapLimit = exactTarget && expectedMinimum > 0
      ? Math.min(50, Math.floor(expectedMinimum * 0.01))
      : 0;
    if (page.atBottom
        && exactMissing > 0
        && exactMissing <= exactTerminalGapLimit
        && stableRounds >= 18
        && sameHeightRounds >= 12) {
      const mismatchScan = await getPersonalScan();
      if (!mismatchScan || mismatchScan.id !== scanId || mismatchScan.status !== "running") throw new Error("SCAN_CANCELLED");
      const previousMismatchEnd = {
        confirmations: Number(mismatchScan.progress?.[relation + "MismatchEndConfirmations"] || 0),
        count: Number(mismatchScan.progress?.[relation + "MismatchEndCount"] ?? -1),
        tail: String(mismatchScan.progress?.[relation + "MismatchEndTail"] || "")
      };
      const evaluatedMismatchEnd = evaluateUnknownDomEndCheckpoint(
        previousMismatchEnd,
        dedupeUsers([...found.values()]),
        page.atBottom,
        stableRounds,
        sameHeightRounds
      );
      mismatchScan.progress = {
        ...(mismatchScan.progress || {}),
        [relation + "MismatchEndConfirmations"]: evaluatedMismatchEnd.checkpoint.confirmations,
        [relation + "MismatchEndCount"]: evaluatedMismatchEnd.checkpoint.count,
        [relation + "MismatchEndTail"]: evaluatedMismatchEnd.checkpoint.tail,
        [relation + "MismatchEndValidated"]: Boolean(evaluatedMismatchEnd.confirmed)
      };
      mismatchScan.partial = { ...(mismatchScan.partial || {}), [relation]: dedupeUsers([...found.values()]) };
      mismatchScan.resumeSavedAt = new Date().toISOString();
      await setPersonalScan(mismatchScan, true);
      if (evaluatedMismatchEnd.confirmed) {
        domConfirmedEnd = true;
        break;
      }
      throw new Error(
        "SCAN_RECOVERABLE:" + relationLabel + "列表已稳定到底，但比主页少 "
        + exactMissing + " 个；已保存终点，将再次校验一次，不会从 0 开始"
      );
    }

    const knownExpected = Number(profileRelation?.minimumExpected || 0);
    const knownRequired = Math.max(0, knownExpected - Number(profileRelation?.tolerance || 0));
    const stillMissing = knownRequired > 0 ? Math.max(0, knownRequired - found.size) : 0;
    if (page.atBottom
        && stillMissing > 0
        && !profileRelation?.exact
        && stableRounds >= 18
        && sameHeightRounds >= 12) {
      const mismatchScan = await getPersonalScan();
      if (!mismatchScan || mismatchScan.id !== scanId || mismatchScan.status !== "running") throw new Error("SCAN_CANCELLED");
      const previousMismatchEnd = {
        confirmations: Number(mismatchScan.progress?.[relation + "MismatchEndConfirmations"] || 0),
        count: Number(mismatchScan.progress?.[relation + "MismatchEndCount"] ?? -1),
        tail: String(mismatchScan.progress?.[relation + "MismatchEndTail"] || "")
      };
      const evaluatedMismatchEnd = evaluateUnknownDomEndCheckpoint(
        previousMismatchEnd,
        dedupeUsers([...found.values()]),
        page.atBottom,
        stableRounds,
        sameHeightRounds
      );
      mismatchScan.progress = {
        ...(mismatchScan.progress || {}),
        [relation + "MismatchEndConfirmations"]: evaluatedMismatchEnd.checkpoint.confirmations,
        [relation + "MismatchEndCount"]: evaluatedMismatchEnd.checkpoint.count,
        [relation + "MismatchEndTail"]: evaluatedMismatchEnd.checkpoint.tail,
        [relation + "MismatchEndValidated"]: Boolean(evaluatedMismatchEnd.confirmed)
      };
      mismatchScan.partial = { ...(mismatchScan.partial || {}), [relation]: dedupeUsers([...found.values()]) };
      mismatchScan.resumeSavedAt = new Date().toISOString();
      await setPersonalScan(mismatchScan, true);
      if (evaluatedMismatchEnd.confirmed) {
        domConfirmedEnd = true;
        break;
      }
      throw new Error("SCAN_RECOVERABLE:" + relationLabel + "列表已稳定到底但与主页数量相差 " + stillMissing + " 个；已保存进度，将再次校验终点，不会从 0 开始");
    }
    if (!profileRelation?.known && page.atBottom && stableRounds >= 18 && sameHeightRounds >= 12) {
      const endScan = await getPersonalScan();
      if (!endScan || endScan.id !== scanId || endScan.status !== "running") throw new Error("SCAN_CANCELLED");
      const previousEnd = {
        confirmations: Number(endScan.progress?.[relation + "UnknownEndConfirmations"] || 0),
        count: Number(endScan.progress?.[relation + "UnknownEndCount"] ?? -1),
        tail: String(endScan.progress?.[relation + "UnknownEndTail"] || "")
      };
      const evaluatedEnd = evaluateUnknownDomEndCheckpoint(
        previousEnd,
        dedupeUsers([...found.values()]),
        page.atBottom,
        stableRounds,
        sameHeightRounds
      );
      endScan.progress = {
        ...(endScan.progress || {}),
        [relation + "UnknownEndConfirmations"]: evaluatedEnd.checkpoint.confirmations,
        [relation + "UnknownEndCount"]: evaluatedEnd.checkpoint.count,
        [relation + "UnknownEndTail"]: evaluatedEnd.checkpoint.tail,
        [relation + "UnknownEndValidated"]: Boolean(evaluatedEnd.confirmed)
      };
      endScan.partial = { ...(endScan.partial || {}), [relation]: dedupeUsers([...found.values()]) };
      endScan.resumeSavedAt = new Date().toISOString();
      await setPersonalScan(endScan, true);
      if (evaluatedEnd.confirmed) {
        domConfirmedEnd = true;
        break;
      }
      throw new Error("SCAN_RECOVERABLE:暂时无法确认" + relationLabel + "总数，已保存当前进度；将进行第二次终点校验，不会从 0 开始");
    }
    if (!page.atBottom && stableRounds >= 18 && sameHeightRounds >= 12) throw new Error("SCAN_RECOVERABLE:" + relationLabel + "列表暂时没有继续加载");
    if (round === maxRounds - 1) throw new Error("SCAN_RECOVERABLE:" + relationLabel + "列表本轮未能完整加载");

    if (found.size >= nextHumanPauseAt) {
      humanPauseCount += 1;
      const pauseMs = randomInt(10000, 18000);
      const resting = await getPersonalScan();
      if (resting?.id === scanId && resting.status === "running") {
        resting.partial = { ...(resting.partial || {}), [relation]: dedupeUsers([...found.values()]) };
        resting.progress = {
          ...(resting.progress || {}),
          [relation]: found.size,
          [relation + "ScrollY"]: Number(page.scrollY || 0),
          [relation + "ScrollHeight"]: Number(page.scrollHeight || 0),
          [relation + "Cursor"]: latestCursor || resting.progress?.[relation + "Cursor"] || "",
          [relation + "CursorCount"]: cursorFoundCount || resting.progress?.[relation + "CursorCount"] || 0,
          [relation + "CursorObservedAt"]: cursorObservedAt || resting.progress?.[relation + "CursorObservedAt"] || null,
          humanPauseCount,
          resting: true,
          restingRelation: relation
        };
        resting.resumeSavedAt = new Date().toISOString();
        await setPersonalScan(resting);
        lastPersistedSize = found.size;
        lastPersistAt = Date.now();
      }
      await sleep(pauseMs);
      nextHumanPauseAt = found.size + randomInt(100, 150);
      const resumed = await getPersonalScan();
      if (resumed?.id === scanId && resumed.status === "running") {
        resumed.progress = { ...(resumed.progress || {}), [relation]: found.size, humanPauseCount, resting: false, restingRelation: null };
        await setPersonalScan(resumed);
      }
    }

    const recentlyLimited = recentlyRateLimited(current.lastRateLimitAt);
    const [minScrollWait, maxScrollWait] = domPacingWindow(page.atBottom, recentlyLimited);
    await humanSleep(minScrollWait, maxScrollWait);
  }

  const finalUsers = dedupeUsers([...found.values()]);
  const finalScan = await getPersonalScan();
  if (finalScan?.id === scanId && finalScan.status === "running") {
    finalScan.partial = { ...(finalScan.partial || {}), [relation]: finalUsers };
    finalScan.relationCompleted = { ...(finalScan.relationCompleted || {}), [relation]: false };
    finalScan.progress = {
      ...(finalScan.progress || {}),
      [relation]: finalUsers.length,
      [relation + "Cursor"]: latestCursor || finalScan.progress?.[relation + "Cursor"] || "",
      [relation + "CursorCount"]: cursorFoundCount || finalScan.progress?.[relation + "CursorCount"] || 0,
      [relation + "CursorObservedAt"]: cursorObservedAt || finalScan.progress?.[relation + "CursorObservedAt"] || null,
      [relation + "CursorResumeActive"]: false,
      resting: false,
      restingRelation: null
    };
    finalScan.resumeSavedAt = new Date().toISOString();
    await setPersonalScan(finalScan);
  }

  if (profileRelation?.known) {
    if (finalUsers.length === 0 && profileRelation.isZero) {
      // Valid empty relationship list.
    } else if (finalUsers.length === 0 && !profileRelation.isZero) {
      throw new Error("SCAN_RECOVERABLE:X 主页显示你有" + relationLabel + "账号，但本轮暂时没有读取到数据");
    }

    const required = requiredRelationCount(profileRelation);
    const mismatchValidated = Boolean(
      finalScan?.progress?.[relation + "MismatchEndValidated"] || domConfirmedEnd
    );
    if (required > 0 && finalUsers.length < required && !mismatchValidated) {
      throw new Error(
        "SCAN_RECOVERABLE:" + relationLabel + "实际只读取到 " + finalUsers.length
        + " 个，但主页显示至少应有 " + required + " 个；不会生成不完整名单，将继续扫描"
      );
    }
  } else if (!cursorReachedEnd && !domConfirmedEnd) {
    throw new Error("SCAN_RECOVERABLE:暂时没有读取到" + relationLabel + "总数，将从已保存位置继续");
  }

  const completedScan = await getPersonalScan();
  if (completedScan?.id === scanId && completedScan.status === "running") {
    completedScan.relationCompleted = { ...(completedScan.relationCompleted || {}), [relation]: true };
    completedScan.progress = {
      ...(completedScan.progress || {}),
      [relation]: finalUsers.length,
      [relation + "CursorEnded"]: Boolean(cursorReachedEnd),
      resting: false,
      restingRelation: null
    };
    completedScan.partial = { ...(completedScan.partial || {}), [relation]: finalUsers };
    completedScan.resumeSavedAt = new Date().toISOString();
    await setPersonalScan(completedScan, true);
  }
  return finalUsers;
}

const PERSONAL_SCAN_WORKER_NAME_PREFIX = "__QG_PERSONAL_SCAN_WORKER__:";

function isSafePersonalScanWorkerUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname === "x.com";
  } catch {
    return false;
  }
}

async function markPersonalScanWorker(tabId, scanId) {
  if (!Number.isInteger(Number(tabId)) || !scanId) return false;
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: Number(tabId) },
      func: (marker) => {
        window.name = marker;
        return window.name;
      },
      args: [PERSONAL_SCAN_WORKER_NAME_PREFIX + scanId]
    });
    if (result?.[0]?.result !== PERSONAL_SCAN_WORKER_NAME_PREFIX + scanId) {
      console.warn("[QG scan] window marker not confirmed", tabId, result?.[0]?.result);
    }
    return result?.[0]?.result === PERSONAL_SCAN_WORKER_NAME_PREFIX + scanId;
  } catch (error) {
    console.warn("[QG scan] cannot mark dedicated window", tabId, error?.message || String(error));
    return false;
  }
}

async function getVerifiedPersonalScanWorker(scanOrIds = {}) {
  const requestedWindowId = Number(scanOrIds.workerWindowId || scanOrIds.windowId || 0);
  const requestedTabId = Number(scanOrIds.workerTabId || scanOrIds.tabId || 0);
  const scanId = String(scanOrIds.id || scanOrIds.scanId || "");
  if (!Number.isInteger(requestedTabId) || requestedTabId <= 0 || !scanId) return null;

  const tab = await chrome.tabs.get(requestedTabId).catch(() => null);
  if (!tab?.id || !isSafePersonalScanWorkerUrl(tab.url)) return null;

  const windowId = Number.isInteger(requestedWindowId) && requestedWindowId > 0
    ? requestedWindowId
    : Number(tab.windowId || 0);
  if (!Number.isInteger(windowId) || windowId <= 0 || Number(tab.windowId) !== windowId) return null;

  const win = await chrome.windows.get(windowId).catch(() => null);
  if (!win?.id || win.type !== "popup") return null;

  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: requestedTabId },
      func: () => window.name
    });
    const marker = result?.[0]?.result || "";
    if (marker !== PERSONAL_SCAN_WORKER_NAME_PREFIX + scanId) return null;
  } catch {
    return null;
  }

  return { window: win, tab };
}

async function closePersonalScanWorker(scanOrIds = {}) {
  const worker = await getVerifiedPersonalScanWorker(scanOrIds);
  if (!worker) return false;
  await chrome.windows.remove(worker.window.id).catch(() => {});
  return true;
}

/**
 * Force a new scan window WITHOUT restarting the relationship scan.
 * The new scan id protects all asynchronous callbacks from the old window.
 * Saved user objects + cursors + completed phase are copied, not reset.
 */
async function forceRestartPersonalScanWindow(automatic = false) {
  const old = await getPersonalScan();
  if (!old?.id || !["running", "paused"].includes(old.status)) {
    throw new Error("当前没有正在进行或暂停的检测任务");
  }
  if (Number(old.lastForceRestartAt || 0) > Date.now() - 10000) {
    throw new Error("刚刚已安排重开扫描窗口，请不要连续点击");
  }
  const job = await getJob();
  if (activeRun || job?.status === "running") {
    throw new Error("当前有批量处理任务，不能同时重开扫描");
  }
  const sourceId = old.id;
  const savedFollowing = await getPersonalScanCheckpoint(sourceId, "following");
  const savedFollowers = await getPersonalScanCheckpoint(sourceId, "followers");
  const partial = {
    following: mergeUsersPreferLatest(
      Array.isArray(old.partial?.following) ? old.partial.following : [], savedFollowing),
    followers: mergeUsersPreferLatest(
      Array.isArray(old.partial?.followers) ? old.partial.followers : [], savedFollowers)
  };
  const progress = {
    ...(old.progress || {}),
    following: Math.max(Number(old.progress?.following || 0), partial.following.length),
    followers: Math.max(Number(old.progress?.followers || 0), partial.followers.length),
    followingResumeActive: false, followingCursorResumeActive: false,
    followersResumeActive: false, followersCursorResumeActive: false,
    resting: false, restingRelation: null
  };
  // A counter without its actual account identities is NOT a valid resume
  // checkpoint; do not tell a user that those identities can be restored.
  for (const relation of ["following", "followers"]) {
    if (Number(old.progress?.[relation] || 0) > partial[relation].length) {
      throw new Error("已保存的"+(relation === "followers"?"粉丝":"关注")+
        "数量大于实际断点记录。为了避免丢失数据，暂不重开；请保留当前数据。");
    }
  }
  const rateLimitUntil = getExistingRateLimitUntil(old);
  const cooling = rateLimitUntil > Date.now();
  // First freeze the original scan (the browser storage is our recovery
  // source), then close only its verified, extension-owned X popup.
  old.status = "paused";
  old.pausedAt = new Date().toISOString();
  old.pauseReason = "正在安全地重开扫描窗口";
  old.recoveryPending = false;
  old.recoveryMessage = null;
  old.partial = partial;
  old.progress = progress;
  await setPersonalScan(old, true);
  await closePersonalScanWorker(old);
  const followersStarted = progress.followers > 0 || partial.followers.length > 0;
  const followingDone = Boolean(old.relationCompleted?.following) || followersStarted;
  const restartAt = Date.now();
  const replacement = {
    ...old,
    id: crypto.randomUUID(),
    status: "running",
    initialized: true,
    phase: followingDone ? "followers" : (old.username ? "following" : "account"),
    relationCompleted: {
      following: followingDone,
      followers: Boolean(old.relationCompleted?.followers)
    },
    progress,
    partial,
    followingCount: Math.max(Number(old.followingCount || 0), partial.following.length),
    followersCount: Math.max(Number(old.followersCount || 0), partial.followers.length),
    workerTabId: null,
    workerWindowId: null,
    recoveryPending: true,
    // The user explicitly restarted the session. It may retry only after any
    // remaining cooldown, with a fresh finite retry budget.
    consecutiveRecoveryCount: 0,
    recoveryMessage: cooling
      ? "已保留扫描进度。X 仍在限流，冷却结束后会自动打开新窗口继续。"
      : "已保留扫描进度，正在重新打开 X 扫描窗口。",
    rateLimitUntil: cooling ? rateLimitUntil : null,
    nextRecoveryAt: cooling ? rateLimitUntil : null,
    lastForceRestartAt: restartAt,
    forceFocusWorkerOnce: !automatic,
    lastAutomaticWindowRestartAt: automatic ? restartAt : (old.lastAutomaticWindowRestartAt || null),
    pauseReason: null,
    resumedFromScanId: sourceId,
    resumeSavedAt: new Date().toISOString()
  };
  retiredPersonalScanIds.add(sourceId);
  try {
    const saved = await setPersonalScan(replacement, true);
    if (saved?.id !== replacement.id) throw new Error("重开时无法保存新的检测状态");
  } catch (error) {
    retiredPersonalScanIds.delete(sourceId);
    // The old snapshot was already safely saved as paused. Do not delete
    // its checkpoints if the replacement cannot be written.
    throw new Error("重开窗口未成功，原来的检测进度还在：" + (error?.message || String(error)));
  }
  // New checkpoint arrays are now committed under the replacement id.
  await clearPersonalScanCheckpoints(sourceId).catch(() => {});
  await ensurePersonalScanAlarm();
  if (cooling) await schedulePersonalScanCooldownWake(rateLimitUntil);
  else void runPersonalScan(replacement.id);
  return { scan: toPublicPersonalScan(replacement), scheduled: cooling };
}

async function pausePersonalScanKeepingProgress(reason = "已暂停扫描") {
  const scan = await getPersonalScan();
  if (!scan || scan.status !== "running") return scan;
  scan.status = "paused";
  scan.pausedAt = new Date().toISOString();
  scan.pauseReason = reason;
  scan.recoveryPending = false;
  scan.recoveryMessage = null;
  scan.nextRecoveryAt = null;
  await setPersonalScan(scan);
  await clearPersonalScanAlarm();
  await closePersonalScanWorker(scan);
  scan.workerWindowId = null;
  scan.workerTabId = null;
  await setPersonalScan(scan);
  return scan;
}

async function createPersonalScanWorkerWindow(url, scanId, focusNewWindow = false) {
  const created = await chrome.windows.create({
    url,
    type: "popup",
    focused: Boolean(focusNewWindow),
    width: 520,
    height: 760
  });
  let tabId = created?.tabs?.[0]?.id || null;
  if (created?.id && !tabId) {
    const tabs = await chrome.tabs.query({ windowId: created.id, active: true }).catch(() => []);
    tabId = tabs?.[0]?.id || null;
  }
  if (!created?.id || !tabId) throw new Error("SCAN_RECOVERABLE:无法创建专用扫描窗口");
  await chrome.tabs.update(tabId, { active: true, autoDiscardable: false }).catch(() => {});
  try {
    await waitForTabComplete(tabId);
  } catch (error) {
    await chrome.windows.remove(created.id).catch(() => {});
    throw new Error("SCAN_RECOVERABLE:专用扫描窗口加载超时：" + (error?.message || String(error)));
  }
  const marked = await markPersonalScanWorker(tabId, scanId);
  if (!marked) {
    await chrome.windows.remove(created.id).catch(() => {});
    throw new Error("SCAN_RECOVERABLE:无法确认专用扫描窗口身份");
  }
  return { windowId: created.id, tabId };
}

function inferStoredProfileTolerance(raw, exact, count) {
  if (!Number.isFinite(count)) return 0;
  if (exact) return 0;
  const value = String(raw || "");
  const match = value.match(/([\d][\d,.]*)\s*([KMB万億亿])/i);
  if (!match) return 0;
  const unit = String(match[2] || "").toUpperCase();
  const normalizedToken = String(match[1] || "").replace(",", ".");
  const decimals = normalizedToken.includes(".") ? normalizedToken.split(".")[1].length : 0;
  const multipliers = { K: 1000, M: 1000000, B: 1000000000, "万": 10000, "億": 100000000, "亿": 100000000 };
  const multiplier = multipliers[unit] || 1;
  return Math.ceil(0.5 * multiplier * (10 ** -decimals));
}

function relationMetaFromStoredScan(scan, relation) {
  const prefix = relation === "followers" ? "Followers" : "Following";
  const count = scan?.["profile" + prefix + "Count"];
  if (!Number.isFinite(count)) return { known: false, raw: "" };
  const exact = Boolean(scan?.["profile" + prefix + "Exact"]);
  const raw = scan?.["profile" + prefix + "Raw"] || String(count);
  const storedTolerance = Number(scan?.["profile" + prefix + "Tolerance"]);
  const tolerance = Number.isFinite(storedTolerance) && storedTolerance > 0
    ? storedTolerance
    : inferStoredProfileTolerance(raw, exact, count);
  return {
    known: true,
    count,
    exact,
    minimumExpected: count,
    tolerance,
    isZero: count === 0,
    raw
  };
}

async function runPersonalScan(scanId) {
  if (activePersonalScan && !retiredPersonalScanIds.has(activePersonalScanId)) return;
  activePersonalScan = true;
  activePersonalScanId = scanId;
  let tabId = null;
  let workerWindowId = null;
  let workerRecreated = false;
  let closeTabOnExit = false;
  let quickRetryDelayMs = null;

  try {
    let scan = await getPersonalScan();
    if (!scan || scan.id !== scanId || scan.status !== "running") return;
    if (Number(scan.nextRecoveryAt || 0) > Date.now()) {
      await ensurePersonalScanAlarm();
      return;
    }
    await ensurePersonalScanAlarm();

    const conflictingJob = await getJob();
    if (conflictingJob?.status === "running") {
      await closePersonalScanWorker(scan);
      scan.workerTabId = null;
      scan.workerWindowId = null;
      scan.status = "cancelled";
      scan.phase = "cancelled";
      scan.error = "浏览器恢复时发现已有处理任务正在执行，本次检测未恢复";
      scan.partial = null;
      scan.relationCompleted = null;
      await setPersonalScan(scan);
      await clearPersonalScanCheckpoints(scan.id);
      await clearPersonalScanAlarm();
      return;
    }

    if (!scan.initialized) {
      const hasSavedProgress = Number(scan.progress?.following || 0) > 0
        || Number(scan.progress?.followers || 0) > 0
        || (Array.isArray(scan.partial?.following) && scan.partial.following.length > 0)
        || (Array.isArray(scan.partial?.followers) && scan.partial.followers.length > 0);

      scan.initialized = true;
      if (!hasSavedProgress) {
        scan.followingCount = 0;
        scan.followersCount = 0;
        scan.nonFollowers = [];
        scan.mutualCount = 0;
        scan.progress = { following: 0, followers: 0 };
        scan.partial = { following: [], followers: [] };
        scan.relationCompleted = { following: false, followers: false };
      } else {
        // Upgrade/recovery safety: an old or partially migrated scan must never be reinitialized to zero.
        scan.progress = { following: 0, followers: 0, ...(scan.progress || {}) };
        scan.partial = { following: [], followers: [], ...(scan.partial || {}) };
        scan.relationCompleted = { following: false, followers: false, ...(scan.relationCompleted || {}) };
      }
      scan.error = null;
      scan.resumeSavedAt = new Date().toISOString();
      await setPersonalScan(scan);
    }

    if (scan.workerTabId) {
      const verifiedWorker = await getVerifiedPersonalScanWorker(scan);
      if (verifiedWorker) {
        tabId = verifiedWorker.tab.id;
        workerWindowId = verifiedWorker.window.id;
        await chrome.tabs.update(tabId, { active: true, autoDiscardable: false }).catch(() => {});
        await chrome.windows.update(workerWindowId, { state: "normal", focused: false }).catch(() => {});
      } else {
        // Persisted numeric tab/window IDs are not identities and can be reused by Chrome
        // after restart. Never navigate or close an unverified window.
        scan.workerTabId = null;
        scan.workerWindowId = null;
        await setPersonalScan(scan);
      }
    }

    if (!tabId) {
      const resumeRelation = scan.phase === "followers" ? "followers" : scan.phase === "following" ? "following" : null;
      const resumeUrl = scan.username && resumeRelation
        ? "https://x.com/" + scan.username + "/" + resumeRelation
        : "https://x.com/home";
      const worker = await createPersonalScanWorkerWindow(
        resumeUrl, scanId, Boolean(scan.forceFocusWorkerOnce)
      );
      tabId = worker.tabId;
      workerWindowId = worker.windowId;
      workerRecreated = true;
      scan.workerTabId = worker.tabId;
      scan.workerWindowId = worker.windowId;
      scan.resumeTabRecreatedAt = new Date().toISOString();
      scan.forceFocusWorkerOnce = false;
      await setPersonalScan(scan);
      await waitForTabComplete(tabId);
      await humanSleep(800, 1400);
    } else {
      scan.workerTabId = tabId;
      await setPersonalScan(scan);
    }

    scan = await getPersonalScan();
    if (!scan || scan.id !== scanId || scan.status !== "running") throw new Error("SCAN_CANCELLED");

    if (!scan.username) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab?.url?.startsWith("https://x.com/")) {
        await chrome.tabs.update(tabId, { url: "https://x.com/home", active: true });
        await waitForTabComplete(tabId);
        await humanSleep(800, 1300);
      }
      const accountInjection = await chrome.scripting.executeScript({
        target: { tabId },
        func: detectCurrentAccountInPage
      });
      const account = accountInjection[0]?.result;
      if (!account?.ok) throw new Error(account?.error || "无法识别当前登录账号");
      scan = await getPersonalScan();
      if (!scan || scan.id !== scanId || scan.status !== "running") throw new Error("SCAN_CANCELLED");
      scan.username = account.username;
      await setPersonalScan(scan);
    }

    let profileFollowing = relationMetaFromStoredScan(scan, "following");
    let profileFollowers = relationMetaFromStoredScan(scan, "followers");

    if (!profileFollowing.known || !profileFollowers.known) {
      await chrome.tabs.update(tabId, { url: "https://x.com/" + scan.username, active: true });
      await waitForTabComplete(tabId);
      await humanSleep(800, 1400);

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const followingInjection = await chrome.scripting.executeScript({
          target: { tabId }, func: inspectProfileRelationInPage, args: [scan.username, "following"]
        });
        const followersInjection = await chrome.scripting.executeScript({
          target: { tabId }, func: inspectProfileRelationInPage, args: [scan.username, "followers"]
        });
        profileFollowing = followingInjection[0]?.result || { known: false, raw: "" };
        profileFollowers = followersInjection[0]?.result || { known: false, raw: "" };
        if (profileFollowing.known && profileFollowers.known) break;
        await sleep(500);
      }

      scan = await getPersonalScan();
      if (!scan || scan.id !== scanId || scan.status !== "running") throw new Error("SCAN_CANCELLED");
      scan.profileFollowingRaw = profileFollowing.raw || "";
      scan.profileFollowingCount = Number.isFinite(profileFollowing.count) ? profileFollowing.count : null;
      scan.profileFollowingExact = Boolean(profileFollowing.exact);
      scan.profileFollowingTolerance = Number(profileFollowing.tolerance || 0);
      scan.profileFollowersRaw = profileFollowers.raw || "";
      scan.profileFollowersCount = Number.isFinite(profileFollowers.count) ? profileFollowers.count : null;
      scan.profileFollowersExact = Boolean(profileFollowers.exact);
      scan.profileFollowersTolerance = Number(profileFollowers.tolerance || 0);
      scan.resumeSavedAt = new Date().toISOString();
      await setPersonalScan(scan);
    }

    scan = await getPersonalScan();
    if (!scan || scan.id !== scanId || scan.status !== "running") throw new Error("SCAN_CANCELLED");

    let following;
    if (scan.relationCompleted?.following && Array.isArray(scan.partial?.following)) {
      following = dedupeUsers(scan.partial.following);
    } else {
      scan.phase = "following";
      await setPersonalScan(scan);
      const resumeFollowing = Boolean(
        workerRecreated
        && (
          Number(scan.progress?.following || 0) > 0
          || (Array.isArray(scan.partial?.following) && scan.partial.following.length > 0)
        )
      );
      following = await scanRelationPage(tabId, scan.username, scanId, "following", profileFollowing, resumeFollowing);
    }

    scan = await getPersonalScan();
    if (!scan || scan.id !== scanId || scan.status !== "running") throw new Error("SCAN_CANCELLED");
    scan.followingCount = following.length;
    scan.phase = "followers";
    scan.progress = { ...(scan.progress || {}), following: following.length, followers: Number(scan.progress?.followers || 0) };
    await setPersonalScan(scan);

    let followers;
    if (scan.relationCompleted?.followers && Array.isArray(scan.partial?.followers)) {
      followers = dedupeUsers(scan.partial.followers);
    } else {
      const resumeFollowers = Boolean(
        workerRecreated
        && (
          Number(scan.progress?.followers || 0) > 0
          || (Array.isArray(scan.partial?.followers) && scan.partial.followers.length > 0)
        )
      );
      followers = await scanRelationPage(tabId, scan.username, scanId, "followers", profileFollowers, resumeFollowers);
    }

    scan = await getPersonalScan();
    if (!scan || scan.id !== scanId || scan.status !== "running") throw new Error("SCAN_CANCELLED");

    await verifyPersonalScanOwnerInTab(tabId, scan.username);

    following = dedupeUsers(Array.isArray(scan.partial?.following) ? scan.partial.following : following);
    followers = dedupeUsers(Array.isArray(scan.partial?.followers) ? scan.partial.followers : followers);
    const followerKeys = new Set(followers.map((user) => String(user.username || "").toLowerCase()).filter(Boolean));
    const nonFollowers = following.filter((user) => !followerKeys.has(String(user.username || "").toLowerCase()));

    scan.followingCount = following.length;
    scan.followersCount = followers.length;
    scan.nonFollowers = nonFollowers;
    scan.mutualCount = following.length - nonFollowers.length;
    const completedProgress = scan.progress || {};
    scan.progress = {
      following: following.length,
      followers: followers.length,
      followingUnknownEndValidated: Boolean(completedProgress.followingUnknownEndValidated),
      followersUnknownEndValidated: Boolean(completedProgress.followersUnknownEndValidated),
      followingMismatchEndValidated: Boolean(completedProgress.followingMismatchEndValidated),
      followersMismatchEndValidated: Boolean(completedProgress.followersMismatchEndValidated)
    };
    scan.phase = "completed";
    scan.status = "completed";
    scan.completedAt = new Date().toISOString();
    scan.workerTabId = null;
    scan.workerWindowId = null;
    scan.partial = null;
    scan.relationCompleted = null;
    scan.recoveryPending = false;
    scan.recoveryMessage = null;
    scan.nextRecoveryAt = null;
    scan.rateLimitUntil = null;
    const committed = await setPersonalScan(scan);
    // Pauses can race with the final scan comparison. Only completed scans
    // are allowed to remove the stored checkpoints.
    if (committed?.status === "completed") {
      await clearPersonalScanCheckpoints(scan.id);
      await clearPersonalScanAlarm();
    }
    closeTabOnExit = true;
  } catch (error) {
    const scan = await getPersonalScan();
    if (scan?.id === scanId) {
      if (scan.status === "paused") {
        closeTabOnExit = true;
      } else if (scan.status === "cancelled" || error?.message === "SCAN_CANCELLED") {
        scan.status = "cancelled";
        scan.phase = "cancelled";
        scan.recoveryPending = false;
        scan.recoveryMessage = null;
        scan.workerTabId = null;
        scan.workerWindowId = null;
        scan.partial = null;
        scan.relationCompleted = null;
        await setPersonalScan(scan);
        await clearPersonalScanCheckpoints(scan.id);
        await clearPersonalScanAlarm();
        closeTabOnExit = true;
      } else if (isRecoverableScanError(error)) {
        const tab = tabId ? await chrome.tabs.get(tabId).catch(() => null) : null;
        const recoveryCount = Number(scan.consecutiveRecoveryCount || 0) + 1;
        const recoveryReason = getScanErrorMessage(error) || "X 页面暂时没有返回可读取的数据";
        const recoveryRelation = scan.phase === "followers" ? "followers" : "following";
        const recoverySavedCount = Math.max(
          Number(scan.progress?.[recoveryRelation] || 0),
          Array.isArray(scan.partial?.[recoveryRelation]) ? scan.partial[recoveryRelation].length : 0
        );
        scan.status = "running";
        scan.recoveryPending = true;
        scan.recoveryMessage = "中断原因：" + recoveryReason + "。已保存 " + recoverySavedCount + " 个账号，正在自动继续，不需要重新检测。";
        scan.lastRecoverableError = recoveryReason;
        scan.lastRecoveryAt = new Date().toISOString();
        scan.consecutiveRecoveryCount = recoveryCount;
        scan.recoveryHistory = [
          ...(Array.isArray(scan.recoveryHistory) ? scan.recoveryHistory : []),
          { at: scan.lastRecoveryAt, reason: recoveryReason }
        ].slice(-5);
        const workerMissing = !tab;
        if (workerMissing) {
          // Only create a new worker when the old tab truly no longer exists.
          // A high recovery count alone must never close/recreate a healthy scan window.
          await closePersonalScanWorker({
            id: scanId,
            workerWindowId: workerWindowId || scan.workerWindowId,
            workerTabId: tabId || scan.workerTabId
          });
          tabId = null;
          workerWindowId = null;
          scan.workerTabId = null;
          scan.workerWindowId = null;
        } else {
          scan.workerTabId = tabId;
          scan.workerWindowId = workerWindowId || scan.workerWindowId || tab.windowId || null;
        }
        const recoveryText = String(scan.lastRecoverableError || "");
        if (isPersonalScanRateLimited(recoveryText)) {
          scan.lastRateLimitAt = Date.now();
          const delayMs = getPersonalScanRecoveryDelayMs(recoveryText, recoveryCount);
          scan.rateLimitUntil = Date.now() + delayMs;
          scan.nextRecoveryAt = scan.rateLimitUntil;
          await schedulePersonalScanCooldownWake(scan.rateLimitUntil);
          scan.workerWindowId = null;
          scan.workerTabId = null;
          // Close the scanning window while rate-limited, so it cannot keep
          // issuing its own X requests during the cooldown.
          closeTabOnExit = true;
          quickRetryDelayMs = null;
          if (recoveryCount >= 3) {
            scan.status = "paused";
            scan.pausedAt = new Date().toISOString();
            scan.pauseReason = "X 返回 HTTP_429，连续三次冷却后仍然限制请求。已暂停自动重试，保存的关注和粉丝断点不会丢失。";
            scan.recoveryPending = false;
            scan.recoveryMessage = null;
            await setPersonalScan(scan);
            await clearPersonalScanAlarm();
          } else {
            scan.status = "running";
            scan.recoveryPending = true;
            scan.recoveryMessage = "X 返回 HTTP_429，请求暂时受限。扫描已进入长间隔冷却，最早到达恢复时间后才会有限次重试；已保存的账号和断点均保留。";
            await setPersonalScan(scan);
            await ensurePersonalScanAlarm();
          }
        } else if (shouldPauseForRepeatedXError(recoveryText, recoveryCount)
            || /HTTP_(?:401|403)/.test(recoveryText)) {
          scan.status = "paused";
          scan.pausedAt = new Date().toISOString();
          scan.pauseReason = "X 关注/粉丝接口持续失败（" + recoveryText + "）。自动恢复已经停止，需在 X 页面恢复后手动继续。";
          scan.recoveryPending = false;
          scan.recoveryMessage = null;
          scan.nextRecoveryAt = null;
          quickRetryDelayMs = null;
          await setPersonalScan(scan);
          await clearPersonalScanAlarm();
          closeTabOnExit = true;
        } else {
          quickRetryDelayMs = getPersonalScanRecoveryDelayMs(recoveryText, recoveryCount);
          scan.nextRecoveryAt = Date.now() + quickRetryDelayMs;
          await setPersonalScan(scan);
          await ensurePersonalScanAlarm();
          closeTabOnExit = false;
        }
      } else {
        scan.status = "failed";
        scan.phase = "failed";
        scan.error = error?.message || String(error);
        scan.recoveryPending = false;
        scan.recoveryMessage = null;
        scan.workerTabId = null;
        scan.workerWindowId = null;
        await setPersonalScan(scan);
        await clearPersonalScanAlarm();
        closeTabOnExit = true;
      }
    }
  } finally {
    if (closeTabOnExit) {
      await closePersonalScanWorker({
        id: scanId,
        workerWindowId,
        workerTabId: tabId
      });
    }
    if (activePersonalScanId === scanId) {
      activePersonalScan = false;
      activePersonalScanId = null;
    }
    if (Number.isFinite(quickRetryDelayMs)) {
      setTimeout(() => {
        void runPersonalScan(scanId);
      }, quickRetryDelayMs);
    }
  }
}

async function waitForTabComplete(tabId, timeoutMs = 35_000) {
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return;

  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error);
      else resolve();
    };
    const listener = (updatedId, changeInfo) => {
      if (updatedId === tabId && changeInfo.status === "complete") finish();
    };
    const timeout = setTimeout(() => finish(new Error("页面加载超时")), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);

    // Close the race between the initial tabs.get() and listener registration.
    // If the page completed in that small window, no onUpdated event may remain to observe.
    chrome.tabs.get(tabId)
      .then((tab) => {
        if (tab?.status === "complete") finish();
      })
      .catch((error) => finish(error));
  });
}

async function performProfileActionInPage(target, mode = "community", sourceUsername = null, action = "block", consentPreviouslyClicked = false) {
  const sleepInPage = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const humanPauseInPage = (min, max) => sleepInPage(Math.floor(min + Math.random() * (max - min + 1)));
  const visible = (element) => Boolean(element && element.getClientRects().length);
  const waitFor = async (getter, timeoutMs = 15000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = getter();
      if (value) return value;
      await sleepInPage(250);
    }
    return null;
  };

  const pageText = () => document.body?.innerText || "";
  const unavailablePattern = /This account doesn.?t exist|Account suspended|账号不存在|帳戶不存在|账号已被冻结|アカウントは存在しません/i;
  // X may split this heading across lines/elements. Treat whitespace as a separator.
  const restrictedPattern = /This\s+account\s+is\s+temporarily\s+restricted|此账户已被暂时限制使用|此帐户已被暂时限制使用|此账号已被暂时限制使用|此帳戶已被暫時限制使用/i;
  const restrictedGateVisible = () => restrictedPattern.test(pageText().replace(/\s+/g, " "));
  const loginPattern = /Log in to X|Sign in to X|登录 X|登入 X/i;
  const blockPattern = /^(Block\b|拉黑|封鎖|ブロック|차단|Bloquear\b|Bloquer\b|Blockieren\b|Заблокировать)/i;
  const unblockPattern = /^(Unblock\b|取消拉黑|解除封鎖|ブロック解除|차단 해제|Desbloquear\b|Débloquer\b|Entsperren\b|Разблокировать)/i;
  const reportPattern = /report|举报|檢舉|報告|신고|denunciar|signaler|melden|пожаловаться/i;

  await waitFor(() => document.body, 10000);
  if (/\/i\/flow\/login/.test(location.pathname) || loginPattern.test(pageText())) {
    return { status: "failed", reason: "当前浏览器中尚未登录 X" };
  }

  if (mode === "personal" && sourceUsername) {
    const expectedOwner = String(sourceUsername).toLowerCase();
    const readOwnerIdentity = () => {
      const candidates = [];
      const addCandidate = (value) => {
        const username = String(value || "").replace(/^@/, "").trim();
        if (/^[A-Za-z0-9_]{1,15}$/.test(username)) candidates.push(username.toLowerCase());
      };

      const profileLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
      addCandidate((profileLink?.getAttribute("href") || "").split("/").filter(Boolean)[0] || "");

      const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
      const textMatch = (switcher?.innerText || "").match(/@([A-Za-z0-9_]{1,15})/);
      addCandidate(textMatch?.[1] || "");
      const avatar = switcher?.querySelector?.('[data-testid^="UserAvatar-Container-"]');
      const testId = avatar?.getAttribute?.("data-testid") || "";
      if (testId.startsWith("UserAvatar-Container-")) addCandidate(testId.slice("UserAvatar-Container-".length));

      const unique = [...new Set(candidates)];
      return {
        owner: unique.length === 1 ? unique[0] : "",
        conflict: unique.length > 1,
        candidateCount: unique.length
      };
    };

    let ownerIdentity = null;
    const identityStarted = Date.now();
    while (Date.now() - identityStarted < 5000) {
      ownerIdentity = readOwnerIdentity();
      if (ownerIdentity.owner && !ownerIdentity.conflict) break;
      await sleepInPage(250);
    }

    if (!ownerIdentity?.owner || ownerIdentity.conflict) {
      return { status: "failed", failureKind: "owner_unconfirmed", reason: "X 当前账号状态尚未稳定，无法确认操作账号；为避免用错账号，请稍后重新检测" };
    }
    if (ownerIdentity.owner !== expectedOwner) {
      return { status: "failed", failureKind: "owner_mismatch", reason: "当前登录 X 账号与生成这份私人名单的账号不一致，请切回 @" + sourceUsername + " 后重新检测" };
    }
  }

  if (unavailablePattern.test(pageText())) {
    return { status: "failed", failureKind: "unavailable", reason: "该账号被 X 停用、已注销或无法访问" };
  }

  if (target?.username) {
    const currentUsername = decodeURIComponent(location.pathname).split("/").filter(Boolean)[0] || "";
    if (!/^[A-Za-z0-9_]{1,15}$/.test(currentUsername) || currentUsername.toLowerCase() !== String(target.username).toLowerCase()) {
      return {
        status: "failed",
        failureKind: "target_mismatch",
        reason: "目标主页发生跳转，预期 @" + target.username + "，实际 @" + (currentUsername || "未知") + "；为避免误操作已停止"
      };
    }
  }

  if (mode === "personal" && action === "unfollow") {
    // X can display a loading skeleton first. Wait briefly for either its
    // restricted gate or an actual profile control before deciding what to do.
    await waitFor(() => {
      if (restrictedGateVisible()) return true;
      // A target /creator-subscriptions/subscribe route is a complete UI
      // already: let the worker close it without waiting for Following.
      if (/\/creator-subscriptions\/subscribe(?:\/|$)/i.test(location.pathname)) return true;
      if (document.querySelector('[data-testid$="-unfollow"], [data-testid$="-follow"]')) return true;
      return [...document.querySelectorAll('button, [role="button"]')]
        .some((node) => visible(node) && /^(Following|正在关注|正在關注|フォロー中|팔로잉)$/i.test((node.innerText || "").trim()));
    }, 8000);
  }

  if (mode === "personal" && action === "unfollow" && restrictedGateVisible()) {
    const skipRestricted = (reason) => ({
      status: "skipped_restricted",
      failureKind: "restricted",
      title: "这个账号目前被 X 限制",
      reason: reason || "X 限制了该账号的资料页，暂时无法安全取关。已跳过，请稍后手动处理。"
    });
    if (consentPreviouslyClicked) {
      // Clicking "Yes, view profile" can trigger a slow React transition.
      // Do not skip immediately after reinjection just because the gate is
      // still visible for a moment. Never click consent twice.
      const profileReady = await waitFor(() => {
        if (restrictedGateVisible()) return null;
        const action = document.querySelector('[data-testid$="-unfollow"], [data-testid$="-follow"]');
        if (action && visible(action)) return true;
        return [...document.querySelectorAll('button, [role="button"]')]
          .some((node) => visible(node) && /^(Following|正在关注|正在關注|フォロー中|팔로잉)$/i.test((node.innerText || "").trim())) || null;
      }, 10000);
      if (!profileReady) {
        return skipRestricted("已经点击 X 的「查看主页」，但页面仍未显示可核验的关注状态。已跳过，建议稍后手动处理。");
      }
    } else {
      // A generic agreement might authorize unrelated terms or purchases.
      // Click only a profile-view action on X's verified restricted notice.
      const viewProfileLabel = /^(?:Yes,?\s*view(?:\s+this)?\s+profile|Yes,?\s*show\s+profile|View\s+profile|是的[，,]?查看(?:个人资料|個人資料|主页|主頁)|同意并查看(?:主页|个人资料)|同意並查看(?:主頁|個人資料)|继续查看(?:主页|个人资料)|繼續查看(?:主頁|個人資料)|プロフィールを表示|このプロフィールを表示|프로필 보기|Ver perfil|Voir le profil|Lihat profil|Xem hồ sơ)$/i;
      const containers = [...document.querySelectorAll('[role="dialog"], [data-testid="primaryColumn"], main, [data-testid="cellInnerDiv"]')]
        .filter(visible)
        .filter((node) => restrictedPattern.test(String(node.innerText || "").replace(/\s+/g, " ")));
      const inside = containers.length ? containers : [document.body];
      const candidates = (nodes) => [...new Set(nodes.flatMap((node) => [...node.querySelectorAll('button, [role="button"]')]))]
        .filter(visible)
        .filter((node) => {
          const label = ((node.innerText || "").trim() || (node.getAttribute("aria-label") || "").trim()).replace(/\s+/g, " ");
          return viewProfileLabel.test(label);
        });
      let buttons = candidates(inside);
      // Some X versions render the warning in main, but portal its CTA under
      // a sibling node. Exact CTA text + confirmed warning is still required.
      if (!buttons.length && inside[0] !== document.body) buttons = candidates([document.body]);
      if (buttons.length !== 1) {
        return skipRestricted("X 显示账号限制提示，但未能确认唯一的「查看主页」按钮。已跳过，不会点击其他同意或授权按钮。");
      }
      await humanPauseInPage(400, 750);
      buttons[0].click();
      // The background worker must verify owner, target and whitelist again.
      // Clicking View Profile is not an unfollow success.
      return {
        status: "retry_profile_after_restricted_consent",
        failureKind: "restricted_consent",
        reason: "已点击 X 的「查看主页」，正在加载账号并重新核对关注状态"
      };
    }
  }

  if (mode === "personal" && action === "unfollow") {
    // A creator subscription sheet can obscure the actual Following control.
    // Match the paid-tier display, including decimal prices such as $3.00/month.
    const subscriptionScreenPattern = /Subscription Perks|Subscribe\s*[·•—-]?\s*[¥￥$€£]?\s*\d+(?:[.,]\d{1,2})?\s*\/\s*(?:month|mo\b)|订阅权益|订阅特权|付费订阅/i;
    const isSubscriptionRoute = () => /\/creator-subscriptions\/subscribe(?:\/|$)/i.test(location.pathname);
    const visibleSubscriptionDialog = () => [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-testid="sheetDialog"]')]
      .filter(visible)
      .find((item) => subscriptionScreenPattern.test(item.innerText || ""));
    const subscriptionShown = isSubscriptionRoute()
      || Boolean(visibleSubscriptionDialog())
      || subscriptionScreenPattern.test(pageText());

    if (subscriptionShown) {
      if (isSubscriptionRoute()) {
        // Do not click here: an SPA route change can invalidate this injected
        // script before it returns. The dedicated worker will close the
        // subscription dialog on the verified target route, then reopen the
        // profile, recheck account/whitelist and perform the action once.
        return {
          status: "retry_profile_after_subscription",
          failureKind: "subscription_overlay",
          reason: "识别到目标账号订阅页面，正在关闭弹窗并返回主页核对关注状态"
        };
      }
      const closeSelector = '[data-testid="app-bar-close"], button[aria-label="Close"], [role="button"][aria-label="Close"], button[aria-label="Dismiss"], [role="button"][aria-label="Dismiss"], button[aria-label="关闭"], [role="button"][aria-label="关闭"], button[aria-label="關閉"]';
      const closeSubscription = await waitFor(() => {
        // Prefer the close control inside the visible subscription dialog, not
        // an unrelated "Close" button elsewhere on the X page.
        const dialog = visibleSubscriptionDialog();
        const scopes = dialog ? [dialog, document] : [document];
        for (const scope of scopes) {
          const candidates = [...scope.querySelectorAll(closeSelector)].filter(visible);
          if (candidates.length) return candidates[0];
        }
        if (!isSubscriptionRoute() && !dialog) return null;
        return [...document.querySelectorAll('button, [role="button"]')]
          .filter(visible)
          .find((item) => /^(Close|Dismiss|关闭|關閉|×|✕|✖)$/i.test(
            ((item.getAttribute("aria-label") || "") + " " + (item.innerText || "")).trim()
          )) || null;
      }, 3500);

      if (closeSubscription) {
        await humanPauseInPage(350, 750);
        closeSubscription.click();
        await humanPauseInPage(500, 1100);
      }

      // Always revisit the intended /username profile before looking for
      // Following. The old subscription sheet may leave a nested URL, and
      // navigating within this injected script would terminate the script.
      // The background worker safely navigates and re-injects ONCE, with
      // owner/target and whitelist checks repeated before unfollowing.
      return {
        status: "retry_profile_after_subscription",
        failureKind: "subscription_overlay",
        reason: closeSubscription
          ? "已关闭 X 订阅弹窗，正在重新打开目标主页确认关注状态"
          : "检测到 X 订阅页面，正在重新打开目标主页确认关注状态"
      };
    }
  }

  if (mode === "personal") {
    const followsYouIndicator = document.querySelector('[data-testid="userFollowIndicator"]');
    if (visible(followsYouIndicator)) {
      return { status: "skipped_following_back", reason: "检测后该账号已经回关你，已自动跳过" };
    }
  }

  if (mode === "personal" && action === "unfollow") {
    const unfollowControl = await waitFor(() => {
      const byTestId = [...document.querySelectorAll('[data-testid$="-unfollow"]')].find(visible);
      if (byTestId) return byTestId;
      return [...document.querySelectorAll('button, [role="button"]')]
        .filter(visible)
        .find((item) => /^(Following|正在关注|フォロー中|팔로잉)$/i.test((item.innerText || "").trim()));
    }, 8000);

    if (!unfollowControl) {
      const followControl = [...document.querySelectorAll('[data-testid$="-follow"]')].find(visible);
      if (followControl) return { status: "already_unfollowed", reason: "当前已经没有关注该账号" };
      return { status: "failed", reason: "找不到“正在关注”按钮，X 页面结构可能已变化" };
    }

    await humanPauseInPage(500, 1200);
    unfollowControl.click();
    await humanPauseInPage(800, 1500);
    if (/\/creator-subscriptions\/subscribe(?:\/|$)/i.test(location.pathname)
      || /Subscription Perks|Subscribe\s*[·•—-]?\s*[¥￥$€£]?\s*\d+(?:[.,]\d{1,2})?\s*\/\s*(?:month|mo\b)|付费订阅/i.test(pageText())) {
      return {
        status: "retry_profile_after_subscription", failureKind: "subscription_overlay",
        reason: "X 打开了付费订阅页面，正在关闭并返回目标主页核对取关状态"
      };
    }

    const confirmUnfollow = [...document.querySelectorAll('[data-testid="confirmationSheetConfirm"], [role="dialog"] button, [role="dialog"] [role="button"]')]
      .filter(visible)
      .find((item) => /^(Unfollow|取关|取消关注|フォロー解除|언팔로우)/i.test((item.innerText || "").trim()));
    if (confirmUnfollow) {
      await humanPauseInPage(450, 1000);
      confirmUnfollow.click();
      await humanPauseInPage(700, 1300);
    }

    const applied = await waitFor(() => {
      if (/\/creator-subscriptions\/subscribe(?:\/|$)/i.test(location.pathname)
        || /Subscribe\s*[·•—-]?\s*[¥￥$€£]?\s*\d+(?:[.,]\d{1,2})?\s*\/\s*(?:month|mo\b)/i.test(pageText())) return "subscription";
      const followControl = [...document.querySelectorAll('[data-testid$="-follow"]')].find(visible);
      if (followControl) return "unfollowed";
      return null;
    }, 6000);
    if (applied === "subscription") return {
      status: "retry_profile_after_subscription", failureKind: "subscription_overlay",
      reason: "X 打开了付费订阅页面，正在返回目标主页核对取关状态"
    };
    if (applied !== "unfollowed") return { status: "failed", reason: "未能确认取关后显示 Follow 按钮，操作可能未成功" };
    return { status: "unfollowed", reason: "已取关" };
  }

  const actions = await waitFor(() => {
    const profileActions = [...document.querySelectorAll('[data-testid="userActions"]')].filter(visible);
    for (const container of profileActions) {
      const controls = [
        ...container.querySelectorAll('button, [role="button"]'),
        ...(container.matches('button, [role="button"]') ? [container] : [])
      ].filter(visible);
      const moreControl = controls.find((item) => /more|更多/i.test((item.getAttribute("aria-label") || "") + " " + (item.innerText || "")));
      if (moreControl) return moreControl;
      const menuControl = controls.find((item) => item.getAttribute("aria-haspopup") === "menu"
        && !/follow|关注|正在关注|unfollow|取关/i.test((item.getAttribute("aria-label") || "") + " " + (item.innerText || "")));
      if (menuControl) return menuControl;
    }
    return [...document.querySelectorAll('[data-testid="userActions"] button[aria-label], [data-testid="userActions"] [role="button"][aria-label]')]
      .filter(visible).find((item) => /more|更多/i.test(item.getAttribute("aria-label") || "")) || null;
  });
  if (!actions) return { status: "failed", reason: "找不到用户操作菜单，X 页面结构可能已变化" };

  actions.click();
  await humanPauseInPage(450, 1100);

  const directAction = await waitFor(() => {
    const candidates = [...document.querySelectorAll('[data-testid="block"], [data-testid="unblock"]')].filter(visible);
    return candidates.find((item) => /unblock|取消拉黑|解除封鎖|ブロック解除|차단 해제/i.test((item.innerText || "") + " " + (item.getAttribute("aria-label") || "")))
      || candidates.find((item) => /block|拉黑|封鎖|ブロック|차단/i.test((item.innerText || "") + " " + (item.getAttribute("aria-label") || "")))
      || null;
  }, 2000);
  if (directAction) {
    const text = (directAction.innerText || "") + " " + (directAction.getAttribute("aria-label") || "");
    if (unblockPattern.test(text)) return { status: "already_blocked", reason: "该账号已经被拉黑" };
    await humanPauseInPage(350, 900);
    directAction.click();
  }

  const menu = directAction ? null : await waitFor(() => {
    const menus = [...document.querySelectorAll('[role="menu"], [data-testid="Dropdown"]')].filter(visible);
    return menus.find((item) => item.querySelector('[role="menuitem"], [role="button"], button')) || menus[0] || null;
  }, 8000);
  if (!directAction && !menu) return { status: "failed", reason: "资料页的“更多操作”菜单未打开" };

  const menuItems = menu ? [...menu.querySelectorAll('[role="menuitem"], [role="button"], button')].filter(visible) : [];
  const alreadyBlocked = menuItems.find((item) => unblockPattern.test((item.innerText || "").trim() + " " + (item.getAttribute("aria-label") || "")));
  if (alreadyBlocked) return { status: "already_blocked", reason: "该账号已经被拉黑" };

  const blockItem = directAction || menuItems.find((item) => {
    const text = (item.innerText || "").trim() + " " + (item.getAttribute("aria-label") || "");
    return blockPattern.test(text) && !reportPattern.test(text);
  });
  if (!blockItem) return { status: "failed", reason: "菜单中找不到“拉黑”操作" };
  if (!directAction) {
    await humanPauseInPage(400, 1000);
    blockItem.click();
  }

  const confirm = await waitFor(() => {
    const byTestId = document.querySelector('[data-testid="confirmationSheetConfirm"]');
    if (visible(byTestId)) return byTestId;
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(visible);
    if (!dialog) return null;
    return [...dialog.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .find((button) => blockPattern.test((button.innerText || "").trim()) && !reportPattern.test(button.innerText || ""));
  }, 8000);
  if (!confirm) return { status: "failed", reason: "未出现拉黑确认窗口" };
  await humanPauseInPage(550, 1400);
  confirm.click();
  await humanPauseInPage(900, 1650);

  const dialogStillOpen = [...document.querySelectorAll('[role="dialog"]')].some(visible);
  if (dialogStillOpen) return { status: "failed", reason: "确认后窗口未关闭，操作可能未成功" };
  return { status: "blocked", reason: "已拉黑" };
}

// Only a matching target profile's subscription route can be dismissed.
// This is never a purchase/terms consent; only an X close control is eligible.
function isTargetSubscriptionRoute(urlValue, username) {
  try {
    const u = new URL(String(urlValue || ""));
    const name = String(username || "").toLowerCase();
    return u.protocol === "https:" && u.hostname === "x.com"
      && /^[A-Za-z0-9_]{1,15}$/.test(name)
      && u.pathname.replace(/\/$/, "").toLowerCase() === `/${name}/creator-subscriptions/subscribe`;
  } catch {
    return false;
  }
}

async function closeTargetSubscriptionPageInPage(expectedUsername) {
  const visible = (el) => Boolean(el && el.getClientRects().length);
  const name = String(expectedUsername || "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(name)
    || location.pathname.replace(/\/$/, "").toLowerCase() !== `/${name}/creator-subscriptions/subscribe`) {
    return { status: "not_target_subscription" };
  }
  // The screenshot shows the creator subscription screen with a Close (X)
  // in its upper-left corner and a separate paid Subscribe button below.
  const selectors = [
    '[data-testid="app-bar-close"]',
    '[data-testid="sheetDialog"] [aria-label="Close"]',
    '[role="dialog"] [aria-label="Close"]',
    '[aria-modal="true"] [aria-label="Close"]',
    'button[aria-label="Close"]',
    '[role="button"][aria-label="Close"]',
    'button[title="Close"]',
    '[role="button"][title="Close"]',
    '[data-testid="close"]',
    'button[aria-label="关闭"]',
    '[role="button"][aria-label="关闭"]',
    'button[aria-label="關閉"]',
    '[role="button"][aria-label="關閉"]'
  ];
  let close = null;
  for (const selector of selectors) {
    const candidates = [...document.querySelectorAll(selector)].filter(visible);
    // Ambiguous controls are not safe to click, even on a subscription page.
    if (candidates.length === 1) { close = candidates[0]; break; }
  }
  if (!close) {
    // X sometimes renders the close X as an icon-only role=button. Accept
    // only an unambiguous close glyph, never a Subscribe/payment control.
    const matches = [...document.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .filter((node) => /^(?:×|✕|✖|Close|Dismiss|关闭|關閉)$/.test(
        ((node.innerText || "").trim() || (node.getAttribute("aria-label") || "").trim())));
    if (matches.length === 1) close = matches[0];
  }
  if (!close) return { status: "close_not_found" };
  const text = ((close.innerText || "") + " " + (close.getAttribute("aria-label") || "")).trim();
  if (/Subscribe\s*[·•—-]?\s*[¥￥$€£]?\s*\d|Pay|Purchase|Buy|购买|付款/i.test(text)) {
    return { status: "unsafe_button_rejected" };
  }
  close.click();
  return { status: "close_clicked" };
}

const ACTION_JOB_WORKER_NAME_PREFIX = "__QG_ACTION_JOB_WORKER__:";

async function markActionJobWorker(tabId, jobId) {
  if (!Number.isInteger(Number(tabId)) || !jobId) return false;
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: Number(tabId) },
      func: (marker) => {
        window.name = marker;
        return window.name;
      },
      args: [ACTION_JOB_WORKER_NAME_PREFIX + jobId]
    });
    return result?.[0]?.result === ACTION_JOB_WORKER_NAME_PREFIX + jobId;
  } catch {
    return false;
  }
}

async function getVerifiedActionJobWorker(job, tabIdOverride = null) {
  const tabId = Number(tabIdOverride || job?.workerTabId || 0);
  const jobId = String(job?.id || "");
  if (!Number.isInteger(tabId) || tabId <= 0 || !jobId) return null;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.id || !isSafePersonalScanWorkerUrl(tab.url)) return null;
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.name
    });
    if (result?.[0]?.result !== ACTION_JOB_WORKER_NAME_PREFIX + jobId) return null;
  } catch {
    return null;
  }
  return tab;
}

async function closeActionJobWorker(job, tabIdOverride = null) {
  const verified = await getVerifiedActionJobWorker(job, tabIdOverride);
  if (!verified?.id) return false;
  await chrome.tabs.remove(verified.id).catch(() => {});
  return true;
}


function humanizeActionFailureReason(reason) {
  const text = String(reason || "").trim();
  if (!text) return "这个账号没有处理成功";
  if (/No tab with id|tab.*not found|The tab was closed|Invalid tab ID|No frame with id/i.test(text)) return "处理页面意外关闭";
  if (/Receiving end does not exist|Could not establish connection/i.test(text)) return "处理页面暂时没有响应";
  if (/Cannot access contents|Missing host permission|Cannot access a chrome/i.test(text)) return "暂时无法读取这个账号页面";
  if (/timed? ?out|timeout/i.test(text)) return "页面响应太慢，本次没有处理成功";
  if (/^HTTP[_ ]?\d+|GRAPHQL|HOOK_|NO_RESULT|CURSOR_/i.test(text)) return "X 页面暂时没有返回可用数据";
  return text;
}
async function runJob() {
  if (activeRun) return;
  activeRun = true;
  let workerCreatedThisRun = false;
  try {
    let job = await getJob();
    if (!job || job.status !== "running" || !["community", "personal"].includes(job.mode)) return;
    if (!job.id) {
      // Older persisted jobs did not have an id. Give them a stable id before
      // attaching any worker-tab identity marker.
      job.id = crypto.randomUUID();
      await setJob(job);
    }

    job.batchSize = job.batchSize || BATCH_SIZE;
    if (!Number.isInteger(job.batchStartIndex)) job.batchStartIndex = Math.floor(job.currentIndex / job.batchSize) * job.batchSize;
    if (!Number.isInteger(job.batchEndIndex)) job.batchEndIndex = Math.min(job.batchStartIndex + job.batchSize, job.targets.length);
    if (!Number.isInteger(job.batchNumber)) job.batchNumber = Math.floor(job.batchStartIndex / job.batchSize) + 1;
    const batchEndIndex = job.batchEndIndex;
    await setJob(job);

    if (job.workerTabId) {
      const verifiedWorker = await getVerifiedActionJobWorker(job);
      if (!verifiedWorker) {
        // Never trust a persisted numeric tab ID after browser/service-worker restart.
        // An unmarked or non-X tab may belong to the user.
        job.workerTabId = null;
        await setJob(job);
      }
    }

    if (!job.workerTabId) {
      const tab = await chrome.tabs.create({ url: "about:blank", active: false });
      job.workerTabId = tab.id;
      workerCreatedThisRun = true;
      await setJob(job);
    }

    while (job.currentIndex < job.targets.length && job.currentIndex < batchEndIndex) {
      job = await getJob();
      if (!job || job.status !== "running") break;
      if (job.mode === "personal") {
        const pendingTarget = job.targets[job.currentIndex];
        if (await isPersonalTargetProtected(job.sourceUsername, pendingTarget)) {
          job.results.push({
            ...pendingTarget,
            status: "skipped_whitelist",
            reason: "白名单保护，已跳过",
            finishedAt: new Date().toISOString()
          });
          job.currentIndex += 1;
          job.currentTarget = null;
          await setJob(job);
          continue;
        }
      }
      const quota = (await chrome.storage.local.get("quguangouQuota")).quguangouQuota || {};
      const reservation = reserveAttempt(quota);
      if (!reservation.allowed) {
        if (quota.cooldownUntil > Date.now()) {
          job.status = "paused";
          job.pauseKind = "batch";
          job.resumeAt = quota.cooldownUntil;
          job.pauseReason = "本批已处理 20 个账号，冷却 30 分钟后请手动继续下一批";
          await setJob(job);
          break;
        }
        await sleep(Math.min(1000, reservation.waitUntil - Date.now()));
        continue;
      }
      await chrome.storage.local.set({ quguangouQuota: reservation.state });
      const target = job.targets[job.currentIndex];
      job.currentTarget = target;
      await setJob(job);

      let outcome;
      try {
        await chrome.tabs.update(job.workerTabId, { url: target.url, active: false });
        await waitForTabComplete(job.workerTabId);
        const markedWorker = await markActionJobWorker(job.workerTabId, job.id);
        if (!markedWorker) throw new Error("处理页面状态不稳定，为避免误操作已暂停");
        await humanSleep(1000, 2100);
        // Recheck immediately before the irreversible action: whitelist can change mid-batch.
        const protectedNow = job.mode === "personal"
          && await isPersonalTargetProtected(job.sourceUsername, target);
        let injection;
        try {
          injection = protectedNow
            ? [{ result: { status: "skipped_whitelist", reason: "白名单保护，已跳过" } }]
            : await chrome.scripting.executeScript({
                target: { tabId: job.workerTabId },
                func: performProfileActionInPage,
                args: [target, job.mode, job.sourceUsername || null, job.mode === "personal" ? (job.action || "block") : "block"]
              });
          outcome = injection?.[0]?.result ?? { status: "failed", reason: "页面脚本没有返回结果" };
        } catch (injectionError) {
          const latestTab = await chrome.tabs.get(job.workerTabId).catch(() => null);
          if (!protectedNow && job.mode === "personal" && job.action === "unfollow"
              && isTargetSubscriptionRoute(latestTab?.url, target.username)) {
            // A route transition can cancel a content script mid-action.
            // Only a verified target subscription route is recoverable.
            outcome = { status: "retry_profile_after_subscription",
              failureKind: "subscription_overlay",
              reason: "X 自动跳转到目标账号的订阅页面，正在返回主页重新核对" };
          } else {
            throw injectionError;
          }
        }
        if (job.mode === "personal" && job.action === "unfollow"
            && outcome?.status === "retry_profile_after_restricted_consent") {
          await humanSleep(1000, 1600);
          const currentTab = await chrome.tabs.get(job.workerTabId).catch(() => null);
          if (!currentTab || !isSafePersonalScanWorkerUrl(currentTab.url)) {
            throw new Error("X 账号限制提示关闭后页面已离开 X，为避免误操作已暂停");
          }
          const expectedPath = "/" + String(target.username || "").toLowerCase();
          let actualPath = "";
          try { actualPath = new URL(currentTab.url).pathname.replace(/\/$/, "").toLowerCase(); } catch {}
          if (actualPath !== expectedPath) {
            await chrome.tabs.update(job.workerTabId, { url: target.url, active: false });
            await waitForTabComplete(job.workerTabId);
          }
          const verifiedConsentWorker = await markActionJobWorker(job.workerTabId, job.id);
          if (!verifiedConsentWorker) throw new Error("同意 X 限制提示后无法验证目标主页，已暂停以避免误操作");
          await humanSleep(700, 1200);
          if (await isPersonalTargetProtected(job.sourceUsername, target)) {
            outcome = { status: "skipped_whitelist", reason: "白名单保护，已跳过" };
          } else {
            const secondInjection = await chrome.scripting.executeScript({
              target: { tabId: job.workerTabId },
              func: performProfileActionInPage,
              args: [target, job.mode, job.sourceUsername || null, "unfollow", true]
            });
            outcome = secondInjection[0]?.result ?? {
              status: "failed", failureKind: "system", reason: "点击同意后没有收到目标主页的检查结果"
            };
            if (outcome?.status === "retry_profile_after_restricted_consent") {
              outcome = {
                status: "skipped_restricted",
                failureKind: "restricted",
                reason: "X 账号限制提示重复出现，已停止自动尝试，请手动查看。"
              };
            }
          }
        }
        if (job.mode === "personal" && job.action === "unfollow"
            && outcome?.status === "retry_profile_after_subscription") {
          // The X subscription flow may live on a separate /subscribe route.
          // Close that route's dialog first, *never* its paid Subscribe button.
          // Even if the close control is missing, navigating to the verified
          // target profile is safe and avoids silently marking this as success.
          const sheetTab = await chrome.tabs.get(job.workerTabId).catch(() => null);
          if (isTargetSubscriptionRoute(sheetTab?.url, target.username)) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: job.workerTabId },
                func: closeTargetSubscriptionPageInPage,
                args: [target.username]
              });
              await humanSleep(350, 750);
            } catch { /* X may navigate while the close button is clicked. */ }
          }
          // Dismissal is not proof that the target's Following button is visible.
          // Re-enter the original target URL once. Never reuse a different
          // profile or bypass owner, target, and whitelist verification.
          await chrome.tabs.update(job.workerTabId, { url: target.url, active: false });
          await waitForTabComplete(job.workerTabId);
          const reverifiedWorker = await markActionJobWorker(job.workerTabId, job.id);
          if (!reverifiedWorker) throw new Error("关闭订阅页面后无法验证目标主页，为避免误操作已暂停");
          await humanSleep(700, 1300);
          if (await isPersonalTargetProtected(job.sourceUsername, target)) {
            outcome = { status: "skipped_whitelist", reason: "白名单保护，已跳过" };
          } else {
            const secondInjection = await chrome.scripting.executeScript({
              target: { tabId: job.workerTabId },
              func: performProfileActionInPage,
              args: [target, job.mode, job.sourceUsername || null, "unfollow"]
            });
            outcome = secondInjection[0]?.result ?? { status: "failed", reason: "重新打开主页后没有收到操作结果" };
            if (outcome?.status === "retry_profile_after_subscription") {
              outcome = {
                status: "skipped_subscription",
                failureKind: "subscription_overlay",
                title: "订阅弹窗仍然遮挡账号主页",
                reason: "已尝试关闭订阅弹窗并重新打开目标主页，但仍无法安全取关。已跳过，请稍后手动处理。"
              };
            }
          }
        }
      } catch (error) {
        const rawFailure = String(error?.message || error || "");
        const isPageLoadTimeout = /页面加载超时|timed? ?out|timeout/i.test(rawFailure);
        outcome = {
          status: "failed",
          failureKind: isPageLoadTimeout ? "page_load_timeout" : "system",
          reason: humanizeActionFailureReason(rawFailure)
        };
      }
      if (outcome?.status === "failed") {
        // X may return a failed operation without a failureKind. Never count
        // unknown failures as successful and move to the next account.
        if (!outcome.failureKind) outcome.failureKind = "system";
        outcome.reason = humanizeActionFailureReason(outcome.reason);
      }

      job = await getJob();
      if (!job || job.status !== "running") break;
      job.results.push({ ...target, ...outcome, finishedAt: new Date().toISOString() });
      if (job.mode === "personal") {
        await markPersonalScanStale(job, job.action === "unfollow" ? "私人名单已经开始取关处理，关注关系可能已变化，请重新检测后再处理新的账号" : "私人名单已经开始拉黑处理，关注关系可能已变化，请重新检测后再处理新的账号");
      }
      job.currentIndex += 1;
      job.currentTarget = null;
      if (reservation.state.cooldownUntil && job.currentIndex < job.targets.length) {
        job.status = "paused";
        job.pauseKind = "batch";
        job.resumeAt = reservation.state.cooldownUntil;
        job.pauseReason = "本批已处理 20 个账号，冷却 30 分钟后请手动继续下一批";
      }
      const shouldPauseForSafety = outcome.status === "failed"
        && ["system", "page_load_timeout", "owner_unconfirmed", "owner_mismatch", "target_mismatch"].includes(outcome.failureKind);
      if (shouldPauseForSafety) {
        job.status = "paused";
        job.pauseKind = "failure";
        job.resumeAt = null;
        const failedTabId = job.workerTabId;
        const failedTabStillExists = failedTabId
          ? await chrome.tabs.get(failedTabId).then(() => true).catch(() => false)
          : false;
        job.pauseReason = outcome.failureKind === "page_load_timeout"
          ? "处理页面加载超时，任务已暂停。前面已经处理完成的账号不会重复；请手动继续一次，之后会从剩余账号开始。"
          : failedTabStillExists
            ? "检测到可能影响账号安全的异常，任务已暂停。失败页面还保留着，请确认后再继续。"
            : "处理页面出现系统级异常，任务已暂停。前面已经处理完成的账号不会重复；继续后会从剩余账号开始。";
        job.retainedTabId = failedTabStillExists ? failedTabId : null;
        job.workerTabId = null;
      }
      await setJob(job);
      await humanSleep(700, 1600);
    }

    job = await getJob();
    if (job?.workerTabId) {
      if (workerCreatedThisRun) {
        await chrome.tabs.remove(job.workerTabId).catch(() => {});
      } else {
        await closeActionJobWorker(job);
      }
      job.workerTabId = null;
    }
    if (job?.status === "running") {
      if (job.currentIndex >= job.targets.length) {
        job.status = "completed";
        job.pauseKind = null;
        job.pauseReason = null;
        job.completedAt = new Date().toISOString();
        if (job.mode === "personal" && job.communityShareOptIn) {
          try {
            ({ job } = await flushCommunityShareOptIn(job));
          } catch (error) {
            job.communityShareLastError = "社区名单暂时没有上传成功，稍后结束任务时会再试一次";
          }
        }
      } else if (job.currentIndex >= batchEndIndex) {
        const quota = (await chrome.storage.local.get("quguangouQuota")).quguangouQuota || {};
        job.status = "paused";
        job.pauseKind = "batch";
        job.resumeAt = quota.cooldownUntil || Date.now() + 1_800_000;
        job.pauseReason = `第 ${job.batchNumber} 批已经处理完，休息 30 分钟后再继续下一批`;
      }
    }
    if (job) await setJob(job);
  } finally {
    activeRun = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SUBMIT_COMMUNITY_CANDIDATES") {
    (async () => {
      let job = await getJob();
      if (!job || !message.jobId || job.id !== message.jobId) {
        sendResponse({ ok: false, error: "当前任务已经变化，请重新打开这个页面" });
        return;
      }
      const canChooseCommunity = job.mode === "personal"
        && (job.status === "completed" || (job.status === "paused" && job.pauseKind === "batch"));
      if (!canChooseCommunity) {
        sendResponse({ ok: false, error: "请在任务暂停休息时，或全部处理完成后，再选择加入社区名单" });
        return;
      }

      job.communityShareOptIn = true;
      job.communityShareOptInAt = job.communityShareOptInAt || new Date().toISOString();
      await setJob(job);

      if (job.status !== "completed") {
        sendResponse({ ok: true, deferred: true, submittedHandles: [], job });
        return;
      }

      try {
        const flushed = await flushCommunityShareOptIn(job);
        job = flushed.job;
        await setJob(job);
        sendResponse({ ok: true, deferred: false, result: flushed.result || null, submittedHandles: flushed.submittedHandles, job });
      } catch (error) {
        job.communityShareLastError = "社区名单暂时没有上传成功，已经保留你的选择";
        await setJob(job);
        sendResponse({ ok: true, deferred: true, warning: job.communityShareLastError, submittedHandles: [], job });
      }
    })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "GET_JOB") {
    getJob().then((job) => sendResponse({ ok: true, job }));
    return true;
  }
  if (message?.type === "GET_BLOCKLIST") {
    getBlocklist(message.locale)
      .then((blocklist) => sendResponse({ ok: true, blocklist }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "GET_PERSONAL_SCAN_HEALTH") {
    // This is a lightweight read: no large checkpoint hydration or network calls.
    // A numeric tab ID alone cannot prove that the extension's scan window exists.
    (async () => {
      const saved = await chrome.storage.local.get(PERSONAL_SCAN_KEY);
      const scan = saved[PERSONAL_SCAN_KEY] || null;
      const verified = scan?.status === "running" && scan?.workerTabId
        ? await getVerifiedPersonalScanWorker(scan)
        : null;
      sendResponse({ ok: true, scanId: scan?.id || null,
        running: scan?.status === "running", windowPresent: Boolean(verified),
        lastAccountProgressAt: Number(scan?.lastAccountProgressAt || 0) });
    })().catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === "GET_PERSONAL_SCAN") {
    getPersonalScan().then((scan) => {
      sendResponse({ ok: true, scan: toPublicPersonalScan(scan) });
      // Opening the popup after cooldown is an explicit opportunity to
      // recover. Do not depend only on Chrome's background alarm cadence.
      if (scan?.status === "running" &&
          Number(scan.nextRecoveryAt || 0) <= Date.now()) {
        void resumePersonalScanIfNeeded().catch((error) =>
          console.warn("[QG] Resume-on-open failed:", error?.message || String(error)));
      }
    }).catch((error) => sendResponse({ok:false,error:error?.message || String(error)}));
    return true;
  }
  if (message?.type === "GET_PERSONAL_WHITELIST") {
    (async () => {
      const scan = await getPersonalScan();
      await personalWhitelistWriteQueue.catch(() => {});
      const owner = await resolveWhitelistOwner(chrome.storage.local, scan?.username);
      sendResponse({
        ok: true,
        owner,
        entries: await readPersonalWhitelist(owner)
      });
    })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "SET_PERSONAL_WHITELIST") {
    (async () => {
      const scan = await getPersonalScan();
      const username = whitelistHandle(message.username);
      if (!scan?.id || scan.id !== message.scanId || !whitelistOwnerKey(scan.username) || !username) {
        throw new Error("当前 X 账号或检测记录已变化，请重新打开私人账号模式");
      }
      const protect = message.protect === true;
      const candidate = (scan.nonFollowers || []).find((item) => whitelistHandle(item.username) === username);
      if (protect && (scan.status !== "completed" || !candidate)) {
        throw new Error("只能将当前已检测的未回关账号加入白名单");
      }
      const existing = await readPersonalWhitelist(scan.username);
      if (!protect && !existing.some((item) => whitelistHandle(item.username) === username)) {
        throw new Error("该账号不在当前白名单中");
      }
      const entries = await updatePersonalWhitelist(scan.username,
        protect ? candidate : existing.find((item) => whitelistHandle(item.username) === username),
        protect);
      sendResponse({ ok: true, owner: whitelistHandle(scan.username), entries });
    })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "START_PERSONAL_SCAN") {
    (async () => {
      const job = await getJob();
      if (activeRun || job?.status === "running") {
        sendResponse({ ok: false, error: "已有处理任务正在执行，请先停止或等待本批结束" });
        return;
      }
      if (job && ["paused", "cancelled"].includes(job.status) && job.currentIndex < job.targets.length) {
        const label = job.mode === "personal" ? "私人账号" : "社区名单";
        sendResponse({ ok: false, error: `还有未完成的${label}任务，请先继续或结束原任务` });
        return;
      }
      const existing = await getPersonalScan();
      if (activePersonalScan || existing?.status === "running") {
        sendResponse({ ok: false, error: "私人账号检测正在进行中" });
        return;
      }
      if (existing?.status === "failed" && existing?.id) {
        existing.progress = { following: 0, followers: 0, ...(existing.progress || {}) };
        existing.partial = { following: [], followers: [], ...(existing.partial || {}) };
        existing.relationCompleted = { following: false, followers: false, ...(existing.relationCompleted || {}) };
        const followersStarted = Number(existing.progress.followers || 0) > 0 || existing.partial.followers.length > 0;
        const followingCompleted = Boolean(existing.relationCompleted.following);
        existing.status = "running";
        existing.initialized = true;
        existing.phase = followingCompleted || followersStarted ? "followers" : (existing.username ? "following" : "account");
        existing.lastRecoverableError = String(existing.error || existing.lastRecoverableError || "上次检测中断");
        existing.error = null;
        existing.recoveryPending = true;
        existing.recoveryMessage = "继续上次检测，之前已保存的数据不会重新扫描。";
        existing.nextRecoveryAt = null;
        existing.workerTabId = null;
        existing.workerWindowId = null;
        await setPersonalScan(existing, true, true);
        await ensurePersonalScanAlarm();
        sendResponse({ ok: true, scan: toPublicPersonalScan(existing) });
        void runPersonalScan(existing.id);
        return;
      }

      const completedNeedsValidation = Boolean(
        existing?.status === "completed"
        && existing?.id
        && !Number.isFinite(existing.profileFollowersCount)
        && !existing.progress?.followersUnknownEndValidated
      );
      if (completedNeedsValidation) {
        const [savedFollowing, savedFollowers] = await Promise.all([
          getPersonalScanCheckpoint(existing.id, "following"),
          getPersonalScanCheckpoint(existing.id, "followers")
        ]);
        if (savedFollowing.length > 0 && savedFollowers.length > 0) {
          existing.status = "running";
          existing.phase = "followers";
          existing.initialized = true;
          existing.progress = {
            following: savedFollowing.length,
            followers: savedFollowers.length,
            ...(existing.progress || {}),
            following: Math.max(Number(existing.progress?.following || 0), savedFollowing.length),
            followers: Math.max(Number(existing.progress?.followers || 0), savedFollowers.length),
            followersCursorDisabled: true,
            followersCursor: ""
          };
          existing.partial = { following: savedFollowing, followers: savedFollowers };
          existing.relationCompleted = { following: true, followers: false };
          existing.followingCount = savedFollowing.length;
          existing.followersCount = savedFollowers.length;
          existing.nonFollowers = [];
          existing.mutualCount = 0;
          existing.profileFollowersRaw = "";
          existing.profileFollowersCount = null;
          existing.profileFollowersExact = false;
          existing.completedAt = null;
          existing.error = null;
          existing.recoveryPending = true;
          existing.recoveryMessage = "正在继续校验上次结果；第一阶段已保存，不会重新扫描。";
          existing.workerTabId = null;
          existing.workerWindowId = null;
          await setPersonalScan(existing, true, true);
          await ensurePersonalScanAlarm();
          sendResponse({ ok: true, scan: toPublicPersonalScan(existing) });
          void runPersonalScan(existing.id);
          return;
        }
      }

      if (existing?.id) await clearPersonalScanCheckpoints(existing.id);
      const scan = {
        id: crypto.randomUUID(),
        status: "running",
        phase: "account",
        initialized: false,
        username: null,
        progress: { following: 0, followers: 0 },
        followingCount: 0,
        followersCount: 0,
        nonFollowers: [],
        mutualCount: 0,
        workerTabId: null,
        workerWindowId: null,
        startedAt: new Date().toISOString()
      };
      await setPersonalScan(scan);
      await ensurePersonalScanAlarm();
      sendResponse({ ok: true, scan });
      void runPersonalScan(scan.id);
    })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "PAUSE_PERSONAL_SCAN") {
    (async () => {
      const scan = await pausePersonalScanKeepingProgress("用户主动暂停，扫描断点和已保存数据均保留。");
      sendResponse({ ok: true, scan: toPublicPersonalScan(scan) });
    })().catch(error => sendResponse({ok:false,error:error.message||String(error)}));
    return true;
  }
  if (message?.type === "FORCE_RESTART_PERSONAL_SCAN_WINDOW") {
    forceRestartPersonalScanWindow()
      .then((result) => sendResponse({ok:true,...result}))
      .catch((error) => sendResponse({ok:false,error:error?.message || String(error)}));
    return true;
  }
  if (message?.type === "RESUME_PERSONAL_SCAN") {
    (async () => {
      const scan = await getPersonalScan();
      if (!scan || scan.status !== "paused") {
        sendResponse({ok:false,error:"没有可继续的暂停扫描任务"});
        return;
      }
      await closePersonalScanWorker(scan);
      scan.status = "running";
      scan.recoveryPending = true;
      scan.recoveryMessage = "正在从保存的断点继续扫描，旧数据不会清零。";
      const rateLimitUntil = getExistingRateLimitUntil(scan);
      const limited = isPersonalScanRateLimited(scan.lastRecoverableError || scan.pauseReason);
      scan.consecutiveRecoveryCount = limited ? Number(scan.consecutiveRecoveryCount || 0) : 0;
      if (!limited) scan.lastRecoverableError = null;
      scan.nextRecoveryAt = rateLimitUntil > Date.now() ? rateLimitUntil : null;
      scan.rateLimitUntil = rateLimitUntil > Date.now() ? rateLimitUntil : null;
      if (scan.nextRecoveryAt) {
        scan.recoveryMessage = "X 返回 HTTP_429，仍在冷却。到达恢复时间后才会自动尝试继续，已保存的数据不会清空。";
      }
      scan.workerWindowId = null;
      scan.workerTabId = null;
      scan.pauseReason = null;
      await setPersonalScan(scan, true, true);
      await ensurePersonalScanAlarm();
      if (scan.nextRecoveryAt) await schedulePersonalScanCooldownWake(scan.nextRecoveryAt);
      sendResponse({ok:true,scan:toPublicPersonalScan(scan)});
      void runPersonalScan(scan.id);
    })().catch(error => sendResponse({ok:false,error:error.message||String(error)}));
    return true;
  }
  if (message?.type === "CANCEL_PERSONAL_SCAN") {
    (async () => {
      const scan = await getPersonalScan();
      if (!scan || scan.status !== "running") {
        sendResponse({ ok: true, scan });
        return;
      }
      scan.status = "cancelled";
      scan.phase = "cancelled";
      await closePersonalScanWorker(scan);
      scan.workerTabId = null;
      scan.workerWindowId = null;
      scan.partial = null;
      scan.relationCompleted = null;
      await setPersonalScan(scan);
      await clearPersonalScanCheckpoints(scan.id);
      await clearPersonalScanAlarm();
      sendResponse({ ok: true, scan });
    })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "CLEAR_PERSONAL_SCAN") {
    (async () => {
      const scan = await getPersonalScan();
      if (scan?.status === "running") {
        sendResponse({ ok: false, error: "检测正在进行中，不能清除" });
        return;
      }
      if (scan?.id) await clearPersonalScanCheckpoints(scan.id);
      await chrome.storage.local.remove(PERSONAL_SCAN_KEY);
      sendResponse({ ok: true });
    })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "START_PERSONAL_ACTION_JOB") {
    (async () => {
      const scan = await getPersonalScan();
      if (!scan || scan.status !== "completed" || scan.id !== message.scanId) {
        sendResponse({ ok: false, error: "未回关检测结果已失效，请重新检测" });
        return;
      }
      if (!whitelistOwnerKey(scan.username)) {
        sendResponse({ ok: false, error: "无法确认当前 X 账号，不能执行批量操作" });
        return;
      }
      const countMismatch = getCompletedScanCountMismatch(scan);
      if (countMismatch) {
        sendResponse({
          ok: false,
          error: "本次检测结果不完整：" + countMismatch.label + "只读取到 " + countMismatch.actual
            + " 个，至少应读取 " + countMismatch.required + " 个。请重新检测后再处理。"
        });
        return;
      }
      const action = message.action === "unfollow" ? "unfollow" : message.action === "block" ? "block" : null;
      if (!action) {
        sendResponse({ ok: false, error: "未知处理方式" });
        return;
      }
      if (!Array.isArray(message.usernames) || message.usernames.length === 0) {
        sendResponse({ ok: false, error: "请先选择要处理的账号" });
        return;
      }
      if (activePersonalScan) {
        sendResponse({ ok: false, error: "私人账号检测仍在进行中" });
        return;
      }

      const allowed = new Map((scan.nonFollowers || []).map((user) => [
        String(user.username || "").toLowerCase(),
        user
      ]));
      await personalWhitelistWriteQueue.catch(() => {});
      const whitelist = await readPersonalWhitelist(scan.username);
      // Guard a replaced/reinstalled unpacked extension: a fresh extension ID
      // cannot see the old ID's whitelist, even in the same Chrome profile.
      // The user must explicitly see the zero-whitelist warning in the
      // confirmation dialog before any personal bulk action can start.
      if (!whitelist.length && message.acknowledgeEmptyWhitelist !== true) {
        sendResponse({ ok: false,
          error: "当前插件没有读取到任何白名单。请先确认是否换过插件安装实例，并在确认框中明确确认无白名单保护。" });
        return;
      }
      const requested = [];
      const seen = new Set();
      for (const raw of message.usernames) {
        const username = String(raw || "").replace(/^@/, "").trim();
        const key = username.toLowerCase();
        if (!key || seen.has(key)) continue;
        if (!allowed.has(key)) {
          sendResponse({ ok: false, error: `账号 @${username} 不在本次未回关检测结果中，请重新检测` });
          return;
        }
        seen.add(key);
        if (isPersonalWhitelisted(whitelist, allowed.get(key))) continue;
        requested.push(username);
      }
      if (!requested.length) {
        sendResponse({ ok: false, error: "所选账号全部受到白名单保护，已跳过处理" });
        return;
      }

      const existing = await getJob();
      if (activeRun || existing?.status === "running") {
        sendResponse({ ok: false, error: "已有处理任务正在执行" });
        return;
      }
      if (existing && existing.currentIndex < existing.targets.length && ["paused", "cancelled"].includes(existing.status)) {
        const label = existing.mode === "personal" ? "私人账号" : "社区名单";
        sendResponse({ ok: false, error: `还有未完成的${label}任务，请先继续或结束原任务` });
        return;
      }

      const quota = (await chrome.storage.local.get("quguangouQuota")).quguangouQuota || {};
      if (quota.cooldownUntil > Date.now()) {
        sendResponse({ ok: false, error: `当前仍在全局冷却中，请在 ${new Date(quota.cooldownUntil).toLocaleString()} 后继续` });
        return;
      }

      const parsed = parseAccountList(requested.map((username) => `@${username}`).join("\n"), requested.length);
      if (parsed.invalid.length || parsed.targets.length !== requested.length) {
        sendResponse({ ok: false, error: parsed.invalid[0]?.error || "私人名单中存在无法识别的账号" });
        return;
      }

      const jobId = crypto.randomUUID();
      const communityPromptSchedule = planCommunityPromptSchedule(parsed.targets.length, BATCH_SIZE, jobId);
      const job = {
        id: jobId,
        mode: "personal",
        action,
        communityLocale: communityPartition(message.locale),
        sourceScanId: scan.id,
        sourceUsername: scan.username || null,
        status: "running",
        targets: parsed.targets.map((target) => ({
          ...target,
          userId: whitelistUserId(allowed.get(whitelistHandle(target.username)))
        })),
        results: [],
        currentIndex: 0,
        currentTarget: null,
        batchSize: BATCH_SIZE,
        batchNumber: 1,
        batchStartIndex: 0,
        batchEndIndex: Math.min(BATCH_SIZE, parsed.targets.length),
        pauseKind: null,
        communityPromptPauseBatches: communityPromptSchedule.pauseBatches,
        communityPromptOnCompletion: communityPromptSchedule.showOnCompletion,
        communityShareOptIn: false,
        workerTabId: null,
        startedAt: new Date().toISOString()
      };
      await setJob(job);
      sendResponse({ ok: true, job });
      void runJob();
    })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "RESUME_JOB") {
    (async () => {
      const job = await getJob();
      const personalScan = await getPersonalScan();
      if (activePersonalScan || personalScan?.status === "running") {
        sendResponse({ ok: false, error: "私人账号检测正在进行中，请先完成或停止检测" });
        return;
      }
      if (activeRun || !job || !["paused", "cancelled"].includes(job.status) || job.currentIndex >= job.targets.length) {
        sendResponse({ ok: false, error: "当前没有可继续的任务" });
        return;
      }
      const quota = (await chrome.storage.local.get("quguangouQuota")).quguangouQuota || {};
      if (quota.cooldownUntil > Date.now()) {
        sendResponse({ ok: false, error: `本批已完成，请在 ${new Date(quota.cooldownUntil).toLocaleString()} 后继续` });
        return;
      }

      const batchSize = job.batchSize || BATCH_SIZE;
      const needsNewBatch = job.pauseKind === "batch"
        || !Number.isInteger(job.batchEndIndex)
        || job.currentIndex >= job.batchEndIndex;
      job.batchSize = batchSize;
      if (needsNewBatch) {
        job.batchStartIndex = job.currentIndex;
        job.batchEndIndex = Math.min(job.currentIndex + batchSize, job.targets.length);
        job.batchNumber = Math.floor(job.batchStartIndex / batchSize) + 1;
      }
      job.status = "running";
      job.pauseKind = null;
      job.resumeAt = null;
      job.pauseReason = null;
      await setJob(job);
      sendResponse({ ok: true, job });
      void runJob();
    })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "START_BUNDLED_JOB") {
    (async () => {
      const existing = await getJob();
      const personalScan = await getPersonalScan();
      if (activePersonalScan || personalScan?.status === "running") {
        sendResponse({ ok: false, error: "私人账号检测正在进行中，请先完成或停止检测" });
        return;
      }
      if (existing && existing.mode !== "community") {
        sendResponse({ ok: false, error: "当前存在私人账号任务，请从私人账号模式继续或结束该任务" });
        return;
      }
      if (activeRun || existing?.status === "running") {
        sendResponse({ ok: false, error: "已有任务正在执行" });
        return;
      }
      const quota = (await chrome.storage.local.get("quguangouQuota")).quguangouQuota || {};
      if (quota.cooldownUntil > Date.now()) {
        sendResponse({ ok: false, error: `本批已完成，请在 ${new Date(quota.cooldownUntil).toLocaleString()} 后手动继续下一批` });
        return;
      }
      if (existing && ["paused", "cancelled"].includes(existing.status) && existing.currentIndex < existing.targets.length) {
        const batchSize = existing.batchSize || BATCH_SIZE;
        const needsNewBatch = existing.pauseKind === "batch"
          || !Number.isInteger(existing.batchEndIndex)
          || existing.currentIndex >= existing.batchEndIndex;
        existing.batchSize = batchSize;
        if (needsNewBatch) {
          existing.batchStartIndex = existing.currentIndex;
          existing.batchEndIndex = Math.min(existing.currentIndex + batchSize, existing.targets.length);
          existing.batchNumber = Math.floor(existing.batchStartIndex / batchSize) + 1;
        }
        existing.status = "running";
        existing.pauseKind = null;
        existing.resumeAt = null;
        existing.pauseReason = null;
        await setJob(existing);
        sendResponse({ ok: true, job: existing });
        void runJob();
        return;
      }
      const blocklist = await getBlocklistForJob(message.locale);
      if (!blocklist.targets.length) {
        sendResponse({ ok: false, error: "当前名单为空" });
        return;
      }
      const job = {
        id: crypto.randomUUID(),
        mode: "community",
        communityLocale: communityPartition(message.locale),
        status: "running",
        blocklistVersion: blocklist.version,
        blocklistSource: blocklist.source,
        targets: blocklist.targets,
        results: [],
        currentIndex: 0,
        currentTarget: null,
        batchSize: BATCH_SIZE,
        batchNumber: 1,
        batchStartIndex: 0,
        batchEndIndex: Math.min(BATCH_SIZE, blocklist.targets.length),
        pauseKind: null,
        workerTabId: null,
        startedAt: new Date().toISOString()
      };
      await setJob(job);
      sendResponse({ ok: true, job });
      void runJob();
    })().catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "SKIP_COOLDOWN") {
    (async () => {
      const job = await getJob();
      const personalScan = await getPersonalScan();
      if (activePersonalScan || personalScan?.status === "running") {
        sendResponse({ ok: false, error: "私人账号检测正在进行中，请先完成或停止检测" });
        return;
      }
      if (activeRun || !job || !["community", "personal"].includes(job.mode) || job.status !== "paused" || job.pauseKind !== "batch" || job.currentIndex >= job.targets.length) {
        sendResponse({ ok: false, error: "当前没有可跳过的冷却任务" });
        return;
      }
      const quota = (await chrome.storage.local.get("quguangouQuota")).quguangouQuota || {};
      if (!(quota.cooldownUntil > Date.now())) {
        sendResponse({ ok: false, error: "冷却已经结束，请直接继续下一批" });
        return;
      }

      const previousResumeAt = quota.cooldownUntil;
      await chrome.storage.local.set({
        quguangouQuota: {
          ...quota,
          count: 0,
          cooldownUntil: 0
        }
      });

      const batchSize = job.batchSize || BATCH_SIZE;
      job.batchSize = batchSize;
      job.batchStartIndex = job.currentIndex;
      job.batchEndIndex = Math.min(job.currentIndex + batchSize, job.targets.length);
      job.batchNumber = Math.floor(job.batchStartIndex / batchSize) + 1;
      job.status = "running";
      job.pauseKind = null;
      job.resumeAt = null;
      job.pauseReason = null;
      job.skippedCooldowns = [
        ...(Array.isArray(job.skippedCooldowns) ? job.skippedCooldowns : []),
        { skippedAt: new Date().toISOString(), previousResumeAt }
      ];
      await setJob(job);
      sendResponse({ ok: true, job });
      void runJob();
    })().catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "END_JOB") {
    (async () => {
      let job = await getJob();
      if (!job) {
        sendResponse({ ok: true });
        return;
      }
      if (activeRun || job.status === "running") {
        sendResponse({ ok: false, error: "任务正在执行中，请先停止任务" });
        return;
      }
      if (job.mode === "personal" && job.communityShareOptIn) {
        try {
          ({ job } = await flushCommunityShareOptIn(job));
          await setJob(job);
        } catch (error) {
          job.communityShareLastError = "社区名单暂时没有上传成功，请稍后再结束任务";
          await setJob(job);
          sendResponse({ ok: false, error: job.communityShareLastError });
          return;
        }
      }
      if (job.workerTabId) await closeActionJobWorker(job, job.workerTabId);
      if (job.retainedTabId) await closeActionJobWorker(job, job.retainedTabId);
      await chrome.storage.local.remove(STORAGE_KEY);
      const quota = (await chrome.storage.local.get("quguangouQuota")).quguangouQuota || {};
      chrome.runtime.sendMessage({ type: "JOB_UPDATED", job: null }).catch(() => {});
      sendResponse({ ok: true, cooldownUntil: Number(quota.cooldownUntil || 0) });
    })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message?.type === "CANCEL_JOB") {
    (async () => {
      const job = await getJob();
      if (job?.status === "running") {
        job.status = "cancelled";
        job.currentTarget = null;
        if (job.workerTabId) await closeActionJobWorker(job, job.workerTabId);
        job.workerTabId = null;
        await setJob(job);
      }
      sendResponse({ ok: true, job });
    })();
    return true;
  }
});

async function resumePersonalScanIfNeeded() {
  let scan = await getPersonalScan();
  const repeatedUnrecoverable = shouldPauseForRepeatedXError(
    scan?.lastRecoverableError, scan?.consecutiveRecoveryCount
  );
  const recoverableRateLimit = isPersonalScanRateLimited(scan?.lastRecoverableError)
    && Number(scan?.consecutiveRecoveryCount || 0) < 3;
  if (scan?.status === "running" && repeatedUnrecoverable && !recoverableRateLimit) {
    await pausePersonalScanKeepingProgress("X 关注/粉丝列表持续报错，已暂停自动重试并保留断点。");
    return;
  }

  const terminalCheckpointsNoLongerNeeded = Boolean(
    scan?.id
    && (
      scan.status === "cancelled"
      || scan.status === "stale"
      || (scan.status === "completed" && (
        Number.isFinite(scan.profileFollowersCount)
        || scan.progress?.followersUnknownEndValidated
      ))
    )
  );
  if (terminalCheckpointsNoLongerNeeded) {
    await clearPersonalScanCheckpoints(scan.id);
  }

  // v0.2.49 and earlier incorrectly treated an unreadable profile total as fatal.
  // Preserve all partial users/cursors and resume that exact scan instead of making
  // the user restart from zero after upgrading.
  const retryablePersistedFailure = Boolean(
    scan?.status === "failed"
    && scan?.id
    && !isPermanentPersonalScanError(scan.error || "")
  );

  if (retryablePersistedFailure) {
    scan.progress = { following: 0, followers: 0, ...(scan.progress || {}) };
    scan.partial = { following: [], followers: [], ...(scan.partial || {}) };
    scan.relationCompleted = { following: false, followers: false, ...(scan.relationCompleted || {}) };
    const followersStarted = Number(scan.progress.followers || 0) > 0
      || scan.partial.followers.length > 0;
    const followingCompleted = Boolean(scan.relationCompleted.following);

    scan.status = "running";
    scan.initialized = true;
    scan.phase = followingCompleted || followersStarted ? "followers" : "following";
    const previousFailureReason = String(scan.error || "检测过程暂时中断");
    scan.error = null;
    scan.recoveryPending = true;
    scan.lastRecoverableError = previousFailureReason;
    scan.recoveryMessage = "中断原因：" + previousFailureReason + "。已保留之前进度，正在自动继续，不需要重新检测。";
    scan.consecutiveRecoveryCount = Number(scan.consecutiveRecoveryCount || 0);
    scan.nextRecoveryAt = null;
    scan.workerTabId = null;
    scan.workerWindowId = null;
    scan.legacyUnknownTotalRecoveredAt = new Date().toISOString();
    await setPersonalScan(scan, true, true);
  }

  scan = await getPersonalScan();
  if (scan?.status === "running") {
    await ensurePersonalScanAlarm();
    if (Number(scan.nextRecoveryAt || 0) > Date.now()) {
      await schedulePersonalScanCooldownWake(scan.nextRecoveryAt);
      return;
    }
    // If the worker is stuck on a never-returning X page or GraphQL request,
    // the old activePersonalScan flag would previously block every wakeup.
    // An 8-minute absence of *saved scan activity* is a stuck session, not a
    // legitimate human pause (those are only a few seconds). Restart once,
    // preserving checkpoints. Throttle automatic restarts to every 15 minutes.
    const lastSavedAt = Date.parse(scan.resumeSavedAt || scan.lastRecoveryAt || scan.startedAt || "");
    const idleFor = Number.isFinite(lastSavedAt) ? Date.now() - lastSavedAt : 0;
    const lastAutoRestart = Number(scan.lastAutomaticWindowRestartAt || scan.lastForceRestartAt || 0);
    if (activePersonalScan && activePersonalScanId === scan.id &&
        idleFor > 8 * 60_000 &&
        Date.now() - lastAutoRestart > 15 * 60_000) {
      try {
        await forceRestartPersonalScanWindow(true);
        return;
      } catch (error) {
        console.warn("[QG] Safe automatic scan window recovery failed:",
          error?.message || String(error));
      }
    }
    // Cold alarms also recover a disappeared scan popup. A live worker
    // reuses its verified popup; a missing one is recreated from the saved
    // cursor and account records by runPersonalScan().
    void runPersonalScan(scan.id);
  } else {
    await clearPersonalScanAlarm();
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name !== PERSONAL_SCAN_ALARM &&
      alarm?.name !== PERSONAL_SCAN_COOLDOWN_ALARM) return;
  void resumePersonalScanIfNeeded();
});

chrome.action.onClicked.addListener((tab) => {
  if (sidePanelBehaviorReady) return;
  if (chrome.sidePanel?.open && Number.isInteger(tab?.windowId)) {
    void chrome.sidePanel.open({ windowId: tab.windowId })
      .catch(() => openPersistentExtensionWindow());
    return;
  }
  void openPersistentExtensionWindow();
});

chrome.windows.onRemoved.addListener((windowId) => {
  void chrome.storage.local.get(PERSISTENT_WINDOW_KEY).then((stored) => {
    if (Number(stored[PERSISTENT_WINDOW_KEY]) === Number(windowId)) {
      return chrome.storage.local.remove(PERSISTENT_WINDOW_KEY);
    }
  }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  void configureSidePanel();
  void runJob();
  void resumePersonalScanIfNeeded();
});

void configureSidePanel();
void runJob();
void resumePersonalScanIfNeeded();

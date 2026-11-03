import { getScanRestartText } from "./lib/scan-restart-text.js";
import { scanStallKind } from "./lib/scan-stall-help.js";
import { remainingProfileCountGap, completedFollowerCountGap } from "./lib/scan-last-mile.js";
import { getCompletedScanCountMismatch } from "./lib/relations.js";
import { getValuePromoProbability } from "./lib/value-promo.js";
import { planCommunityPromptSchedule } from "./lib/community-share.js";

const $ = (selector) => document.querySelector(selector);
const modeView = $("#modeView");
const personalView = $("#personalView");
const blocklistView = $("#blocklistView");
const progressView = $("#progressView");
let blocklist = null;
let blocklistPromise = null;
let currentJob = null;
let currentPersonalScan = null;
let scanWindowHealth = null;
let selectedPersonalScanId = null;
const selectedPersonalHandles = new Set();
let pendingPersonalAction = "block";
let emptyWhitelistWarningShown = false;
const PERSONAL_WHITELIST_STORAGE_KEY = "quguangouPersonalWhitelistV1";
let whitelistOwner = "";
let personalWhitelistEntries = [];
let whitelistLoadStatus = "idle";
let whitelistLoadRequest = 0;
let whitelistLoadError = "";

function normalizePersonalWhitelistHandle(value) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}

function isPersonalProtected(user) {
  const handle = normalizePersonalWhitelistHandle(user?.username);
  const id = String(user?.userId || user?.rest_id || user?.id_str || user?.id || "");
  return personalWhitelistEntries.some((entry) =>
    (Boolean(id) && Boolean(entry.userId) && String(entry.userId) === id)
      || (Boolean(handle) && normalizePersonalWhitelistHandle(entry.username) === handle));
}

function applyPersonalWhitelistEntries(entries) {
  personalWhitelistEntries = Array.isArray(entries) ? entries : [];
  for (const handle of [...selectedPersonalHandles]) {
    const user = (currentPersonalScan?.nonFollowers || []).find(
      (item) => normalizePersonalWhitelistHandle(item.username) === handle);
    if (!user || isPersonalProtected(user)) selectedPersonalHandles.delete(handle);
  }
  renderPersonalWhitelist();
  if (currentPersonalScan?.status === "completed" && !$("#personalResultView").classList.contains("hidden")) {
    renderPersonalResultList(currentPersonalScan.nonFollowers || []);
  }
}

function renderPersonalWhitelist() {
  const list = $("#personalWhitelistList");
  if (!list) return;
  clear(list);
  $("#personalWhitelistCount").textContent = whitelistLoadStatus === "ready"
    ? String(personalWhitelistEntries.length)
    : whitelistLoadStatus === "loading" ? "…" : "—";
  if (whitelistLoadStatus === "loading" || whitelistLoadStatus === "error") {
    list.textContent = whitelistLoadStatus === "loading" ? '正在读取当前插件保存的白名单…' : '白名单读取失败，不能确认哪些账号受到保护。请先重试读取，再进行批量处理。';
    if (whitelistLoadStatus === "error") {
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.textContent = '重新读取白名单';
      retryButton.addEventListener("click", () => void refreshPersonalWhitelist());
      list.append(retryButton);
    }
    return;
  }
  if (!whitelistOwner) {
    list.textContent = '完成一次账号检测后，可管理这个 X 账号的白名单。';
    return;
  }
  if (!personalWhitelistEntries.length) {
    list.textContent = '当前这份插件里没有找到 @{owner} 的白名单。如果你之前保存过，请检查是否加载过另一份「取关狗」；先不要卸载旧插件。'.replace("{owner}", whitelistOwner || "?");
    return;
  }
  const ownerLabel = document.createElement("p");
  ownerLabel.className = "personal-note";
  ownerLabel.textContent = '当前账号 @{owner} 的白名单（保存在这份插件里）：'.replace("{owner}", whitelistOwner);
  list.append(ownerLabel);
  for (const user of personalWhitelistEntries) {
    const row = document.createElement("div");
    row.className = "personal-whitelist-item";
    const name = document.createElement("span");
    name.textContent = "@" + user.username;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = '移出白名单';
    remove.addEventListener("click", () => void changePersonalWhitelist(user.username, false, remove));
    row.append(name, remove);
    list.append(row);
  }
}

async function refreshPersonalWhitelist() {
  const expectedOwner = whitelistOwner;
  const token = ++whitelistLoadRequest;
  whitelistLoadStatus = "loading";
  whitelistLoadError = "";
  renderPersonalWhitelist();
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_PERSONAL_WHITELIST" });
    if (token !== whitelistLoadRequest || (expectedOwner && whitelistOwner !== expectedOwner)) return;
    if (!response?.ok) throw new Error(response?.error || "Whitelist unavailable");
    if (!expectedOwner && response.owner) whitelistOwner = normalizePersonalWhitelistHandle(response.owner);
    if (response.owner !== whitelistOwner) return;
    whitelistLoadStatus = "ready";
    applyPersonalWhitelistEntries(response.entries);
  } catch (error) {
    if (token !== whitelistLoadRequest || (expectedOwner && whitelistOwner !== expectedOwner)) return;
    whitelistLoadStatus = "error";
    whitelistLoadError = error?.message || String(error);
    console.warn("[QG] Failed to load local whitelist:", error);
    renderPersonalWhitelist();
  }
}

async function changePersonalWhitelist(username, protect, button) {
  if (!currentPersonalScan?.id || !whitelistOwner) return;
  if (button) button.disabled = true;
  const expectedOwner = whitelistOwner;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_PERSONAL_WHITELIST",
      scanId: currentPersonalScan.id,
      username,
      protect
    });
    if (!response?.ok) throw new Error(response?.error || '无法更新白名单');
    if (whitelistOwner === expectedOwner && response.owner === expectedOwner) {
      whitelistLoadStatus = "ready";
      applyPersonalWhitelistEntries(response.entries);
      toast(protect ? '已加入白名单' : '已移出白名单');
    }
  } catch (error) {
    toast(error?.message || '无法更新白名单');
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

const UI_STATE_KEY = "quguangouUiState";
const BATCH_SIZE = 20;

const VALUE_PROMO_STATE_KEY = "quguangouValuePromoStateV1";
let lastValuePromoViewName = null;
let valuePromoDecisionToken = 0;
let valuePromoDecisionQueue = Promise.resolve();

function promoRandomUnit() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 4294967296;
}

async function decideValuePromo(viewName, token) {
  const promo = $("#homeValuePromo");
  if (!promo) return;

  const stored = await chrome.storage.local.get(VALUE_PROMO_STATE_KEY);
  const state = stored?.[VALUE_PROMO_STATE_KEY] && typeof stored[VALUE_PROMO_STATE_KEY] === "object"
    ? stored[VALUE_PROMO_STATE_KEY]
    : {};
  const previous = state[viewName] && typeof state[viewName] === "object" ? state[viewName] : {};
  const visitCount = Math.max(0, Number(previous.visits) || 0) + 1;
  const previousShows = Math.max(0, Number(previous.shows) || 0);
  const previousMissStreak = Math.max(0, Number(previous.missStreak) || 0);
  const probability = getValuePromoProbability({ shows: previousShows, missStreak: previousMissStreak });
  const shouldShow = promoRandomUnit() < probability;

  state[viewName] = {
    visits: visitCount,
    shows: previousShows + (shouldShow ? 1 : 0),
    missStreak: shouldShow ? 0 : previousMissStreak + 1,
    probability,
    lastDecisionAt: Date.now()
  };
  await chrome.storage.local.set({ [VALUE_PROMO_STATE_KEY]: state });

  if (token !== valuePromoDecisionToken || lastValuePromoViewName !== viewName) return;
  promo.classList.toggle("hidden", !shouldShow);
  promo.dataset.view = viewName;
  promo.dataset.visit = String(visitCount);
  promo.dataset.probability = String(probability);
}

function scheduleValuePromo(view) {
  const viewName = getViewName(view);
  if (viewName === lastValuePromoViewName) return;

  lastValuePromoViewName = viewName;
  const token = ++valuePromoDecisionToken;
  const promo = $("#homeValuePromo");
  promo?.classList.add("hidden");
  valuePromoDecisionQueue = valuePromoDecisionQueue
    .then(() => decideValuePromo(viewName, token))
    .catch(() => {
      if (token === valuePromoDecisionToken && lastValuePromoViewName === viewName) {
        promo?.classList.toggle("hidden", promoRandomUnit() >= 0.35);
      }
    });
}

function getViewName(view) {
  if (view === personalView) return "personal";
  if (view === blocklistView) return "community";
  if (view === progressView) return "progress";
  return "mode";
}

function showOnly(view, remember = true) {
  [modeView, personalView, blocklistView, progressView].forEach((item) => item.classList.toggle("hidden", item !== view));
  scheduleValuePromo(view);
  if (remember) {
    void chrome.storage.local.set({
      [UI_STATE_KEY]: {
        view: getViewName(view),
        updatedAt: Date.now()
      }
    });
  }
}

function renderModeSelector() {
  $("#stickyValuePromo").classList.add("hidden");
  showOnly(modeView);
}

function clear(element) {
  element.replaceChildren();
}

async function loadBlocklist(force = false) {
  if (blocklist && !force) return blocklist;
  if (force) blocklist = null;
  if (!blocklistPromise) {
    blocklistPromise = chrome.runtime.sendMessage({ type: "GET_BLOCKLIST", locale: document.documentElement.lang })
      .then((response) => {
        if (!response?.ok) throw new Error(response?.error || "无法读取社区名单");
        blocklist = response.blocklist;
        return blocklist;
      })
      .finally(() => {
        blocklistPromise = null;
      });
  }
  return blocklistPromise;
}

async function loadPersonalScan() {
  const response = await chrome.runtime.sendMessage({ type: "GET_PERSONAL_SCAN" });
  if (!response?.ok) throw new Error(response?.error || "无法读取私人账号检测状态");
  currentPersonalScan = response.scan || null;
  return currentPersonalScan;
}

let toastHideTimer = null;
const pendingUiActions = new Set();
async function runUiAction(group, control, action) {
  if (pendingUiActions.has(group)) return;
  pendingUiActions.add(group);
  control?.setAttribute("aria-busy", "true");
  const originalLabel = control?.textContent ?? null;
  const modal = control?.closest(".support-modal");
  if (modal) modal.setAttribute("aria-busy", "true");
  try {
    await action();
  } catch (error) {
    if (control?.id === "communitySubmitConfirm" && control.isConnected) {
      control.textContent = originalLabel;
    }
    console.warn("[Followback Watchdog] UI action failed:", group, error);
    toast("请求未完成，请重试。");
  } finally {
    pendingUiActions.delete(group);
    if (control?.isConnected) control.removeAttribute("aria-busy");
    if (modal?.isConnected) modal.removeAttribute("aria-busy");
  }
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.remove("hidden");
  if (toastHideTimer !== null) clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => {
    node.classList.add("hidden");
    toastHideTimer = null;
  }, 2600);
}

function getSelectedPersonalUsernames() {
  const users = currentPersonalScan?.nonFollowers || [];
  return users
    .filter((user) => selectedPersonalHandles.has(String(user.username || "").toLowerCase()) && !isPersonalProtected(user))
    .map((user) => user.username);
}

function updatePersonalSelectionButton() {
  const count = getSelectedPersonalUsernames().length;
  const enabled = count > 0 && currentPersonalScan?.status === "completed";
  const blockButton = $("#personalBlockSelectedButton");
  const unfollowButton = $("#personalUnfollowSelectedButton");
  blockButton.disabled = !enabled;
  unfollowButton.disabled = !enabled;
  blockButton.textContent = count ? `一键拉黑（${count}）` : "一键拉黑";
  unfollowButton.textContent = count ? `一键取关（${count}）` : "一键取关对方";
}

function renderPersonalResultList(users = []) {
  const list = $("#personalResultList");
  clear(list);
  if (!users.length) {
    const empty = document.createElement("div");
    empty.className = "personal-result-empty";
    empty.textContent = '没有检测到未回关账号。';
    list.append(empty);
    updatePersonalSelectionButton();
    return;
  }

  for (const user of users) {
    const key = normalizePersonalWhitelistHandle(user.username);
    const protectedUser = isPersonalProtected(user);
    if (protectedUser) selectedPersonalHandles.delete(key);
    const row = document.createElement("div");
    row.className = "personal-result-row";
    row.classList.toggle("is-protected", protectedUser);

    const selectLabel = document.createElement("label");
    selectLabel.className = "personal-result-select";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !protectedUser && selectedPersonalHandles.has(key);
    checkbox.disabled = protectedUser;
    checkbox.setAttribute("aria-label", '选择 @' + user.username);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked && !isPersonalProtected(user)) selectedPersonalHandles.add(key);
      else selectedPersonalHandles.delete(key);
      updatePersonalSelectionButton();
    });

    let avatar;
    if (user.avatar) {
      avatar = document.createElement("img");
      avatar.className = "personal-avatar";
      avatar.src = user.avatar;
      avatar.alt = "";
      avatar.referrerPolicy = "no-referrer";
    } else {
      avatar = document.createElement("span");
      avatar.className = "personal-avatar-placeholder";
      avatar.textContent = (user.displayName || user.username || "?").slice(0, 1).toUpperCase();
    }
    const copy = document.createElement("span");
    copy.className = "personal-user-copy";
    const name = document.createElement("strong");
    name.textContent = user.displayName || "@" + user.username;
    const handle = document.createElement("small");
    handle.textContent = "@" + user.username;
    copy.append(name, handle);
    selectLabel.append(checkbox, avatar, copy);

    const protection = document.createElement("button");
    protection.type = "button";
    protection.className = "personal-protect-button";
    protection.classList.toggle("is-protected", protectedUser);
    protection.textContent = protectedUser ? '已保护' : '加入白名单';
    protection.setAttribute("aria-label", (protectedUser ? '移出白名单' : '加入白名单') + " @" + user.username);
    protection.addEventListener("click", () => void changePersonalWhitelist(user.username, !protectedUser, protection));
    row.append(selectLabel, protection);
    list.append(row);
  }
  updatePersonalSelectionButton();
}

function renderPersonalScan(scan = currentPersonalScan) {
  currentPersonalScan = scan || null;
  const running = scan?.status === "running";
  const paused = scan?.status === "paused";
  const completed = scan?.status === "completed";
  const failed = scan?.status === "failed";
  const cancelled = scan?.status === "cancelled";
  const stale = scan?.status === "stale";
  const phase = scan?.phase || "idle";
  const followingCount = Math.max(
    Number(scan?.progress?.following || 0),
    Number(scan?.followingCount || 0)
  );
  const followersCount = Math.max(
    Number(scan?.progress?.followers || 0),
    Number(scan?.followersCount || 0)
  );
  const profileFollowingCount = Number.isFinite(scan?.profileFollowingCount) ? scan.profileFollowingCount : null;
  const profileFollowingExact = Boolean(scan?.profileFollowingExact);
  const profileFollowersCount = Number.isFinite(scan?.profileFollowersCount) ? scan.profileFollowersCount : null;
  const profileFollowersExact = Boolean(scan?.profileFollowersExact);
  const completedCountMismatch = getCompletedScanCountMismatch(scan);
  const completedFollowerGap = completedFollowerCountGap(scan);
  const completionNeedsValidation = completed
    && profileFollowersCount === null
    && !scan?.progress?.followersUnknownEndValidated;
  const completionNeedsFullRescan = Boolean(completedCountMismatch);

  if (scan?.id !== selectedPersonalScanId) {
    selectedPersonalScanId = scan?.id || null;
    selectedPersonalHandles.clear();
  }
  const detectedOwner = normalizePersonalWhitelistHandle(scan?.username);
  if (detectedOwner && detectedOwner !== whitelistOwner) {
    whitelistOwner = detectedOwner;
    personalWhitelistEntries = [];
    whitelistLoadStatus = "loading";
    renderPersonalWhitelist();
    void refreshPersonalWhitelist();
  }

  const personalScanButton = $("#personalScanButton");
  personalView.classList.toggle("personal-completed-state", completed && !completionNeedsValidation && !completionNeedsFullRescan);
  personalView.classList.toggle("personal-stale-state", stale);
  personalScanButton.classList.toggle("personal-rescan", (completed && !completionNeedsValidation) || stale || completionNeedsFullRescan);
  personalScanButton.disabled = running;
  personalScanButton.textContent = paused
    ? "继续检测（从断点恢复）"
    : completionNeedsFullRescan
    ? "重新检测"
    : failed || completionNeedsValidation
      ? "继续检测"
      : completed || cancelled || stale
        ? "重新检测"
        : running ? "检测中…" : "开始检测";
  $("#personalCancelScanButton").classList.toggle("hidden", !running);
  $("#personalScanProgress").classList.toggle("hidden", !running && !paused);
  const rateLimitError = /HTTP_429|Too Many Requests|rate.?limit|请求过多/i.test(String(scan?.lastRecoverableError || scan?.pauseReason || ""));
  const untilMs = Number(scan?.rateLimitUntil || scan?.nextRecoveryAt || 0);
  const rateLimitCooling = rateLimitError && untilMs > Date.now();
  const retryTime = rateLimitCooling ? new Date(untilMs).toLocaleString() : "";
  const showRecovery = paused || rateLimitCooling || (running && scan?.recoveryPending && Number(scan?.consecutiveRecoveryCount || 0)>0);
  $("#personalRecoveryHint").classList.toggle("hidden", !showRecovery);
  $("#personalRecoveryHint").textContent = rateLimitCooling
    ? "X 返回 HTTP 429，当前正处于请求限流冷却。已保存的关注、粉丝和断点不会丢失。最早恢复时间：" + retryTime
      + (paused ? "。自动重试已暂停；点击继续检测也会等冷却结束再请求。" : "。冷却结束前不会重复请求 X，之后才会限次自动续扫。")
    : paused
      ? "X 列表持续报错，自动恢复已暂停。原有数据和断点已保存；请等 X 列表恢复正常后再手动继续。"
      : showRecovery
        ? "X 页面出错，插件会限次尝试恢复；如果仍失败会暂停并保留断点。"
        : "";

  const restartCopy = getScanRestartText(document.documentElement.lang);
  const stallKind = scanStallKind(scan, scanWindowHealth);
  const nearEndGap = remainingProfileCountGap(scan);
  const recoveryHelp = $("#personalStallHelp");
  recoveryHelp.classList.toggle("hidden", !running && !paused);
  recoveryHelp.classList.toggle("personal-help-attention", stallKind === "missing" || stallKind === "stalled");
  recoveryHelp.textContent = rateLimitCooling ? restartCopy.helpCooling
    : paused ? restartCopy.helpPaused
    : stallKind === "missing" ? restartCopy.helpMissing
    : stallKind === "stalled" ? restartCopy.helpStalled
    : nearEndGap ? restartCopy.helpTail.replace('{count}', String(nearEndGap.missing))
    : restartCopy.helpNormal;
  const forceButton = $("#personalForceRestartButton");
  forceButton.classList.toggle("hidden", !running && !paused);
  forceButton.textContent = rateLimitCooling ? restartCopy.schedule : restartCopy.restart;
  if (running || paused) {
    const message = rateLimitCooling
      ? restartCopy.limit + " " + retryTime + " · " + restartCopy.cooling
      : paused ? restartCopy.paused
      : scan?.recoveryPending ? restartCopy.recovering : "";
    $("#personalRecoveryHint").classList.toggle("hidden", !message);
    $("#personalRecoveryHint").textContent = message;
  }

  let phasePercent = { account: 8, following: 15, followers: 55, completed: 100 }[phase] || 0;
  if (phase === "following" && profileFollowingCount > 0) {
    phasePercent = 10 + Math.min(42, Math.round((followingCount / profileFollowingCount) * 42));
  } else if (phase === "followers" && profileFollowersCount > 0) {
    phasePercent = 55 + Math.min(40, Math.round((followersCount / profileFollowersCount) * 40));
  }
  $("#personalProgressBar").style.width = phasePercent + "%";

  if (running) {
    const resting = Boolean(scan?.progress?.resting);
    const recovering = Boolean(scan?.recoveryPending);
    const activeRelation = phase === "followers" ? "followers" : "following";
    const activeCount = activeRelation === "followers" ? followersCount : followingCount;
    const activeTotal = activeRelation === "followers" ? profileFollowersCount : profileFollowingCount;
    const activeExact = activeRelation === "followers" ? profileFollowersExact : profileFollowingExact;
    const activeLabel = activeRelation === "followers" ? "关注我的人" : "我关注的人";
    const firstStageStatus = profileFollowingCount > 0
      ? "第一阶段：" + followingCount + " / " + (profileFollowingExact ? "" : "约 ") + profileFollowingCount + (phase === "followers" ? " 已完成" : "")
      : "第一阶段：已读取 " + followingCount;
    const secondStageStatus = profileFollowersCount > 0
      ? "第二阶段：" + followersCount + " / " + (profileFollowersExact ? "" : "约 ") + profileFollowersCount
      : "第二阶段：已读取 " + followersCount;
    const stagePrefix = phase === "followers"
      ? firstStageStatus + " · " + secondStageStatus
      : firstStageStatus;
    const resumeActive = Boolean(scan?.progress?.[activeRelation + "ResumeActive"]);
    const resumeTarget = Math.max(activeCount, Number(scan?.progress?.[activeRelation + "ResumeTarget"] || 0));
    const resumeRatio = Number(scan?.progress?.[activeRelation + "ResumeRatio"] || 0);
    const cursorResumeActive = Boolean(scan?.progress?.[activeRelation + "CursorResumeActive"]);
    const cursorFromCheckpoint = Boolean(scan?.progress?.[activeRelation + "CursorResumeFromCheckpoint"]);
    const cursorResumePages = Number(scan?.progress?.[activeRelation + "CursorResumePages"] || 0);
    const cursorCheckpointReady = Boolean(scan?.progress?.[activeRelation + "Cursor"]);
    const scanPatienceNote = "如果进度连续 3 分钟没有变化，或找不到 X 扫描窗口，请看进度条下面的恢复办法。";

    $("#personalScanSummary").textContent = rateLimitCooling
      ? "@" + (scan.username || "当前账号") + " · HTTP 429 冷却中，最早恢复：" + retryTime
      : (stallKind === "missing" || stallKind === "stalled")
      ? "@" + (scan.username || "当前账号") + " · 读取暂时没有进展"
      : cursorResumeActive
      ? "@" + (scan.username || "当前账号") + (cursorFromCheckpoint ? " · 正在从上次位置继续" : " · 正在读取")
      : resumeActive
        ? "@" + (scan.username || "当前账号") + " · 正在定位旧版断点"
        : recovering
        ? "@" + (scan.username || "当前账号") + " · 自动恢复中" + (Number(scan.consecutiveRecoveryCount || 0) > 1 ? "（第 " + Number(scan.consecutiveRecoveryCount || 0) + " 次）" : "")
      : resting
        ? "@" + (scan.username || "当前账号") + " · 停留中"
        : scan.username
          ? "@" + scan.username + (phase === "followers" ? " · 第二阶段检测中" : " · 第一阶段检测中")
          : "正在识别当前登录账号…";

    if (cursorResumeActive) {
      const cursorPrefix = cursorFromCheckpoint ? "正在从上次位置继续…" : "正在快速读取…";
      $("#personalProgressText").textContent = activeTotal
        ? stagePrefix + "：" + cursorPrefix + " 已读取 " + cursorResumePages + " 页 · 已保存 " + activeCount + " / " + (activeExact ? "" : "约 ") + activeTotal + " 个" + activeLabel
        : stagePrefix + "：" + cursorPrefix + " 已保存 " + activeCount + " 个" + activeLabel + " · 总数暂未读取，不影响检测";
    } else if (resumeActive) {
      $("#personalProgressText").textContent = stagePrefix + " · 正在从上次位置继续，当前已保存 " + resumeTarget + " 个账号";
    } else if (recovering) {
      $("#personalProgressText").textContent = activeTotal
        ? stagePrefix + "：已保存 " + activeCount + " / " + (activeExact ? "" : "约 ") + activeTotal + " 个" + activeLabel + " · 等待自动续扫"
        : stagePrefix + "：已保存 " + activeCount + " 个" + activeLabel + " · 总数暂未读取，不影响检测 · 等待自动续扫";
    } else if (resting) {
      $("#personalProgressText").textContent = activeTotal
        ? stagePrefix + "：短暂停留中… 已扫描 " + activeCount + " / " + (activeExact ? "" : "约 ") + activeTotal + " 个" + activeLabel
        : stagePrefix + "：短暂停留中… 已扫描 " + activeCount + " 个" + activeLabel + " · 总数暂未读取，不影响检测";
    } else if (phase === "following" || phase === "followers") {
      $("#personalProgressText").textContent = (activeTotal
        ? stagePrefix + " · 正在扫描" + activeLabel
        : stagePrefix + " · 正在扫描" + activeLabel + "，总数暂未读取")
        + (cursorCheckpointReady ? " · 续扫进度已保存" : "");
    } else {
      $("#personalProgressText").textContent = "正在识别当前登录账号…";
    }

    $("#personalScanNote").textContent = cursorResumeActive
      ? (cursorFromCheckpoint
          ? "这次不会从第一页重新开始。取关狗会从上次保存的位置继续读取，少量重叠账号会自动去重。"
          : "当前位置已经保存。为避免 X 页面重载或触发异常，扫描期间不建议切换到其他页面，请耐心等待当前阶段完成。")
      : resumeActive
        ? "正在回到上次保存的位置，之前已读取的数据不会丢失。"
        : recovering
        ? (scan.recoveryMessage ? humanizeScanMessage(scan.recoveryMessage) : ("中断原因：" + humanizeScanMessage(scan.lastRecoverableError || "X 页面暂时没有返回可读取的数据") + " 已保存当前进度，正在自动继续，不需要重新检测。"))
        : resting
        ? "当前为第 " + (scan?.progress?.humanPauseCount || 1) + " 次短暂停留，结束后会自动继续。"
        : cursorCheckpointReady
          ? (phase === "followers"
              ? "第一阶段已经完成并保存。现在是第二阶段：读取关注你的人，用来和第一阶段进行比对；第二阶段完成后才会生成未回关名单。"
              : "第一阶段正在读取你关注的人。第一阶段完成后，还会进入第二阶段读取关注你的人；两边都完成后才会生成未回关名单。")
          : phase === "followers"
            ? "第一阶段已经完成并保存。现在是第二阶段：读取关注你的人，用来和第一阶段进行比对；第二阶段完成后才会生成未回关名单。"
            : "第一阶段正在读取你关注的人。第一阶段完成后，还会进入第二阶段读取关注你的人；两边都完成后才会生成未回关名单。";
    $("#personalScanNote").textContent += " " + scanPatienceNote;
  } else if (paused) {
    $("#personalScanSummary").textContent = "@" + (scan.username || "当前账号") + " · 已暂停（等待手动继续）";
    $("#personalProgressText").textContent = "第一阶段已保存 " + followingCount
      + " 个我关注的人 · 第二阶段已保存 " + followersCount + " 个关注我的人";
    $("#personalScanNote").textContent = "自动恢复已停止。当前数据和断点已保存；请先确认 X 的关注/粉丝列表可以正常加载，再点击“继续检测（从断点恢复）”。";
  } else if (completed) {
    if (completionNeedsFullRescan) {
      $("#personalScanSummary").textContent = "本次检测结果不完整";
      const localized = getScanRestartText(document.documentElement.lang);
      const relation = completedCountMismatch.relation === "followers" ? localized.relationFollowers : localized.relationFollowing;
      $("#personalScanNote").textContent = localized.incompleteCountWarning
        .replace("{relation}", relation)
        .replace("{actual}", String(completedCountMismatch.actual))
        .replace("{required}", String(completedCountMismatch.required))
        .replace("{missing}", String(completedCountMismatch.missing));
    } else if (completionNeedsValidation) {
      $("#personalScanSummary").textContent = "上次结果需要继续校验";
      $("#personalScanNote").textContent = getScanRestartText(document.documentElement.lang).needsValidationNote;
    } else {
      $("#personalScanSummary").textContent = "@" + (scan.username || "当前账号") + " · 检测完成";
      $("#personalScanNote").textContent = getScanRestartText(document.documentElement.lang).completedNote;
      if (completedFollowerGap) $("#personalScanNote").textContent += " " + getScanRestartText(document.documentElement.lang).completedGapWarning.replace("{count}", String(completedFollowerGap.missing));
    }
  } else if (failed) {
    $("#personalScanSummary").textContent = "检测暂时中断";
    $("#personalScanNote").textContent = humanizeScanMessage(scan.error || "检测过程中发生错误。") + " 已保存的数据仍然保留；点击“继续检测”会从已保存进度继续。";
  } else if (cancelled) {
    $("#personalScanSummary").textContent = "检测已停止";
    $("#personalScanNote").textContent = "没有生成完整名单。重新检测后会从头扫描。";
  } else if (stale) {
    $("#personalScanSummary").textContent = "上次检测结果需要更新";
    $("#personalScanNote").textContent = scan.staleReason || "关注关系可能已经变化，请重新检测后再处理。";
  } else {
    $("#personalScanSummary").textContent = "尚未检测";
    $("#personalProgressText").textContent = "";
    $("#personalScanNote").textContent = "检测只读取当前关注关系，不会自动取关或拉黑任何账号。";
  }

  // Keep the actual progress/error explanation above; the previous generic
  // replacement hid the reason for a stalled scan.

  $("#personalResultView").classList.toggle("hidden", !completed || completionNeedsValidation || completionNeedsFullRescan);
  if (completed) {
    const nonFollowers = scan.nonFollowers || [];
    const totalFollowing = Number.isInteger(scan.followingCount) ? scan.followingCount : followingCount;
    $("#personalFollowingCount").textContent = totalFollowing;
    $("#personalMutualCount").textContent = Number.isInteger(scan.mutualCount) ? scan.mutualCount : Math.max(0, totalFollowing - nonFollowers.length);
    $("#personalNonFollowerCount").textContent = nonFollowers.length;
    renderPersonalResultList(nonFollowers);
  } else {
    clear($("#personalResultList"));
    selectedPersonalHandles.clear();
    updatePersonalSelectionButton();
  }
}

async function openPersonalView() {
  $("#stickyValuePromo").classList.add("hidden");
  showOnly(personalView);
  try {
    await loadPersonalScan();
    renderPersonalScan(currentPersonalScan);
  } catch (error) {
    renderPersonalScan(null);
    toast(error.message || String(error));
  }
}

function renderBlocklist() {
  $("#blocklistDescription").textContent = "这是取关狗持续整理和维护的 X 社区共享名单，线索来自公开信息和用户提交。名单会持续更新。点击下方按钮，将在当前登录的 X 账号中分批拉黑名单中的账号。";
  $("#blocklistSummary").textContent =
    "当前名单共 " + blocklist.targets.length + " 个账号 · 持续更新";
  const targetList = $("#targetList");
  clear(targetList);
  blocklist.targets.forEach((target, index) => {
    const row = document.createElement("div");
    row.className = "target-row";
    const number = document.createElement("span");
    number.className = "index";
    number.textContent = index + 1;
    const label = document.createElement("span");
    label.textContent = target.label;
    row.append(number, label);
    targetList.append(row);
  });

  const issues = [];
  if (blocklist.remoteWarning) issues.push("在线审核名单暂时无法读取，本次先使用内置名单。");
  if (blocklist.duplicates.length) issues.push(`名单中已自动移除 ${blocklist.duplicates.length} 个重复项`);
  for (const item of blocklist.invalid) issues.push(`${item.raw || "空白项"}：${item.error}`);
  const issueList = $("#issueList");
  clear(issueList);
  issues.forEach((issue) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = issue;
    issueList.append(paragraph);
  });
  const batchCount = Math.ceil(blocklist.targets.length / BATCH_SIZE);
  $("#batchGuide").textContent = blocklist.targets.length
    ? `为了避免操作过快，每批最多处理 ${BATCH_SIZE} 个账号。每批结束后休息 30 分钟，再由你手动继续。当前名单预计需要 ${batchCount} 批。`
    : "当前没有需要处理的账号。";
  $("#startButton").disabled = blocklist.targets.length === 0;
  $("#startButton").textContent = blocklist.targets.length ? `开始处理第 1 批（最多 ${BATCH_SIZE} 个）` : "当前无账号可处理";
  $("#stickyValuePromo").classList.add("hidden");
  showOnly(blocklistView);
}


function humanizeScanMessage(message) {
  const text = String(message || "").replace(/^SCAN_RECOVERABLE:/, "").trim();
  if (!text) return "X 页面暂时没有返回完整数据";
  if (/HTTP[_ ]?\d+|GRAPHQL|HOOK_|NO_RESULT|CURSOR_/i.test(text)) return "X 暂时没有继续返回名单数据，已保存当前进度，可以继续检测。";
  if (/No tab with id|tab.*not found|The tab was closed|Invalid tab ID/i.test(text)) return "检测页面意外关闭，已保存当前进度，可以继续检测。";
  return text;
}

function humanizePauseReason(reason) {
  const text = String(reason || "").trim();
  if (!text) return "";
  if (/系统性失败|No tab with id|tab.*not found|页面已保留在浏览器标签页/i.test(text)) {
    return "这个账号没有处理成功，任务已暂停。前面已经处理完成的账号不会重复，你可以决定是否继续剩余账号。";
  }
  return text;
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
function renderJob(job) {
  if (!job) return;
  currentJob = job;
  const uiLocale = document.documentElement.lang;
  const currentPartition = uiLocale === "zh-CN" || uiLocale === "zh-TW" ? "zh" : uiLocale;
  const taskPartition = job.communityLocale || "zh"; // Pre-0.2.71 saved jobs are Chinese.
  if (taskPartition !== currentPartition) {
    renderModeSelector();
    toast("当前任务属于其他语言分区。请切换回开始该任务时的语言，才能继续管理。");
    return;
  }
  showOnly(progressView);
  const done = Number.isInteger(job.currentIndex) ? job.currentIndex : job.results.length;
  const total = job.targets.length;
  const batchSize = job.batchSize || BATCH_SIZE;
  const totalBatches = Math.max(1, Math.ceil(total / batchSize));
  const running = job.status === "running";
  const completed = job.status === "completed";
  const atBatchBoundary = job.status === "paused"
    && done > 0
    && done < total
    && done % batchSize === 0
    && Boolean(job.resumeAt);
  const batchPaused = job.status === "paused" && (job.pauseKind === "batch" || atBatchBoundary);
  const cooling = batchPaused && job.resumeAt && job.resumeAt > Date.now();
  let batchNumber = job.batchNumber || Math.min(totalBatches, Math.floor(done / batchSize) + 1);
  if (completed) batchNumber = totalBatches;
  else if (batchPaused && !job.batchNumber) batchNumber = Math.max(1, Math.ceil(done / batchSize));
  const batchStart = Number.isInteger(job.batchStartIndex) ? job.batchStartIndex : Math.max(0, (batchNumber - 1) * batchSize);
  const batchEnd = Number.isInteger(job.batchEndIndex) ? job.batchEndIndex : Math.min(batchStart + batchSize, total);
  const batchDone = Math.max(0, Math.min(done, batchEnd) - batchStart);
  const batchTotal = Math.max(1, batchEnd - batchStart);
  const percent = total ? Math.round((done / total) * 100) : 0;
  $("#progressBar").style.width = `${percent}%`;
  const actionLabel = job.mode === "personal" && job.action === "unfollow" ? "取关" : "拉黑";
  $("#progressTitle").textContent = running
    ? `正在${actionLabel}`
    : completed
      ? `${actionLabel}处理完成`
      : batchPaused
        ? cooling ? "本批已完成，正在休息" : "本批处理完成"
        : "任务已暂停";
  $("#batchStatus").textContent = completed
    ? `共 ${totalBatches} 批 · 已全部完成`
    : batchPaused
      ? cooling
        ? `第 ${batchNumber} / ${totalBatches} 批已完成 · 本批已处理 ${batchDone || batchSize} 个`
        : `第 ${batchNumber} / ${totalBatches} 批已完成 · 可以手动继续下一批`
      : `第 ${batchNumber} / ${totalBatches} 批 · 每批最多 ${batchSize} 个`;

  const resumeTime = job.resumeAt
    ? new Date(job.resumeAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  $("#progressText").textContent = running
    ? `本批 ${batchDone} / ${batchTotal} · 总进度 ${done} / ${total}${job.currentTarget ? ` · 正在${actionLabel} ${job.currentTarget.label}` : ""}`
    : batchPaused
      ? cooling
        ? `总进度 ${done} / ${total} · 为避免操作过快，休息 30 分钟 · ${resumeTime} 后可继续下一批`
        : `总进度 ${done} / ${total} · 冷却已结束，可以继续下一批`
      : `总进度 ${done} / ${total}${job.pauseReason ? ` · ${humanizePauseReason(job.pauseReason)}` : ""}`;

  const statusLabel = {
    blocked: "已拉黑",
    already_blocked: "已拉黑过",
    unfollowed: "已取关",
    already_unfollowed: "已取关过",
    skipped_whitelist: '白名单保护 · 已跳过',
    skipped_following_back: "已回关 · 跳过",
    skipped_restricted: "已跳过",
    skipped_subscription: "已跳过",
    failed: "失败"
  };
  const resultList = $("#resultList");
  clear(resultList);
  // Only show results from the batch currently displayed above.
  // Historical results stay in job.results; they are simply not mixed into the active batch UI.
  const visibleBatchResults = job.results.slice(batchStart, Math.min(done, batchEnd));
  visibleBatchResults.forEach((result) => {
    const row = document.createElement("div");
    row.classList.add("result-row", result.status);
    const detail = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = result.label;
    detail.append(label);
    if (["failed", "skipped_following_back", "skipped_restricted", "skipped_subscription"].includes(result.status)) {
      if (["skipped_restricted", "skipped_subscription"].includes(result.status) && result.title) {
        const noticeTitle = document.createElement("small");
        noticeTitle.className = "result-notice-title";
        noticeTitle.textContent = result.title;
        detail.append(noticeTitle);
      }
      const reason = document.createElement("small");
      reason.textContent = result.status === "failed"
        ? humanizeActionFailureReason(result.reason)
        : (result.reason || "已自动跳过");
      detail.append(reason);
    }
    const status = document.createElement("span");
    status.textContent = statusLabel[result.status] || result.status;
    row.append(detail, status);
    resultList.append(row);
  });
  const valuePromo = $("#valuePromo");
  const cancelButton = $("#cancelButton");
  const endTaskButton = $("#endTaskButton");
  const newTaskButton = $("#newTaskButton");
  const contributionPanel = $("#communityContributionPanel");
  const contributionButton = $("#openCommunitySubmitButton");
  const action = job.action || "block";
  const allowedStatuses = action === "unfollow"
    ? ["unfollowed", "already_unfollowed"]
    : ["blocked", "already_blocked"];
  const contributable = job.mode === "personal"
    ? job.results.filter((result) => allowedStatuses.includes(result.status))
    : [];
  const promptSchedule = (Array.isArray(job.communityPromptPauseBatches)
    && typeof job.communityPromptOnCompletion === "boolean")
    ? { pauseBatches: job.communityPromptPauseBatches, showOnCompletion: job.communityPromptOnCompletion }
    : planCommunityPromptSchedule(total, batchSize, job.id || job.startedAt || "personal-task");
  const pausePromptDue = batchPaused && promptSchedule.pauseBatches.includes(batchNumber);
  const completionPromptDue = completed && promptSchedule.showOnCompletion && contributable.length > 0;
  const contributionVisible = job.mode === "personal"
    && !job.communityShareOptIn
    && (pausePromptDue || completionPromptDue);
  contributionPanel.classList.toggle("hidden", !contributionVisible);
  if (contributionVisible) {
    $("#communityContributionTitle").textContent = "要把这次任务的账号加入社区名单吗？";
    $("#communityContributionCopy").textContent = batchPaused
      ? "如果选择加入，这次任务里所有成功拉黑或取关的账号都会加入社区名单，不只是当前这一批。后面批次成功处理的账号也会一起加入。"
      : "如果选择加入，这次任务里所有成功拉黑或取关的账号都会一起加入社区名单。";
    contributionButton.disabled = false;
    contributionButton.textContent = "全部加入社区名单";
  }
  valuePromo.classList.add("hidden");
  $("#stickyValuePromo").classList.add("hidden");
  $("#progressBackButton").classList.toggle("hidden", running || completed);
  cancelButton.classList.toggle("hidden", !running);
  const canEndTask = !running && !completed && done < total;
  endTaskButton.classList.toggle("hidden", !canEndTask);
  newTaskButton.classList.toggle("hidden", running);
  if (completed && job.mode === "personal") {
    valuePromo.before(newTaskButton);
  } else {
    cancelButton.after(newTaskButton);
  }
  $("#newTaskButton").disabled = Boolean(cooling);
  $("#cooldownAdvice").classList.toggle("hidden", !cooling);
  $("#skipCooldownButton").classList.toggle("hidden", !cooling);
  $("#newTaskButton").textContent = completed
    ? job.mode === "personal" ? "返回私人账号模式" : "返回社区共享名单"
    : batchPaused
      ? cooling
        ? `正在休息 · ${resumeTime} 后继续下一批`
        : `继续处理第 ${Math.min(batchNumber + 1, totalBatches)} 批`
      : "继续剩余账号";
}

$("#communityModeButton").addEventListener("click", () => void runUiAction("community-load", $("#communityModeButton"), async () => {
  if (currentJob?.mode === "community") {
    renderJob(currentJob);
    return;
  }
  if (currentJob?.mode === "personal") {
    toast("当前有私人账号任务，请先处理该任务");
    renderJob(currentJob);
    return;
  }
  try {
    await loadBlocklist(true);
    if (!modeView.classList.contains("hidden")) renderBlocklist();
  } catch (error) {
    toast(error.message || String(error));
  }
}));
$("#personalModeButton").addEventListener("click", () => {
  if (currentJob?.mode === "personal") {
    renderJob(currentJob);
    return;
  }
  if (currentJob?.mode === "community"
      && ["running", "paused", "cancelled"].includes(currentJob.status)
      && currentJob.currentIndex < currentJob.targets.length) {
    toast("当前有未完成的社区名单任务，请先继续或结束该任务");
    renderJob(currentJob);
    return;
  }
  void openPersonalView();
});
$("#communityBackButton").addEventListener("click", () => renderModeSelector());
$("#personalBackButton").addEventListener("click", () => renderModeSelector());
$("#progressBackButton").addEventListener("click", () => renderModeSelector());

$("#personalScanButton").addEventListener("click", () => void runUiAction("personal-scan", $("#personalScanButton"), async () => {
  const type = currentPersonalScan?.status === "paused" ? "RESUME_PERSONAL_SCAN" : "START_PERSONAL_SCAN";
  const response = await chrome.runtime.sendMessage({ type });
  if (!response?.ok) return toast(response?.error || "无法开始检测");
  currentPersonalScan = response.scan;
  renderPersonalScan(currentPersonalScan);
}));

$("#personalForceRestartButton").addEventListener("click", () =>
  void runUiAction("force-scan-restart", $("#personalForceRestartButton"), async () => {
    const copy = getScanRestartText(document.documentElement.lang);
    const response = await chrome.runtime.sendMessage({type:"FORCE_RESTART_PERSONAL_SCAN_WINDOW"});
    if (!response?.ok) {
      const detail = document.documentElement.lang === "zh-CN" ? response?.error : null;
      toast(detail || copy.fail);
      return;
    }
    currentPersonalScan = response.scan || currentPersonalScan;
    renderPersonalScan(currentPersonalScan);
    toast(response.scheduled ? copy.scheduled : copy.restarted);
  })
);

$("#personalCancelScanButton").addEventListener("click", () => void runUiAction("personal-scan", $("#personalCancelScanButton"), async () => {
  const response = await chrome.runtime.sendMessage({ type: "PAUSE_PERSONAL_SCAN" });
  if (!response?.ok) return toast(response?.error || "无法停止检测");
  currentPersonalScan = response.scan || null;
  renderPersonalScan(currentPersonalScan);
}));

$("#personalSelectAllButton").addEventListener("click", () => {
  const users = currentPersonalScan?.nonFollowers || [];
  selectedPersonalHandles.clear();
  users.filter((user) => !isPersonalProtected(user))
    .forEach((user) => selectedPersonalHandles.add(normalizePersonalWhitelistHandle(user.username)));
  renderPersonalResultList(users);
});

$("#personalClearSelectionButton").addEventListener("click", () => {
  selectedPersonalHandles.clear();
  renderPersonalResultList(currentPersonalScan?.nonFollowers || []);
});

function openPersonalActionConfirm(action) {
  const usernames = getSelectedPersonalUsernames();
  if (!usernames.length) return;
  pendingPersonalAction = action === "unfollow" ? "unfollow" : "block";
  emptyWhitelistWarningShown = whitelistLoadStatus === "ready" && personalWhitelistEntries.length === 0;
  const isUnfollow = pendingPersonalAction === "unfollow";
  $("#personalBlockConfirmTitle").textContent = isUnfollow ? "取关所选账号？" : "拉黑所选账号？";
  $("#personalBlockConfirmCopy").textContent = "你选择了 " + usernames.length + " 个未回关账号。确认后会开始第 1 批，单批最多处理 " + BATCH_SIZE + " 个。";
  $("#personalBlockConfirmWarning").textContent = isUnfollow
    ? "确认后会逐个取消关注这些账号；每批最多 20 个，批次结束后冷却 30 分钟。执行前仍会检查账号与关系状态。"
    : "确认后会逐个拉黑这些账号；每批最多 20 个，批次结束后冷却 30 分钟。执行前仍会检查账号与关系状态。";
  if (emptyWhitelistWarningShown) {
    $("#personalBlockConfirmWarning").textContent += " " +
      getScanRestartText(document.documentElement.lang).emptyWhitelistConfirm;
  }
  const confirmButton = $("#personalBlockConfirmButton");
  confirmButton.textContent = isUnfollow ? "确认取关并开始第 1 批" : "确认拉黑并开始第 1 批";
  confirmButton.classList.toggle("danger", !isUnfollow);
  confirmButton.classList.toggle("personal-unfollow", isUnfollow);
  setPersonalBlockConfirmOpen(true);
}

$("#personalBlockSelectedButton").addEventListener("click", () => openPersonalActionConfirm("block"));
$("#personalUnfollowSelectedButton").addEventListener("click", () => openPersonalActionConfirm("unfollow"));

$("#startButton").addEventListener("click", () => void runUiAction("batch-job", $("#startButton"), async () => {
  if (!blocklist?.targets.length) return;
  const response = await chrome.runtime.sendMessage({ type: "START_BUNDLED_JOB", locale: document.documentElement.lang });
  if (!response?.ok) {
    toast(response?.error || "任务启动失败");
    return;
  }
  renderJob(response.job);
}));

$("#cancelButton").addEventListener("click", () => void runUiAction("batch-job", $("#cancelButton"), async () => {
  const response = await chrome.runtime.sendMessage({ type: "CANCEL_JOB" });
  if (!response?.ok) return toast(response?.error || "请求未完成，请重试。");
  if (response.job) renderJob(response.job);
}));

$("#endTaskButton").addEventListener("click", () => void runUiAction("batch-job", $("#endTaskButton"), async () => {
  const button = $("#endTaskButton");
  if (!currentJob || button.dataset.confirming === "1") return;
  button.dataset.confirming = "1";
  try {
  const ok = await window.QGDConfirmEndTask();
  if (!ok) return;
  const response = await chrome.runtime.sendMessage({ type: "END_JOB" });
  if (!response?.ok) return toast(response?.error || "无法结束任务");
  currentJob = null;
  renderModeSelector();
  if (response.cooldownUntil > Date.now()) {
    const until = new Date(response.cooldownUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    toast("任务已结束；全局冷却仍保留到 " + until);
  } else {
    toast("任务已结束");
  }
  } finally {
    button.dataset.confirming = "";
  }
}));

$("#newTaskButton").addEventListener("click", () => void runUiAction("batch-job", $("#newTaskButton"), async () => {
  if (currentJob && currentJob.currentIndex < currentJob.targets.length) {
    const response = await chrome.runtime.sendMessage({ type: "RESUME_JOB" });
    if (!response?.ok) return toast(response?.error || "无法继续任务");
    renderJob(response.job);
    return;
  }

  const finishedMode = currentJob?.mode || "community";
  await chrome.storage.local.remove("quguangouJob");
  currentJob = null;
  if (finishedMode === "personal") {
    await openPersonalView();
    return;
  }
  try {
    await loadBlocklist(true);
    renderBlocklist();
  } catch (error) {
    toast(error.message || String(error));
    renderModeSelector();
  }
}));

// Keep the personal scan panel in sync even if an MV3 runtime message is missed.
// All reads below belong to THIS Chrome profile; separate profiles do not share scan state.
const PERSONAL_SCAN_STORAGE_KEY = "quguangouPersonalScan";
let personalScanPollBusy = false;

function acceptPersonalScanUpdate(nextScan) {
  const previous = currentPersonalScan;
  if (previous?.id && previous.id === nextScan?.id
      && previous.status === "running" && nextScan.status === "running") {
    // A delayed storage snapshot must not visually roll saved progress backwards.
    const count = (scan, phase) => Math.max(
      Number(scan?.progress?.[phase] || 0),
      Number(scan?.[phase === "following" ? "followingCount" : "followersCount"] || 0)
    );
    if (count(nextScan, "following") < count(previous, "following")
        || count(nextScan, "followers") < count(previous, "followers")) return;
  }
  currentPersonalScan = nextScan || null;
  if (!personalView.classList.contains("hidden")) {
    renderPersonalScan(currentPersonalScan);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "JOB_UPDATED") renderJob(message.job);
  if (message?.type === "PERSONAL_SCAN_UPDATED") {
    acceptPersonalScanUpdate(message.scan || null);
  }
});

// Storage notifications survive missed runtime broadcasts in a long-lived side panel.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[PERSONAL_WHITELIST_STORAGE_KEY]
      || changes["quguangouPersonalWhitelistBackupV1"]
      || changes["quguangouPersonalWhitelistOwnerEvidenceV1"]) {
    void refreshPersonalWhitelist();
  }
  if (changes[PERSONAL_SCAN_STORAGE_KEY]) {
    acceptPersonalScanUpdate(changes[PERSONAL_SCAN_STORAGE_KEY].newValue || null);
  }
});

// A lightweight heartbeat repairs a panel that was open before the scan began.
// Do not call GET_PERSONAL_SCAN repeatedly: that would rehydrate large checkpoints.
setInterval(async () => {
  if (personalScanPollBusy || document.hidden || personalView.classList.contains("hidden")) return;
  if (currentPersonalScan && currentPersonalScan.status !== "running") return;
  personalScanPollBusy = true;
  try {
    const snapshot = await chrome.storage.local.get(PERSONAL_SCAN_STORAGE_KEY);
    const savedScan = snapshot[PERSONAL_SCAN_STORAGE_KEY] || null;
    if (savedScan) acceptPersonalScanUpdate(savedScan);
    if (currentPersonalScan?.status === "running") {
      const health = await chrome.runtime.sendMessage({ type: "GET_PERSONAL_SCAN_HEALTH" });
      if (health?.ok) scanWindowHealth = health;
      renderPersonalScan(currentPersonalScan);
    }
  } catch (error) {
    console.warn("[取关狗] 检测进度同步暂时失败", error);
  } finally {
    personalScanPollBusy = false;
  }
}, 5000);


const personalBlockConfirmPanel = $("#personalBlockConfirmPanel");
const communitySubmitConfirmPanel = $("#communitySubmitConfirmPanel");
const cooldownRiskPanel = $("#cooldownRiskPanel");
const supportPanel = $("#supportPanel");
const feedbackPanel = $("#feedbackPanel");

function setPersonalBlockConfirmOpen(open) {
  personalBlockConfirmPanel.hidden = !open;
}

$("#personalBlockConfirmCancel").addEventListener("click", () => setPersonalBlockConfirmOpen(false));
$("#personalBlockConfirmClose").addEventListener("click", () => setPersonalBlockConfirmOpen(false));
personalBlockConfirmPanel.querySelector("[data-personal-block-close]").addEventListener("click", () => setPersonalBlockConfirmOpen(false));
$("#personalBlockConfirmButton").addEventListener("click", () => void runUiAction("personal-action", $("#personalBlockConfirmButton"), async () => {
  const usernames = getSelectedPersonalUsernames();
  if (whitelistLoadStatus !== "ready") {
    void refreshPersonalWhitelist();
    return toast(getScanRestartText(document.documentElement.lang).whitelistNotLoaded);
  }
  if (!usernames.length || !currentPersonalScan?.id) {
    setPersonalBlockConfirmOpen(false);
    return toast("当前没有可处理的未回关账号");
  }

  const button = $("#personalBlockConfirmButton");
  const response = await chrome.runtime.sendMessage({
    type: "START_PERSONAL_ACTION_JOB",
    locale: document.documentElement.lang,
    action: pendingPersonalAction,
    scanId: currentPersonalScan.id,
    acknowledgeEmptyWhitelist: emptyWhitelistWarningShown && whitelistLoadStatus === "ready",
    usernames
  });

  if (!response?.ok) return toast(response?.error || "无法开始私人名单任务");
  setPersonalBlockConfirmOpen(false);
  selectedPersonalHandles.clear();
  currentJob = response.job;
  renderJob(response.job);
}));

function getContributableEntries(job = currentJob) {
  if (!job || job.mode !== "personal") return [];
  const action = job.action === "unfollow" ? "unfollow" : "block";
  const allowedStatuses = action === "unfollow"
    ? ["unfollowed", "already_unfollowed"]
    : ["blocked", "already_blocked"];
  const submitted = new Set((job.communitySubmittedHandles || []).map((value) => String(value || "").toLowerCase()));
  const seen = new Set();

  return (job.results || [])
    .filter((result) => allowedStatuses.includes(result.status))
    .map((result) => ({
      username: String(result.username || "").replace(/^@/, "").trim(),
      label: result.label || ("@" + String(result.username || "").replace(/^@/, "").trim()),
      status: result.status
    }))
    .filter((entry) => {
      const key = entry.username.toLowerCase();
      if (!/^[A-Za-z0-9_]{1,15}$/.test(entry.username) || submitted.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function setCommunitySubmitOpen(open) {
  communitySubmitConfirmPanel.hidden = !open;
}

$("#openCommunitySubmitButton").addEventListener("click", () => {
  if (!currentJob?.id || currentJob.mode !== "personal") return toast("当前没有可加入社区名单的私人账号任务");
  $("#communitySubmitTitle").textContent = "确认全部加入社区名单？";
  $("#communitySubmitCopy").textContent = currentJob.status === "completed"
    ? "确认后，这次任务里所有成功拉黑或取关的账号都会一起加入社区名单。"
    : "确认后，这次任务里所有成功拉黑或取关的账号都会加入社区名单。后面批次成功处理的账号也会一起加入，不只是当前这一批。";
  setCommunitySubmitOpen(true);
});

$("#communitySubmitCancel").addEventListener("click", () => setCommunitySubmitOpen(false));
$("#communitySubmitClose").addEventListener("click", () => setCommunitySubmitOpen(false));
communitySubmitConfirmPanel.querySelector("[data-community-submit-close]").addEventListener("click", () => setCommunitySubmitOpen(false));

$("#communitySubmitConfirm").addEventListener("click", () => void runUiAction("community-submit", $("#communitySubmitConfirm"), async () => {
  if (!currentJob?.id) {
    setCommunitySubmitOpen(false);
    return toast("当前任务已经结束");
  }

  const button = $("#communitySubmitConfirm");
  button.textContent = "正在保存选择…";
  const response = await chrome.runtime.sendMessage({
    type: "SUBMIT_COMMUNITY_CANDIDATES",
    jobId: currentJob.id
  });

  button.textContent = "全部加入";
  if (!response?.ok) return toast(response?.error || "暂时无法保存这个选择");

  if (response.job) {
    currentJob = response.job;
  } else {
    const submitted = new Set((currentJob.communitySubmittedHandles || []).map((value) => String(value || "").toLowerCase()));
    (response.submittedHandles || []).forEach((username) => submitted.add(String(username || "").toLowerCase()));
    currentJob.communitySubmittedHandles = [...submitted];
    currentJob.communitySubmittedAt = new Date().toISOString();
    currentJob.communitySubmittedCount = submitted.size;
  }

  setCommunitySubmitOpen(false);
  renderJob(currentJob);
  toast(response?.deferred
    ? "已选择：这次任务全部成功处理的账号都会加入社区名单"
    : "这次任务成功处理的账号已加入社区名单");
}));

function setCooldownRiskOpen(open) {
  cooldownRiskPanel.hidden = !open;
}

$("#skipCooldownButton").addEventListener("click", () => setCooldownRiskOpen(true));
$("#keepCoolingButton").addEventListener("click", () => setCooldownRiskOpen(false));
$("#cooldownRiskClose").addEventListener("click", () => setCooldownRiskOpen(false));
cooldownRiskPanel.querySelector("[data-cooldown-close]").addEventListener("click", () => setCooldownRiskOpen(false));
$("#confirmSkipCooldownButton").addEventListener("click", () => void runUiAction("batch-job", $("#confirmSkipCooldownButton"), async () => {
  const response = await chrome.runtime.sendMessage({ type: "SKIP_COOLDOWN" });
  if (!response?.ok) return toast(response?.error || "无法跳过冷却");
  setCooldownRiskOpen(false);
  renderJob(response.job);
}));
function setSupportOpen(open) {
  supportPanel.hidden = !open;
  $("#supportToggle").setAttribute("aria-expanded", String(open));
}
function setFeedbackOpen(open) {
  feedbackPanel.hidden = !open;
  $("#feedbackToggle").setAttribute("aria-expanded", String(open));
}
$("#supportToggle").addEventListener("click", () => setSupportOpen(true));
$("#supportClose").addEventListener("click", () => setSupportOpen(false));
supportPanel.querySelector("[data-support-close]").addEventListener("click", () => setSupportOpen(false));
$("#feedbackToggle").addEventListener("click", () => setFeedbackOpen(true));
$("#feedbackClose").addEventListener("click", () => setFeedbackOpen(false));
feedbackPanel.querySelector("[data-feedback-close]").addEventListener("click", () => setFeedbackOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!personalBlockConfirmPanel.hidden && !personalBlockConfirmPanel.hasAttribute("aria-busy")) setPersonalBlockConfirmOpen(false);
  if (!communitySubmitConfirmPanel.hidden && !communitySubmitConfirmPanel.hasAttribute("aria-busy")) setCommunitySubmitOpen(false);
  if (!cooldownRiskPanel.hidden && !cooldownRiskPanel.hasAttribute("aria-busy")) setCooldownRiskOpen(false);
  if (!supportPanel.hidden) setSupportOpen(false);
  if (!feedbackPanel.hidden) setFeedbackOpen(false);
});

async function initialize() {
  const [jobResponse, scanResponse, uiStateResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_JOB" }),
    chrome.runtime.sendMessage({ type: "GET_PERSONAL_SCAN" }),
    chrome.storage.local.get(UI_STATE_KEY)
  ]);
  currentJob = jobResponse?.job || null;
  currentPersonalScan = scanResponse?.scan || null;
  if (!currentPersonalScan?.username) void refreshPersonalWhitelist();
  const rememberedView = uiStateResponse?.[UI_STATE_KEY]?.view || "mode";

  if (currentJob?.status === "running" && ["community", "personal"].includes(currentJob.mode)) {
    renderJob(currentJob);
    return;
  }

  if (currentPersonalScan?.status === "running") {
    showOnly(personalView);
    renderPersonalScan(currentPersonalScan);
    return;
  }

  if (currentJob && ["community", "personal"].includes(currentJob.mode)) {
    renderJob(currentJob);
    return;
  }

  if (rememberedView === "personal") {
    showOnly(personalView);
    renderPersonalScan(currentPersonalScan);
    return;
  }

  if (rememberedView === "community") {
    try {
      await loadBlocklist();
      renderBlocklist();
      return;
    } catch (error) {
      toast(error.message || String(error));
    }
  }

  renderModeSelector();
}

initialize().catch((error) => toast(error.message || String(error)));

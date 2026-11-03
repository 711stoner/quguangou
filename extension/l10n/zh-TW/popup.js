import { getScanRestartText } from "../../lib/scan-restart-text.js";
import { scanStallKind } from "../../lib/scan-stall-help.js";
import { remainingProfileCountGap, completedFollowerCountGap } from "../../lib/scan-last-mile.js";
import { getCompletedScanCountMismatch } from "../../lib/relations.js";
import { getValuePromoProbability } from "../../lib/value-promo.js";
import { planCommunityPromptSchedule } from "../../lib/community-share.js";

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
    list.textContent = whitelistLoadStatus === "loading" ? '正在讀取這份擴充功能儲存的白名單…' : '無法讀取白名單，因此還不能確認哪些帳號受到保護。請先重新讀取，再進行批次處理。';
    if (whitelistLoadStatus === "error") {
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.textContent = '重新讀取白名單';
      retryButton.addEventListener("click", () => void refreshPersonalWhitelist());
      list.append(retryButton);
    }
    return;
  }
  if (!whitelistOwner) {
    list.textContent = '完成一次帳號檢查後，可管理這個 X 帳號的白名單。';
    return;
  }
  if (!personalWhitelistEntries.length) {
    list.textContent = '這份擴充功能中沒有找到 @{owner} 的白名單。如果之前儲存過，請先確認是否載入過另一份「取關狗」，不要先解除安裝舊版。'.replace("{owner}", whitelistOwner || "?");
    return;
  }
  const ownerLabel = document.createElement("p");
  ownerLabel.className = "personal-note";
  ownerLabel.textContent = '目前帳號 @{owner} 的白名單（儲存在這份擴充功能中）：'.replace("{owner}", whitelistOwner);
  list.append(ownerLabel);
  for (const user of personalWhitelistEntries) {
    const row = document.createElement("div");
    row.className = "personal-whitelist-item";
    const name = document.createElement("span");
    name.textContent = "@" + user.username;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = '移出白名單';
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
    if (!response?.ok) throw new Error(response?.error || '無法更新白名單');
    if (whitelistOwner === expectedOwner && response.owner === expectedOwner) {
      whitelistLoadStatus = "ready";
      applyPersonalWhitelistEntries(response.entries);
      toast(protect ? '已加入白名單' : '已移出白名單');
    }
  } catch (error) {
    toast(error?.message || '無法更新白名單');
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
        if (!response?.ok) throw new Error(response?.error || "無法讀取社群名單");
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
  if (!response?.ok) throw new Error(response?.error || "無法讀取個人帳號檢查狀態");
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
    toast("操作未完成，請重試。");
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
  blockButton.textContent = count ? `一鍵封鎖（${count}）` : "一鍵封鎖";
  unfollowButton.textContent = count ? `一鍵取消追蹤（${count}）` : "一鍵取消追蹤對方";
}

function renderPersonalResultList(users = []) {
  const list = $("#personalResultList");
  clear(list);
  if (!users.length) {
    const empty = document.createElement("div");
    empty.className = "personal-result-empty";
    empty.textContent = '沒有檢查到未回追帳號。';
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
    checkbox.setAttribute("aria-label", '選擇 @' + user.username);
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
    protection.textContent = protectedUser ? '已保護' : '加入白名單';
    protection.setAttribute("aria-label", (protectedUser ? '移出白名單' : '加入白名單') + " @" + user.username);
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
    ? "繼續檢查（從斷點恢復）"
    : completionNeedsFullRescan
    ? "重新檢查"
    : failed || completionNeedsValidation
      ? "繼續檢查"
      : completed || cancelled || stale
        ? "重新檢查"
        : running ? "檢查中…" : "開始檢查";
  $("#personalCancelScanButton").classList.toggle("hidden", !running);
  $("#personalScanProgress").classList.toggle("hidden", !running && !paused);
  const rateLimitError = /HTTP_429|Too Many Requests|rate.?limit|請求過多/i.test(String(scan?.lastRecoverableError || scan?.pauseReason || ""));
  const untilMs = Number(scan?.rateLimitUntil || scan?.nextRecoveryAt || 0);
  const rateLimitCooling = rateLimitError && untilMs > Date.now();
  const retryTime = rateLimitCooling ? new Date(untilMs).toLocaleString() : "";
  const showRecovery = paused || rateLimitCooling || (running && scan?.recoveryPending && Number(scan?.consecutiveRecoveryCount || 0)>0);
  $("#personalRecoveryHint").classList.toggle("hidden", !showRecovery);
  $("#personalRecoveryHint").textContent = rateLimitCooling
    ? "X 返回 HTTP 429，目前正處於請求限流冷卻。已儲存的追蹤、粉絲和斷點不會丟失。最早恢復時間：" + retryTime
      + (paused ? "。自動重試已暫停；點擊繼續檢查也會等冷卻結束再請求。" : "。冷卻結束前不會重複請求 X，之後才會限次自動續掃。")
    : paused
      ? "X 列表持續報錯，自動恢復已暫停。原有資料和斷點已儲存；請等 X 列表恢復正常後再手動繼續。"
      : showRecovery
        ? "X 頁面出錯，擴充功能會限次嘗試恢復；如果仍失敗會暫停並保留斷點。"
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
    const activeLabel = activeRelation === "followers" ? "追蹤我的人" : "我追蹤的人";
    const firstStageStatus = profileFollowingCount > 0
      ? "第一階段：" + followingCount + " / " + (profileFollowingExact ? "" : "約 ") + profileFollowingCount + (phase === "followers" ? " 已完成" : "")
      : "第一階段：已讀取 " + followingCount;
    const secondStageStatus = profileFollowersCount > 0
      ? "第二階段：" + followersCount + " / " + (profileFollowersExact ? "" : "約 ") + profileFollowersCount
      : "第二階段：已讀取 " + followersCount;
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

    $("#personalScanSummary").textContent = rateLimitCooling
      ? "@" + (scan.username || "目前帳號") + " · HTTP 429 冷卻中，最早恢復：" + retryTime
      : (stallKind === "missing" || stallKind === "stalled")
      ? "@" + (scan.username || "目前帳號") + " · 讀取暫時沒有進展"
      : cursorResumeActive
      ? "@" + (scan.username || "目前帳號") + (cursorFromCheckpoint ? " · 正在從上次位置繼續" : " · 正在繼續讀取")
      : resumeActive
        ? "@" + (scan.username || "目前帳號") + " · 正在定位舊版斷點"
        : recovering
        ? "@" + (scan.username || "目前帳號") + " · 自動恢復中" + (Number(scan.consecutiveRecoveryCount || 0) > 1 ? "（第 " + Number(scan.consecutiveRecoveryCount || 0) + " 次）" : "")
      : resting
        ? "@" + (scan.username || "目前帳號") + " · 停留中"
        : scan.username
          ? "@" + scan.username + (phase === "followers" ? " · 第二階段檢查中" : " · 第一階段檢查中")
          : "正在識別目前登入帳號…";

    if (cursorResumeActive) {
      const cursorPrefix = cursorFromCheckpoint ? "正在從上次位置繼續…" : "正在繼續讀取…";
      $("#personalProgressText").textContent = activeTotal
        ? stagePrefix + "：" + cursorPrefix + " 已讀取 " + cursorResumePages + " 頁 · 已儲存 " + activeCount + " / " + (activeExact ? "" : "約 ") + activeTotal + " 個" + activeLabel
        : stagePrefix + "：" + cursorPrefix + " 已儲存 " + activeCount + " 個" + activeLabel + " · 總數暫未讀取，不影響檢查";
    } else if (resumeActive) {
      $("#personalProgressText").textContent = stagePrefix + " · 正在從上次位置繼續，目前已儲存 " + resumeTarget + " 個帳號";
    } else if (recovering) {
      $("#personalProgressText").textContent = activeTotal
        ? stagePrefix + "：已儲存 " + activeCount + " / " + (activeExact ? "" : "約 ") + activeTotal + " 個" + activeLabel + " · 等待自動續掃"
        : stagePrefix + "：已儲存 " + activeCount + " 個" + activeLabel + " · 總數暫未讀取，不影響檢查 · 等待自動續掃";
    } else if (resting) {
      $("#personalProgressText").textContent = activeTotal
        ? stagePrefix + "：短暫停留中… 已掃描 " + activeCount + " / " + (activeExact ? "" : "約 ") + activeTotal + " 個" + activeLabel
        : stagePrefix + "：短暫停留中… 已掃描 " + activeCount + " 個" + activeLabel + " · 總數暫未讀取，不影響檢查";
    } else if (phase === "following" || phase === "followers") {
      $("#personalProgressText").textContent = (activeTotal
        ? stagePrefix + " · 正在掃描" + activeLabel
        : stagePrefix + " · 正在掃描" + activeLabel + "，總數暫未讀取")
        + (cursorCheckpointReady ? " · 續掃進度已儲存" : "");
    } else {
      $("#personalProgressText").textContent = "正在識別目前登入帳號…";
    }

    $("#personalScanNote").textContent = cursorResumeActive
      ? (cursorFromCheckpoint
          ? "這次不會從第一頁重新開始。取關狗會從上次儲存的位置繼續讀取，少量重疊帳號會自動去重。"
          : "目前位置已經儲存。為避免 X 頁面重新載入或發生異常，掃描期間不建議切換到其他頁面，請耐心等待目前階段完成。")
      : resumeActive
        ? "正在回到上次儲存的位置，之前已讀取的資料不會丟失。"
        : recovering
        ? (scan.recoveryMessage ? humanizeScanMessage(scan.recoveryMessage) : ("中斷原因：" + humanizeScanMessage(scan.lastRecoverableError || "X 頁面暫時沒有返回可讀取的資料") + " 已儲存目前進度，正在自動繼續，不需要重新檢查。"))
        : resting
        ? "目前為第 " + (scan?.progress?.humanPauseCount || 1) + " 次短暫停留，結束後會自動繼續。"
        : cursorCheckpointReady
          ? (phase === "followers"
              ? "第一階段已經完成並儲存。現在是第二階段：讀取追蹤你的人，用來和第一階段進行比對；第二階段完成後才會產生未回追名單。"
              : "第一階段正在讀取你追蹤的人。第一階段完成後，還會進入第二階段讀取追蹤你的人；兩邊都完成後才會產生未回追名單。")
          : phase === "followers"
            ? "第一階段已經完成並儲存。現在是第二階段：讀取追蹤你的人，用來和第一階段進行比對；第二階段完成後才會產生未回追名單。"
            : "第一階段正在讀取你追蹤的人。第一階段完成後，還會進入第二階段讀取追蹤你的人；兩邊都完成後才會產生未回追名單。";
  } else if (paused) {
    $("#personalScanSummary").textContent = "@" + (scan.username || "目前帳號") + " · 已暫停（等待手動繼續）";
    $("#personalProgressText").textContent = "第一階段已儲存 " + followingCount
      + " 個我追蹤的人 · 第二階段已儲存 " + followersCount + " 個追蹤我的人";
    $("#personalScanNote").textContent = "自動恢復已停止。目前資料和斷點已儲存；請先確認 X 的追蹤/粉絲列表可以正常載入，再點擊“繼續檢查（從斷點恢復）”。";
  } else if (completed) {
    if (completionNeedsFullRescan) {
      $("#personalScanSummary").textContent = "本次檢查結果不完整";
      const localized = getScanRestartText(document.documentElement.lang);
      const relation = completedCountMismatch.relation === "followers" ? localized.relationFollowers : localized.relationFollowing;
      $("#personalScanNote").textContent = localized.incompleteCountWarning
        .replace("{relation}", relation)
        .replace("{actual}", String(completedCountMismatch.actual))
        .replace("{required}", String(completedCountMismatch.required))
        .replace("{missing}", String(completedCountMismatch.missing));
    } else if (completionNeedsValidation) {
      $("#personalScanSummary").textContent = "上次結果需要繼續校驗";
      $("#personalScanNote").textContent = getScanRestartText(document.documentElement.lang).needsValidationNote;
    } else {
      $("#personalScanSummary").textContent = "@" + (scan.username || "目前帳號") + " · 檢查完成";
      $("#personalScanNote").textContent = getScanRestartText(document.documentElement.lang).completedNote;
      if (completedFollowerGap) $("#personalScanNote").textContent += " " + getScanRestartText(document.documentElement.lang).completedGapWarning.replace("{count}", String(completedFollowerGap.missing));
    }
  } else if (failed) {
    $("#personalScanSummary").textContent = "檢查暫時中斷";
    $("#personalScanNote").textContent = humanizeScanMessage(scan.error || "檢查過程中發生錯誤。") + " 已儲存的資料仍然保留；點擊“繼續檢查”會從已儲存進度繼續。";
  } else if (cancelled) {
    $("#personalScanSummary").textContent = "檢查已停止";
    $("#personalScanNote").textContent = "沒有產生完整名單。重新檢查後會從頭掃描。";
  } else if (stale) {
    $("#personalScanSummary").textContent = "上次檢查結果需要更新";
    $("#personalScanNote").textContent = scan.staleReason || "追蹤關係可能已經變化，請重新檢查後再處理。";
  } else {
    $("#personalScanSummary").textContent = "尚未檢查";
    $("#personalProgressText").textContent = "";
    $("#personalScanNote").textContent = "檢查只讀取目前追蹤關係，不會自動取消追蹤或封鎖任何帳號。";
  }


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
  $("#blocklistDescription").textContent = "這是取關狗持續整理和維護的 X 社群共享名單，線索來自公開資訊和使用者提交。名單會持續更新。點擊下方按鈕，將在目前登入的 X 帳號中分批封鎖名單中的帳號。";
  $("#blocklistSummary").textContent =
    "目前名單共 " + blocklist.targets.length + " 個帳號 · 持續更新";
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
  if (blocklist.remoteWarning) issues.push("線上審核名單暫時無法讀取，本次先使用內建名單。");
  if (blocklist.duplicates.length) issues.push(`名單中已自動移除 ${blocklist.duplicates.length} 個重複項`);
  for (const item of blocklist.invalid) issues.push(`${item.raw || "空白項"}：${item.error}`);
  const issueList = $("#issueList");
  clear(issueList);
  issues.forEach((issue) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = issue;
    issueList.append(paragraph);
  });
  const batchCount = Math.ceil(blocklist.targets.length / BATCH_SIZE);
  $("#batchGuide").textContent = blocklist.targets.length
    ? `為了避免操作過快，每批最多處理 ${BATCH_SIZE} 個帳號。每批結束後休息 30 分鐘，再由你手動繼續。目前名單預計需要 ${batchCount} 批。`
    : "目前沒有需要處理的帳號。";
  $("#startButton").disabled = blocklist.targets.length === 0;
  $("#startButton").textContent = blocklist.targets.length ? `開始處理第 1 批（最多 ${BATCH_SIZE} 個）` : "目前無帳號可處理";
  $("#stickyValuePromo").classList.add("hidden");
  showOnly(blocklistView);
}


function humanizeScanMessage(message) {
  const text = String(message || "").replace(/^SCAN_RECOVERABLE:/, "").trim();
  if (!text) return "X 頁面暫時沒有返回完整資料";
  if (/HTTP[_ ]?\d+|GRAPHQL|HOOK_|NO_RESULT|CURSOR_/i.test(text)) return "X 暫時沒有繼續返回名單資料，已儲存目前進度，可以繼續檢查。";
  if (/No tab with id|tab.*not found|The tab was closed|Invalid tab ID/i.test(text)) return "檢查頁面意外關閉，已儲存目前進度，可以繼續檢查。";
  return text;
}

function humanizePauseReason(reason) {
  const text = String(reason || "").trim();
  if (!text) return "";
  if (/系統性失敗|系统性失败|No tab with id|tab.*not found|頁面已保留在瀏覽器標籤頁/i.test(text)) {
    return "這個帳號沒有處理成功，任務已暫停。前面已經處理完成的帳號不會重複，你可以決定是否繼續剩餘帳號。";
  }
  return text;
}

function humanizeActionFailureReason(reason) {
  const text = String(reason || "").trim();
  if (!text) return "這個帳號沒有處理成功";
  if (/No tab with id|tab.*not found|The tab was closed|Invalid tab ID|No frame with id/i.test(text)) return "處理頁面意外關閉";
  if (/Receiving end does not exist|Could not establish connection/i.test(text)) return "處理頁面暫時沒有響應";
  if (/Cannot access contents|Missing host permission|Cannot access a chrome/i.test(text)) return "暫時無法讀取這個帳號頁面";
  if (/timed? ?out|timeout/i.test(text)) return "頁面響應太慢，本次沒有處理成功";
  if (/^HTTP[_ ]?\d+|GRAPHQL|HOOK_|NO_RESULT|CURSOR_/i.test(text)) return "X 頁面暫時沒有返回可用資料";
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
    toast("目前任務屬於其他語言分區。請切換回開始此任務時的語言，才能繼續管理。");
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
  const actionLabel = job.mode === "personal" && job.action === "unfollow" ? "取消追蹤" : "封鎖";
  $("#progressTitle").textContent = running
    ? `正在${actionLabel}`
    : completed
      ? `${actionLabel}處理完成`
      : batchPaused
        ? cooling ? "本批已完成，正在休息" : "本批處理完成"
        : "任務已暫停";
  $("#batchStatus").textContent = completed
    ? `共 ${totalBatches} 批 · 已全部完成`
    : batchPaused
      ? cooling
        ? `第 ${batchNumber} / ${totalBatches} 批已完成 · 本批已處理 ${batchDone || batchSize} 個`
        : `第 ${batchNumber} / ${totalBatches} 批已完成 · 可以手動繼續下一批`
      : `第 ${batchNumber} / ${totalBatches} 批 · 每批最多 ${batchSize} 個`;

  const resumeTime = job.resumeAt
    ? new Date(job.resumeAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  $("#progressText").textContent = running
    ? `本批 ${batchDone} / ${batchTotal} · 總進度 ${done} / ${total}${job.currentTarget ? ` · 正在${actionLabel} ${job.currentTarget.label}` : ""}`
    : batchPaused
      ? cooling
        ? `總進度 ${done} / ${total} · 為避免操作過快，休息 30 分鐘 · ${resumeTime} 後可繼續下一批`
        : `總進度 ${done} / ${total} · 冷卻已結束，可以繼續下一批`
      : `總進度 ${done} / ${total}${job.pauseReason ? ` · ${humanizePauseReason(job.pauseReason)}` : ""}`;

  const statusLabel = {
    blocked: "已封鎖",
    already_blocked: "已封鎖過",
    unfollowed: "已取消追蹤",
    already_unfollowed: "已取消追蹤過",
    skipped_whitelist: '白名單保護 · 已跳過',
    skipped_following_back: "已回追 · 跳過",
    skipped_restricted: "已跳過",
    skipped_subscription: "已跳過",
    failed: "失敗"
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
        noticeTitle.textContent = result.status === "skipped_restricted"
          ? getScanRestartText(document.documentElement.lang).skipRestrictedTitle
          : getScanRestartText(document.documentElement.lang).skipSubscriptionTitle;
        detail.append(noticeTitle);
      }
      const reason = document.createElement("small");
      const nativeReasons = getScanRestartText(document.documentElement.lang);
      reason.textContent = result.status === "failed"
        ? humanizeActionFailureReason(result.reason)
        : result.status === "skipped_following_back" ? nativeReasons.skipFollowsYou
        : result.status === "skipped_restricted" ? nativeReasons.skipRestricted
        : result.status === "skipped_subscription" ? nativeReasons.skipSubscription
        : "已自動跳過";
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
    $("#communityContributionTitle").textContent = "要把這次任務的帳號加入社群名單嗎？";
    $("#communityContributionCopy").textContent = batchPaused
      ? "如果選擇加入，這次任務裡所有成功封鎖或取消追蹤的帳號都會加入社群名單，不只是目前這一批。後面批次成功處理的帳號也會一起加入。"
      : "如果選擇加入，這次任務裡所有成功封鎖或取消追蹤的帳號都會一起加入社群名單。";
    contributionButton.disabled = false;
    contributionButton.textContent = "全部加入社群名單";
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
    ? job.mode === "personal" ? "返回個人帳號模式" : "返回社群共享名單"
    : batchPaused
      ? cooling
        ? `正在休息 · ${resumeTime} 後繼續下一批`
        : `繼續處理第 ${Math.min(batchNumber + 1, totalBatches)} 批`
      : "繼續剩餘帳號";
}

$("#communityModeButton").addEventListener("click", () => void runUiAction("community-load", $("#communityModeButton"), async () => {
  if (currentJob?.mode === "community") {
    renderJob(currentJob);
    return;
  }
  if (currentJob?.mode === "personal") {
    toast("目前有個人帳號任務，請先處理該任務");
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
    toast("目前有未完成的社群名單任務，請先繼續或結束該任務");
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
  if (!response?.ok) return toast(response?.error || "無法開始檢查");
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
  if (!response?.ok) return toast(response?.error || "無法停止檢查");
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
  $("#personalBlockConfirmTitle").textContent = isUnfollow ? "取消追蹤所選帳號？" : "封鎖所選帳號？";
  $("#personalBlockConfirmCopy").textContent = "你選擇了 " + usernames.length + " 個未回追帳號。確認後會開始第 1 批，單批最多處理 " + BATCH_SIZE + " 個。";
  $("#personalBlockConfirmWarning").textContent = isUnfollow
    ? "確認後會逐個取消追蹤這些帳號；每批最多 20 個，批次結束後冷卻 30 分鐘。執行前仍會檢查帳號與關係狀態。"
    : "確認後會逐個封鎖這些帳號；每批最多 20 個，批次結束後冷卻 30 分鐘。執行前仍會檢查帳號與關係狀態。";
  if (emptyWhitelistWarningShown) {
    $("#personalBlockConfirmWarning").textContent += " " +
      getScanRestartText(document.documentElement.lang).emptyWhitelistConfirm;
  }
  const confirmButton = $("#personalBlockConfirmButton");
  confirmButton.textContent = isUnfollow ? "確認取消追蹤並開始第 1 批" : "確認封鎖並開始第 1 批";
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
    toast(response?.error || "任務啟動失敗");
    return;
  }
  renderJob(response.job);
}));

$("#cancelButton").addEventListener("click", () => void runUiAction("batch-job", $("#cancelButton"), async () => {
  const response = await chrome.runtime.sendMessage({ type: "CANCEL_JOB" });
  if (!response?.ok) return toast(response?.error || "操作未完成，請重試。");
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
  if (!response?.ok) return toast(response?.error || "無法結束任務");
  currentJob = null;
  renderModeSelector();
  if (response.cooldownUntil > Date.now()) {
    const until = new Date(response.cooldownUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    toast("任務已結束；全域性冷卻仍保留到 " + until);
  } else {
    toast("任務已結束");
  }
  } finally {
    button.dataset.confirming = "";
  }
}));

$("#newTaskButton").addEventListener("click", () => void runUiAction("batch-job", $("#newTaskButton"), async () => {
  if (currentJob && currentJob.currentIndex < currentJob.targets.length) {
    const response = await chrome.runtime.sendMessage({ type: "RESUME_JOB" });
    if (!response?.ok) return toast(response?.error || "無法繼續任務");
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
    console.warn("[取關狗] 檢查進度同步暫時失敗", error);
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
    return toast("目前沒有可處理的未回追帳號");
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

  if (!response?.ok) return toast(response?.error || "無法開始私人名單任務");
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
  if (!currentJob?.id || currentJob.mode !== "personal") return toast("目前沒有可加入社群名單的個人帳號任務");
  $("#communitySubmitTitle").textContent = "確認全部加入社群名單？";
  $("#communitySubmitCopy").textContent = currentJob.status === "completed"
    ? "確認後，這次任務裡所有成功封鎖或取消追蹤的帳號都會一起加入社群名單。"
    : "確認後，這次任務裡所有成功封鎖或取消追蹤的帳號都會加入社群名單。後面批次成功處理的帳號也會一起加入，不只是目前這一批。";
  setCommunitySubmitOpen(true);
});

$("#communitySubmitCancel").addEventListener("click", () => setCommunitySubmitOpen(false));
$("#communitySubmitClose").addEventListener("click", () => setCommunitySubmitOpen(false));
communitySubmitConfirmPanel.querySelector("[data-community-submit-close]").addEventListener("click", () => setCommunitySubmitOpen(false));

$("#communitySubmitConfirm").addEventListener("click", () => void runUiAction("community-submit", $("#communitySubmitConfirm"), async () => {
  if (!currentJob?.id) {
    setCommunitySubmitOpen(false);
    return toast("目前任務已經結束");
  }

  const button = $("#communitySubmitConfirm");
  button.textContent = "正在儲存選擇…";
  const response = await chrome.runtime.sendMessage({
    type: "SUBMIT_COMMUNITY_CANDIDATES",
    jobId: currentJob.id
  });

  button.textContent = "全部加入";
  if (!response?.ok) return toast(response?.error || "暫時無法儲存這個選擇");

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
    ? "已選擇：這次任務全部成功處理的帳號都會加入社群名單"
    : "這次任務成功處理的帳號已加入社群名單");
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
  if (!response?.ok) return toast(response?.error || "無法跳過冷卻");
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

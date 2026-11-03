import { getScanRestartText } from "../../lib/scan-restart-text.js";
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
let selectedPersonalScanId = null;
const selectedPersonalHandles = new Set();
let pendingPersonalAction = "block";
const PERSONAL_WHITELIST_STORAGE_KEY = "quguangouPersonalWhitelistV1";
let whitelistOwner = "";
let personalWhitelistEntries = [];

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
  $("#personalWhitelistCount").textContent = String(personalWhitelistEntries.length);
  if (!whitelistOwner) {
    list.textContent = 'Run a scan to manage the whitelist for your X account.';
    return;
  }
  if (!personalWhitelistEntries.length) {
    list.textContent = 'No protected accounts yet. Add accounts from your scan results.';
    return;
  }
  for (const user of personalWhitelistEntries) {
    const row = document.createElement("div");
    row.className = "personal-whitelist-item";
    const name = document.createElement("span");
    name.textContent = "@" + user.username;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = 'Remove';
    remove.addEventListener("click", () => void changePersonalWhitelist(user.username, false, remove));
    row.append(name, remove);
    list.append(row);
  }
}

async function refreshPersonalWhitelist() {
  const expectedOwner = whitelistOwner;
  if (!expectedOwner) {
    applyPersonalWhitelistEntries([]);
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_PERSONAL_WHITELIST" });
    if (whitelistOwner !== expectedOwner || response?.owner !== expectedOwner) return;
    if (!response?.ok) throw new Error(response?.error || "Whitelist unavailable");
    applyPersonalWhitelistEntries(response.entries);
  } catch (error) {
    console.warn("[QG] Failed to load local whitelist:", error);
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
    if (!response?.ok) throw new Error(response?.error || 'Could not update your whitelist');
    if (whitelistOwner === expectedOwner && response.owner === expectedOwner) {
      applyPersonalWhitelistEntries(response.entries);
      toast(protect ? 'Added to the whitelist' : 'Removed from the whitelist');
    }
  } catch (error) {
    console.warn('[QG] Whitelist update failed:', error);
    toast('Could not update your whitelist. Please reopen your account scan and try again.');
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
        if (!response?.ok) throw new Error(response?.error || "Could not load the community blocklist");
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
  if (!response?.ok) throw new Error(response?.error || "Could not load your personal scan status");
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
    toast("The request could not be completed. Please try again.");
  } finally {
    pendingUiActions.delete(group);
    if (control?.isConnected) control.removeAttribute("aria-busy");
    if (modal?.isConnected) modal.removeAttribute("aria-busy");
  }
}

function toast(message) {
  const node = $("#toast");
  node.textContent = window.QGDLocalizeError(message);
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
  blockButton.textContent = count ? `Block selected (${count}）` : "Block selected";
  unfollowButton.textContent = count ? `Unfollow selected (${count}）` : "Unfollow selected";
}

function renderPersonalResultList(users = []) {
  const list = $("#personalResultList");
  clear(list);
  if (!users.length) {
    const empty = document.createElement("div");
    empty.className = "personal-result-empty";
    empty.textContent = "No accounts were found that don't follow you back.";
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
    checkbox.setAttribute("aria-label", window.QGDTranslateAria?.('select', user.username) || 'Select @' + user.username);
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
    protection.textContent = protectedUser ? 'Protected' : 'Protect';
    protection.setAttribute("aria-label", window.QGDTranslateAria?.(protectedUser ? 'remove' : 'protect', user.username) || (protectedUser ? 'Remove' : 'Protect') + ' @' + user.username);
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
  const completionNeedsValidation = completed
    && profileFollowersCount === null
    && !scan?.progress?.followersUnknownEndValidated;
  const completionNeedsFullRescan = Boolean(completedCountMismatch);

  if (scan?.id !== selectedPersonalScanId) {
    selectedPersonalScanId = scan?.id || null;
    selectedPersonalHandles.clear();
  }
  const detectedOwner = normalizePersonalWhitelistHandle(scan?.username);
  if (detectedOwner !== whitelistOwner) {
    whitelistOwner = detectedOwner;
    personalWhitelistEntries = [];
    renderPersonalWhitelist();
    void refreshPersonalWhitelist();
  }

  const personalScanButton = $("#personalScanButton");
  personalView.classList.toggle("personal-completed-state", completed && !completionNeedsValidation && !completionNeedsFullRescan);
  personalView.classList.toggle("personal-stale-state", stale);
  personalScanButton.classList.toggle("personal-rescan", (completed && !completionNeedsValidation) || stale || completionNeedsFullRescan);
  personalScanButton.disabled = running;
  personalScanButton.textContent = paused
    ? "Resume scan (from checkpoint)"
    : completionNeedsFullRescan
    ? "Scan again"
    : failed || completionNeedsValidation
      ? "Resume scan"
      : completed || cancelled || stale
        ? "Scan again"
        : running ? "Scanning…" : "Start scan";
  $("#personalCancelScanButton").classList.toggle("hidden", !running);
  $("#personalScanProgress").classList.toggle("hidden", !running && !paused);
  const rateLimitError = /HTTP_429|Too Many Requests|rate.?limit|请求过多/i.test(String(scan?.lastRecoverableError || scan?.pauseReason || ""));
  const untilMs = Number(scan?.rateLimitUntil || scan?.nextRecoveryAt || 0);
  const rateLimitCooling = rateLimitError && untilMs > Date.now();
  const retryTime = rateLimitCooling ? new Date(untilMs).toLocaleString() : "";
  const showRecovery = paused || rateLimitCooling || (running && scan?.recoveryPending && Number(scan?.consecutiveRecoveryCount || 0)>0);
  $("#personalRecoveryHint").classList.toggle("hidden", !showRecovery);
  $("#personalRecoveryHint").textContent = rateLimitCooling
    ? "X returned HTTP 429 (rate limited). Saved scan data and checkpoints are safe. Earliest retry: " + retryTime
      + (paused ? ". Automatic retries are paused; Resume will wait until the cooldown ends." : ". Scanning is cooling down; no repeated requests will be made before this time.")
    : paused
      ? "The X list could not be read. Automatic retries have stopped; your saved progress is intact. Wait until X loads normally, then resume."
      : showRecovery
        ? "X returned an error. The extension is recovering with bounded retries. Your scan progress remains saved."
        : "";

  const restartCopy = getScanRestartText(document.documentElement.lang);
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
    const activeLabel = activeRelation === "followers" ? "Followers" : "Following";
    const firstStageStatus = profileFollowingCount > 0
      ? "Stage 1: " + followingCount + " / " + (profileFollowingExact ? "" : " approx. ") + profileFollowingCount + (phase === "followers" ? " complete" : "")
      : "Stage 1: read " + followingCount;
    const secondStageStatus = profileFollowersCount > 0
      ? "Stage 2: " + followersCount + " / " + (profileFollowersExact ? "" : " approx. ") + profileFollowersCount
      : "Stage 2: read " + followersCount;
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
    const scanPatienceNote = "Large follow lists take time to scan. Keep the X scan window open and avoid switching tabs until the current stage finishes.";

    $("#personalScanSummary").textContent = rateLimitCooling
      ? "@" + (scan.username || "Signed-in account") + " · HTTP 429 cooldown until " + retryTime
      : cursorResumeActive
      ? "@" + (scan.username || "Signed-in account") + (cursorFromCheckpoint ? " · resuming from last position" : " · catching up")
      : resumeActive
        ? "@" + (scan.username || "Signed-in account") + " · finding a previous checkpoint"
        : recovering
        ? "@" + (scan.username || "Signed-in account") + " · recovering automatically" + (Number(scan.consecutiveRecoveryCount || 0) > 1 ? " (attempt " + Number(scan.consecutiveRecoveryCount || 0) + ")" : "")
      : resting
        ? "@" + (scan.username || "Signed-in account") + " · pausing briefly"
        : scan.username
          ? "@" + scan.username + (phase === "followers" ? " · scanning stage 2" : " · scanning stage 1")
          : "Identifying the signed-in account…";

    if (cursorResumeActive) {
      const cursorPrefix = cursorFromCheckpoint ? "Resuming from last position…" : "Reading quickly to previous position…";
      $("#personalProgressText").textContent = activeTotal
        ? stagePrefix + ": " + cursorPrefix + " · read " + cursorResumePages + " pages · saved " + activeCount + " / " + (activeExact ? "" : " approx. ") + activeTotal + " accounts (" + activeLabel + ")"
        : stagePrefix + ": " + cursorPrefix + " · saved " + activeCount + " accounts (" + activeLabel + ")" + " · total not yet available; the scan can continue";
    } else if (resumeActive) {
      $("#personalProgressText").textContent = stagePrefix + " · resuming from saved progress: " + resumeTarget + " accounts";
    } else if (recovering) {
      $("#personalProgressText").textContent = activeTotal
        ? stagePrefix + ": saved " + activeCount + " / " + (activeExact ? "" : " approx. ") + activeTotal + " accounts (" + activeLabel + ")" + " · waiting to resume automatically"
        : stagePrefix + ": saved " + activeCount + " accounts (" + activeLabel + ")" + " · total not yet available; waiting to resume automatically";
    } else if (resting) {
      $("#personalProgressText").textContent = activeTotal
        ? stagePrefix + ": pausing briefly… scanned " + activeCount + " / " + (activeExact ? "" : " approx. ") + activeTotal + " accounts (" + activeLabel + ")"
        : stagePrefix + ": pausing briefly… scanned " + activeCount + " accounts (" + activeLabel + ")" + " · total not yet available; the scan can continue";
    } else if (phase === "following" || phase === "followers") {
      $("#personalProgressText").textContent = (activeTotal
        ? stagePrefix + " · scanning " + activeLabel
        : stagePrefix + " · scanning " + activeLabel + "; total not yet available")
        + (cursorCheckpointReady ? " · checkpoint saved" : "");
    } else {
      $("#personalProgressText").textContent = "Identifying the signed-in account…";
    }

    $("#personalScanNote").textContent = cursorResumeActive
      ? (cursorFromCheckpoint
          ? "The scan will resume from your last saved position, not from the beginning. Any previously scanned accounts encountered again will be deduplicated automatically."
          : "Your progress is saved. Avoid switching pages during the scan, as this may interrupt loading on X. Allow the current stage to finish.")
      : resumeActive
        ? "Returning to your saved position. Previously collected data will be kept."
        : recovering
        ? (scan.recoveryMessage ? humanizeScanMessage(scan.recoveryMessage) : ("Reason for interruption: " + humanizeScanMessage(scan.lastRecoverableError || "X has not returned readable list data yet") + " Saved progress; resuming automatically. You do not need to restart."))
        : resting
        ? "Short pause #" + (scan?.progress?.humanPauseCount || 1) + ". Scanning will resume automatically."
        : cursorCheckpointReady
          ? (phase === "followers"
              ? "Stage 1 is complete and saved. Stage 2 is now reading your followers for comparison. The non-follower list will be generated once stage 2 finishes."
              : "Stage 1 is reading the accounts you follow. Stage 2 will then read your followers. The non-follower list is available only after both stages finish.")
          : phase === "followers"
            ? "Stage 1 is complete and saved. Stage 2 is now reading your followers for comparison. The non-follower list will be generated once stage 2 finishes."
            : "Stage 1 is reading the accounts you follow. Stage 2 will then read your followers. The non-follower list is available only after both stages finish.";
    $("#personalScanNote").textContent += " " + scanPatienceNote;
  } else if (paused) {
    $("#personalScanSummary").textContent = "@" + (scan.username || "Signed-in account") + " · paused (manual resume required)";
    $("#personalProgressText").textContent = "Stage 1 saved " + followingCount
      + " following · stage 2 saved " + followersCount + " followers";
    $("#personalScanNote").textContent = "Automatic recovery has stopped. Your data and checkpoint are saved. Confirm that the X follower/following list loads correctly, then click Resume scan.";
  } else if (completed) {
    if (completionNeedsFullRescan) {
      $("#personalScanSummary").textContent = "This scan result is incomplete";
      const mismatchRelationLabel = completedCountMismatch.relation === "followers" ? "Followers" : "Following";
      $("#personalScanNote").textContent = mismatchRelationLabel + ": only "
        + completedCountMismatch.actual + " accounts were read, but the profile shows at least " + completedCountMismatch.required
        + " accounts — missing " + completedCountMismatch.missing + ". To avoid false positives, the result list is disabled. Scan again.";
    } else if (completionNeedsValidation) {
      $("#personalScanSummary").textContent = "Previous result needs verification";
      $("#personalScanNote").textContent = "The last scan could not verify the complete follower count. It cannot be used as a final list. Resume scan will keep your saved stage 1 progress.";
    } else {
      $("#personalScanSummary").textContent = "@" + (scan.username || "Signed-in account") + " · scan complete";
      $("#personalScanNote").textContent = "Results show current follow relationships at the time of the scan. They do not reveal who recently unfollowed you.";
    }
  } else if (failed) {
    $("#personalScanSummary").textContent = "Scan interrupted";
    $("#personalScanNote").textContent = humanizeScanMessage(scan.error || "An error occurred while scanning.") + " Saved data remains intact. Select Resume scan to continue from your checkpoint.";
  } else if (cancelled) {
    $("#personalScanSummary").textContent = "Scan stopped";
    $("#personalScanNote").textContent = "No complete list was generated. Starting a new scan will read from the beginning.";
  } else if (stale) {
    $("#personalScanSummary").textContent = "Previous scan results may be outdated";
    $("#personalScanNote").textContent = window.QGDLocalizeError(
      scan.staleReason || "Follow relationships may have changed. Run a fresh scan before taking action."
    );
  } else {
    $("#personalScanSummary").textContent = "Not scanned yet";
    $("#personalProgressText").textContent = "";
    $("#personalScanNote").textContent = "Scanning only checks current follow relationships. It will not unfollow or block anyone automatically.";
  }

  if (running || paused) {
    $("#personalScanNote").textContent = rateLimitCooling
      ? restartCopy.cooling
      : paused ? restartCopy.paused : restartCopy.running;
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
  $("#blocklistDescription").textContent = "This community blocklist is maintained by Followback Watchdog using public information and user submissions. It is updated over time. Start a task below to block listed accounts in paced batches from your signed-in X account.";
  $("#blocklistSummary").textContent =
    "This list currently contains " + blocklist.targets.length + " accounts · regularly updated";
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
  if (blocklist.remoteWarning) issues.push(blocklist.locale === "zh"
    ? "The online reviewed list is unavailable. Using the bundled list for now."
    : "The reviewed list for this language is temporarily unavailable. Please try again later.");
  if (blocklist.duplicates.length) issues.push(`Duplicates removed from list: ${blocklist.duplicates.length} entries`);
  for (const item of blocklist.invalid) issues.push(`${item.raw || "Empty entry"}: ${window.QGDLocalizeError(item.error)}`);
  const issueList = $("#issueList");
  clear(issueList);
  issues.forEach((issue) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = issue;
    issueList.append(paragraph);
  });
  const batchCount = Math.ceil(blocklist.targets.length / BATCH_SIZE);
  $("#batchGuide").textContent = blocklist.targets.length
    ? `To prevent rapid actions, each batch processes up to ${BATCH_SIZE} accounts, followed by a 30-minute cooldown. This list is estimated to require ${batchCount} batches.`
    : "There are no accounts to process.";
  $("#startButton").disabled = blocklist.targets.length === 0;
  $("#startButton").textContent = blocklist.targets.length ? `Start batch 1 (up to ${BATCH_SIZE} accounts)` : "No accounts available to process";
  $("#stickyValuePromo").classList.add("hidden");
  showOnly(blocklistView);
}


function humanizeScanMessage(message) {
  const text = String(message || "").replace(/^SCAN_RECOVERABLE:/, "").trim();
  if (!text) return "X has not returned complete list data";
  if (/HTTP[_ ]?429|Too Many Requests|rate.?limit/i.test(text)) {
    return "X returned HTTP 429 (rate limit). Your saved progress is safe; wait until the cooldown ends before resuming.";
  }
  if (/HTTP[_ ]?\d+|GRAPHQL|HOOK_|NO_RESULT|CURSOR_/i.test(text)) return "X has temporarily stopped returning list data. Your progress is saved; you can resume the scan.";
  if (/No tab with id|tab.*not found|The tab was closed|Invalid tab ID/i.test(text)) return "The scan page closed unexpectedly. Your progress is saved; you can resume the scan.";
  return window.QGDLocalizeError(text);
}

function humanizePauseReason(reason) {
  const text = String(reason || "").trim();
  if (!text) return "";
  if (/系统性失败|No tab with id|tab.*not found|页面已保留在浏览器标签页/i.test(text)) {
    return "This account was not processed successfully, so the task is paused. Completed accounts will not be processed again. You can decide whether to resume the remaining accounts.";
  }
  return window.QGDLocalizeError(text);
}

function humanizeActionFailureReason(reason) {
  const text = String(reason || "").trim();
  if (!text) return "This account could not be processed";
  if (/No tab with id|tab.*not found|The tab was closed|Invalid tab ID|No frame with id/i.test(text)) return "The processing page closed unexpectedly";
  if (/Receiving end does not exist|Could not establish connection/i.test(text)) return "The processing page is not responding";
  if (/Cannot access contents|Missing host permission|Cannot access a chrome/i.test(text)) return "Could not read this account's page";
  if (/timed? ?out|timeout/i.test(text)) return "The page responded too slowly; this attempt did not complete";
  if (/^HTTP[_ ]?\d+|GRAPHQL|HOOK_|NO_RESULT|CURSOR_/i.test(text)) return "X did not return usable page data";
  return window.QGDLocalizeError(text);
}
function renderJob(job) {
  if (!job) return;
  currentJob = job;
  const uiLocale = document.documentElement.lang;
  const currentPartition = uiLocale === "zh-CN" || uiLocale === "zh-TW" ? "zh" : uiLocale;
  const taskPartition = job.communityLocale || "zh"; // Pre-0.2.71 saved jobs are Chinese.
  if (taskPartition !== currentPartition) {
    renderModeSelector();
    toast("This task belongs to another language. Switch back to the language used when the task started to manage it.");
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
  const actionLabel = job.mode === "personal" && job.action === "unfollow" ? "Unfollow" : "Block";
  $("#progressTitle").textContent = running
    ? `${actionLabel === "Block" ? "Blocking" : "Unfollowing"} accounts`
    : completed
      ? `${actionLabel === "Block" ? "Blocking" : "Unfollowing"} completed`
      : batchPaused
        ? cooling ? "Batch complete · cooling down" : "Batch complete"
        : "Task paused";
  $("#batchStatus").textContent = completed
    ? `Total ${totalBatches} batches · all complete`
    : batchPaused
      ? cooling
        ? `Batch ${batchNumber} / ${totalBatches} complete · processed in this batch: ${batchDone || batchSize} accounts`
        : `Batch ${batchNumber} / ${totalBatches} complete · next batch can be started manually`
      : `Batch ${batchNumber} / ${totalBatches} · up to ${batchSize} accounts`;

  const resumeTime = job.resumeAt
    ? new Date(job.resumeAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  $("#progressText").textContent = running
    ? `This batch: ${batchDone} / ${batchTotal} · overall: ${done} / ${total}${job.currentTarget ? ` · ${actionLabel === "Block" ? "blocking" : "unfollowing"} ${job.currentTarget.label}` : ""}`
    : batchPaused
      ? cooling
        ? `Overall: ${done} / ${total} · 30-minute cooldown · Next batch available at ${resumeTime}`
        : `Overall: ${done} / ${total} · cooldown complete; you can continue`
      : `Overall: ${done} / ${total}${job.pauseReason ? ` · ${humanizePauseReason(job.pauseReason)}` : ""}`;

  const statusLabel = {
    blocked: "Blocked",
    already_blocked: "Already blocked",
    unfollowed: "Unfollowed",
    already_unfollowed: "Already unfollowed",
    skipped_whitelist: 'Whitelist protected · skipped',
    skipped_following_back: "Follows you back · skipped",
    skipped_restricted: "Skipped",
    skipped_subscription: "Skipped",
    failed: "Failed"
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
        noticeTitle.textContent = window.QGDLocalizeError(result.title);
        detail.append(noticeTitle);
      }
      const reason = document.createElement("small");
      reason.textContent = result.status === "failed"
        ? humanizeActionFailureReason(result.reason)
        : window.QGDLocalizeError(result.reason || "Automatically skipped");
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
    $("#communityContributionTitle").textContent = "Share accounts from this task with the community?";
    $("#communityContributionCopy").textContent = batchPaused
      ? "If you opt in, all accounts successfully blocked or unfollowed in this task will be submitted, not only those from the current batch. Successful accounts from later batches will also be included."
      : "If you opt in, all accounts successfully blocked or unfollowed in this task will be submitted to the community.";
    contributionButton.disabled = false;
    contributionButton.textContent = "Submit all to community";
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
    ? job.mode === "personal" ? "Back to Personal Account" : "Back to Community Blocklist"
    : batchPaused
      ? cooling
        ? `Cooling down · Next batch at ${resumeTime}`
        : `Continue batch ${Math.min(batchNumber + 1, totalBatches)}`
      : "Continue remaining accounts";
}

$("#communityModeButton").addEventListener("click", () => void runUiAction("community-load", $("#communityModeButton"), async () => {
  if (currentJob?.mode === "community") {
    renderJob(currentJob);
    return;
  }
  if (currentJob?.mode === "personal") {
    toast("A personal-account task is active. Complete it first.");
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
    toast("An unfinished community task is active. Continue or end it first.");
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
  if (!response?.ok) return toast(response?.error || "Could not start the scan");
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
  if (!response?.ok) return toast(response?.error || "Could not stop the scan");
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
  const isUnfollow = pendingPersonalAction === "unfollow";
  $("#personalBlockConfirmTitle").textContent = isUnfollow ? "Unfollow selected accounts?" : "Block selected accounts?";
  $("#personalBlockConfirmCopy").textContent = "You selected " + usernames.length + " non-followers. After confirmation, batch 1 will start, processing up to " + BATCH_SIZE + " accounts.";
  $("#personalBlockConfirmWarning").textContent = isUnfollow
    ? "After confirmation, accounts will be unfollowed one by one. Each batch processes up to 20 accounts, followed by a 30-minute cooldown. Account identity and follow relationships are rechecked before action."
    : "After confirmation, accounts will be blocked one by one. Each batch processes up to 20 accounts, followed by a 30-minute cooldown. Account identity and follow relationships are rechecked before action.";
  const confirmButton = $("#personalBlockConfirmButton");
  confirmButton.textContent = isUnfollow ? "Confirm unfollow and start batch 1" : "Confirm block and start batch 1";
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
    toast(response?.error || "Could not start the task");
    return;
  }
  renderJob(response.job);
}));

$("#cancelButton").addEventListener("click", () => void runUiAction("batch-job", $("#cancelButton"), async () => {
  const response = await chrome.runtime.sendMessage({ type: "CANCEL_JOB" });
  if (!response?.ok) return toast(response?.error || "The request could not be completed. Please try again.");
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
  if (!response?.ok) return toast(response?.error || "Could not end the task");
  currentJob = null;
  renderModeSelector();
  if (response.cooldownUntil > Date.now()) {
    const until = new Date(response.cooldownUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    toast("Task ended. The global cooldown remains active until " + until);
  } else {
    toast("Task ended");
  }
  } finally {
    button.dataset.confirming = "";
  }
}));

$("#newTaskButton").addEventListener("click", () => void runUiAction("batch-job", $("#newTaskButton"), async () => {
  if (currentJob && currentJob.currentIndex < currentJob.targets.length) {
    const response = await chrome.runtime.sendMessage({ type: "RESUME_JOB" });
    if (!response?.ok) return toast(response?.error || "Could not resume the task");
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
  if (changes[PERSONAL_WHITELIST_STORAGE_KEY]) {
    const state = changes[PERSONAL_WHITELIST_STORAGE_KEY].newValue || {};
    applyPersonalWhitelistEntries(state["x:" + whitelistOwner] || []);
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
  } catch (error) {
    console.warn("[Followback Watchdog] Scan progress could not be synchronized", error);
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
  if (!usernames.length || !currentPersonalScan?.id) {
    setPersonalBlockConfirmOpen(false);
    return toast("There are no non-followers ready to process");
  }

  const button = $("#personalBlockConfirmButton");
  const response = await chrome.runtime.sendMessage({
    type: "START_PERSONAL_ACTION_JOB",
    locale: document.documentElement.lang,
    action: pendingPersonalAction,
    scanId: currentPersonalScan.id,
    usernames
  });

  if (!response?.ok) return toast(response?.error || "Could not start personal-account task");
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
  if (!currentJob?.id || currentJob.mode !== "personal") return toast("There is no eligible personal-account task to share with the community");
  $("#communitySubmitTitle").textContent = "Submit all eligible accounts to the community?";
  $("#communitySubmitCopy").textContent = currentJob.status === "completed"
    ? "After confirmation, all accounts successfully blocked or unfollowed in this task will be submitted to the community for review."
    : "After confirmation, all accounts successfully blocked or unfollowed in this task will be submitted, including later successful batches, not just the current batch.";
  setCommunitySubmitOpen(true);
});

$("#communitySubmitCancel").addEventListener("click", () => setCommunitySubmitOpen(false));
$("#communitySubmitClose").addEventListener("click", () => setCommunitySubmitOpen(false));
communitySubmitConfirmPanel.querySelector("[data-community-submit-close]").addEventListener("click", () => setCommunitySubmitOpen(false));

$("#communitySubmitConfirm").addEventListener("click", () => void runUiAction("community-submit", $("#communitySubmitConfirm"), async () => {
  if (!currentJob?.id) {
    setCommunitySubmitOpen(false);
    return toast("The current task has already ended");
  }

  const button = $("#communitySubmitConfirm");
  button.textContent = "Saving your selection…";
  const response = await chrome.runtime.sendMessage({
    type: "SUBMIT_COMMUNITY_CANDIDATES",
    jobId: currentJob.id
  });

  button.textContent = "Submit all";
  if (!response?.ok) return toast(response?.error || "Could not save your selection");

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
    ? "Selected: all successfully processed accounts in this task will be submitted to the community"
    : "Successfully processed accounts from this task were submitted to the community for review");
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
  if (!response?.ok) return toast(response?.error || "Could not skip the cooldown");
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

import { parseAccountList } from "./lib/accounts.js";

const STORAGE_KEY = "quguangouJob";
let activeRun = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJob() {
  return (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? null;
}

async function setJob(job) {
  await chrome.storage.local.set({ [STORAGE_KEY]: job });
  chrome.runtime.sendMessage({ type: "JOB_UPDATED", job }).catch(() => {});
}

async function getBundledBlocklist() {
  const response = await fetch(chrome.runtime.getURL("data/blocklist.json"));
  if (!response.ok) throw new Error("无法读取扩展内置名单");
  const payload = await response.json();
  if (!Array.isArray(payload.accounts)) throw new Error("内置名单格式错误：accounts 必须是数组");
  const parsed = parseAccountList(payload.accounts.join("\n"), 1000);
  return {
    version: payload.version || "未标注",
    updatedAt: payload.updated_at || null,
    description: payload.description || "",
    ...parsed
  };
}

async function waitForTabComplete(tabId, timeoutMs = 35_000) {
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("页面加载超时"));
    }, timeoutMs);
    const listener = (updatedId, changeInfo) => {
      if (updatedId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function blockProfileInPage(target) {
  const sleepInPage = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (element) => Boolean(element && element.getClientRects().length);
  const waitFor = async (getter, timeoutMs = 15_000) => {
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
  const loginPattern = /Log in to X|Sign in to X|登录 X|登入 X/i;
  const blockPattern = /^(Block\b|拉黑|封鎖|ブロック|차단|Bloquear\b|Bloquer\b|Blockieren\b|Заблокировать)/i;
  const unblockPattern = /^(Unblock\b|取消拉黑|解除封鎖|ブロック解除|차단 해제|Desbloquear\b|Débloquer\b|Entsperren\b|Разблокировать)/i;
  const reportPattern = /report|举报|檢舉|報告|신고|denunciar|signaler|melden|пожаловаться/i;

  await waitFor(() => document.body, 10_000);
  if (/\/i\/flow\/login/.test(location.pathname) || loginPattern.test(pageText())) {
    return { status: "failed", reason: "Chrome 中尚未登录 X" };
  }
  if (unavailablePattern.test(pageText())) return { status: "failed", reason: "账号不存在、已停用或无法访问" };

  const actions = await waitFor(() => {
    const candidates = [...document.querySelectorAll('[data-testid="userActions"], button[aria-label*="More"], button[aria-label*="更多"]')];
    return candidates.find(visible);
  });
  if (!actions) return { status: "failed", reason: "找不到用户操作菜单，X 页面结构可能已变化" };
  actions.click();

  const menu = await waitFor(() => [...document.querySelectorAll('[role="menu"]')].find(visible), 8_000);
  if (!menu) return { status: "failed", reason: "用户操作菜单未打开" };
  const menuItems = [...menu.querySelectorAll('[role="menuitem"], [data-testid="Dropdown"]')].filter(visible);
  const alreadyBlocked = menuItems.find((item) => unblockPattern.test(item.innerText.trim()));
  if (alreadyBlocked) return { status: "already_blocked", reason: "该账号已经被拉黑" };

  const blockItem = menuItems.find((item) => {
    const text = item.innerText.trim();
    return blockPattern.test(text) && !reportPattern.test(text);
  });
  if (!blockItem) return { status: "failed", reason: "菜单中找不到“拉黑”操作" };
  blockItem.click();

  const confirm = await waitFor(() => {
    const byTestId = document.querySelector('[data-testid="confirmationSheetConfirm"]');
    if (visible(byTestId)) return byTestId;
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(visible);
    if (!dialog) return null;
    return [...dialog.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .find((button) => blockPattern.test(button.innerText.trim()) && !reportPattern.test(button.innerText));
  }, 8_000);
  if (!confirm) return { status: "failed", reason: "未出现拉黑确认窗口" };
  confirm.click();

  await sleepInPage(1200);
  const dialogStillOpen = [...document.querySelectorAll('[role="dialog"]')].some(visible);
  if (dialogStillOpen) return { status: "failed", reason: "确认后窗口未关闭，操作可能未成功" };
  return { status: "blocked", reason: "已拉黑" };
}

async function runJob() {
  if (activeRun) return;
  activeRun = true;
  try {
    let job = await getJob();
    if (!job || job.status !== "running") return;

    if (!job.workerTabId) {
      const tab = await chrome.tabs.create({ url: "about:blank", active: false });
      job.workerTabId = tab.id;
      await setJob(job);
    }

    while (job.currentIndex < job.targets.length) {
      job = await getJob();
      if (!job || job.status !== "running") break;
      const target = job.targets[job.currentIndex];
      job.currentTarget = target;
      await setJob(job);

      let outcome;
      try {
        await chrome.tabs.update(job.workerTabId, { url: target.url, active: false });
        await waitForTabComplete(job.workerTabId);
        await sleep(1200);
        const injection = await chrome.scripting.executeScript({
          target: { tabId: job.workerTabId },
          func: blockProfileInPage,
          args: [target]
        });
        outcome = injection[0]?.result ?? { status: "failed", reason: "页面脚本没有返回结果" };
      } catch (error) {
        outcome = { status: "failed", reason: error.message || String(error) };
      }

      job = await getJob();
      if (!job || job.status !== "running") break;
      job.results.push({ ...target, ...outcome, finishedAt: new Date().toISOString() });
      job.currentIndex += 1;
      job.currentTarget = null;
      await setJob(job);
      await sleep(900);
    }

    job = await getJob();
    if (job?.workerTabId) {
      await chrome.tabs.remove(job.workerTabId).catch(() => {});
      job.workerTabId = null;
    }
    if (job?.status === "running") {
      job.status = "completed";
      job.completedAt = new Date().toISOString();
    }
    if (job) await setJob(job);
  } finally {
    activeRun = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_JOB") {
    getJob().then((job) => sendResponse({ ok: true, job }));
    return true;
  }
  if (message?.type === "GET_BLOCKLIST") {
    getBundledBlocklist()
      .then((blocklist) => sendResponse({ ok: true, blocklist }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "START_BUNDLED_JOB") {
    (async () => {
      const existing = await getJob();
      if (existing?.status === "running") {
        sendResponse({ ok: false, error: "已有任务正在执行" });
        return;
      }
      const blocklist = await getBundledBlocklist();
      if (!blocklist.targets.length) {
        sendResponse({ ok: false, error: "扩展内置名单目前为空" });
        return;
      }
      const job = {
        id: crypto.randomUUID(),
        status: "running",
        blocklistVersion: blocklist.version,
        targets: blocklist.targets,
        results: [],
        currentIndex: 0,
        currentTarget: null,
        workerTabId: null,
        startedAt: new Date().toISOString()
      };
      await setJob(job);
      sendResponse({ ok: true, job });
      void runJob();
    })().catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "CANCEL_JOB") {
    (async () => {
      const job = await getJob();
      if (job?.status === "running") {
        job.status = "cancelled";
        job.currentTarget = null;
        if (job.workerTabId) await chrome.tabs.remove(job.workerTabId).catch(() => {});
        job.workerTabId = null;
        await setJob(job);
      }
      sendResponse({ ok: true, job });
    })();
    return true;
  }
});

chrome.runtime.onStartup.addListener(() => void runJob());
void runJob();

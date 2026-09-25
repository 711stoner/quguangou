const $ = (selector) => document.querySelector(selector);
const blocklistView = $("#blocklistView");
const progressView = $("#progressView");
let blocklist = null;
let currentJob = null;
const BATCH_SIZE = 20;

function showOnly(view) {
  [blocklistView, progressView].forEach((item) => item.classList.toggle("hidden", item !== view));
}

function clear(element) {
  element.replaceChildren();
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.remove("hidden");
  setTimeout(() => node.classList.add("hidden"), 2600);
}

function renderBlocklist() {
  $("#blocklistVersion").textContent = `版本 ${blocklist.version}`;
  $("#blocklistDescription").textContent = blocklist.description || "以下账号由扩展发布者预置。";
  const sourceLabel = {
    remote: "在线最新名单",
    cache: "上次在线缓存",
    bundled: "本地备用名单"
  }[blocklist.source] || "社区名单";
  $("#blocklistSummary").textContent = blocklist.targets.length
    ? `名单内共 ${blocklist.targets.length} 个账号 · ${sourceLabel}`
    : `当前名单为空 · ${sourceLabel}`;
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
  if (blocklist.source !== "remote" && blocklist.remoteError) {
    issues.push(`在线名单暂时不可用，当前使用${blocklist.source === "cache" ? "上次在线缓存" : "本地备用名单"}`);
  }
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
    ? `拟人化分批处理：每批最多自动处理 ${BATCH_SIZE} 个账号，完成后强制冷却 30 分钟；冷却结束后需要你手动点击继续下一批。当前名单预计需要操作 ${batchCount} 次。`
    : "当前没有需要处理的账号。";
  $("#startButton").disabled = blocklist.targets.length === 0;
  $("#startButton").textContent = blocklist.targets.length ? `开始处理第 1 批（最多 ${BATCH_SIZE} 个）` : "当前无账号可处理";
  showOnly(blocklistView);
}

function renderJob(job) {
  if (!job) return;
  currentJob = job;
  showOnly(progressView);
  const done = Number.isInteger(job.currentIndex) ? job.currentIndex : job.results.length;
  const total = job.targets.length;
  const batchSize = job.batchSize || BATCH_SIZE;
  const totalBatches = Math.max(1, Math.ceil(total / batchSize));
  const running = job.status === "running";
  const completed = job.status === "completed";
  const batchPaused = job.status === "paused" && job.pauseKind === "batch";
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
  $("#progressTitle").textContent = running ? "正在执行" : completed ? "全部处理完成" : batchPaused ? "本批处理完成" : "任务已暂停";
  $("#batchStatus").textContent = completed
    ? `共 ${totalBatches} 批 · 已全部完成`
    : batchPaused
      ? cooling
        ? `第 ${batchNumber} / ${totalBatches} 批已完成 · 冷却 30 分钟中`
        : `第 ${batchNumber} / ${totalBatches} 批已完成 · 可以手动继续下一批`
      : `第 ${batchNumber} / ${totalBatches} 批 · 每批最多 ${batchSize} 个`;
  $("#progressText").textContent = running
    ? `本批 ${batchDone} / ${batchTotal} · 总进度 ${done} / ${total}${job.currentTarget ? ` · 正在处理 ${job.currentTarget.label}` : ""}`
    : `总进度 ${done} / ${total}`;
  if (batchPaused && job.resumeAt) {
    $("#progressText").textContent += ` · ${cooling ? "冷却结束时间" : "冷却已结束"}：${new Date(job.resumeAt).toLocaleString()}`;
  } else if (job.pauseReason) {
    $("#progressText").textContent += ` · ${job.pauseReason}`;
  }

  const statusLabel = { blocked: "已拉黑", already_blocked: "已拉黑过", failed: "失败" };
  const resultList = $("#resultList");
  clear(resultList);
  job.results.forEach((result) => {
    const row = document.createElement("div");
    row.classList.add("result-row", result.status);
    const detail = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = result.label;
    detail.append(label);
    if (result.status === "failed") {
      const reason = document.createElement("small");
      reason.textContent = result.reason || "未返回失败原因";
      detail.append(reason);
    }
    const status = document.createElement("span");
    status.textContent = statusLabel[result.status] || result.status;
    row.append(detail, status);
    resultList.append(row);
  });
  $("#valuePromo").classList.toggle("hidden", !completed);
  $("#cancelButton").classList.toggle("hidden", !running);
  $("#newTaskButton").classList.toggle("hidden", running);
  $("#newTaskButton").disabled = Boolean(cooling);
  $("#newTaskButton").textContent = completed
    ? "暂时不用，返回名单"
    : batchPaused
      ? cooling
        ? `冷却中，${new Date(job.resumeAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} 后可继续`
        : `继续处理第 ${Math.min(batchNumber + 1, totalBatches)} 批`
      : "继续剩余账号";
}

$("#startButton").addEventListener("click", async () => {
  if (!blocklist?.targets.length) return;
  $("#startButton").disabled = true;
  const response = await chrome.runtime.sendMessage({ type: "START_BUNDLED_JOB" });
  if (!response?.ok) {
    toast(response?.error || "任务启动失败");
    $("#startButton").disabled = false;
    return;
  }
  renderJob(response.job);
});

$("#cancelButton").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "CANCEL_JOB" });
  if (response?.job) renderJob(response.job);
});

$("#newTaskButton").addEventListener("click", async () => {
  if (currentJob && currentJob.currentIndex < currentJob.targets.length) {
    const response = await chrome.runtime.sendMessage({ type: "START_BUNDLED_JOB" });
    if (!response?.ok) return toast(response?.error || "无法继续任务");
    renderJob(response.job);
    return;
  }
  await chrome.storage.local.remove("quguangouJob");
  renderBlocklist();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "JOB_UPDATED") renderJob(message.job);
});

const supportPanel = $("#supportPanel");
const feedbackPanel = $("#feedbackPanel");
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
  if (!supportPanel.hidden) setSupportOpen(false);
  if (!feedbackPanel.hidden) setFeedbackOpen(false);
});

async function initialize() {
  const [jobResponse, blocklistResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_JOB" }),
    chrome.runtime.sendMessage({ type: "GET_BLOCKLIST" })
  ]);
  if (!blocklistResponse?.ok) throw new Error(blocklistResponse?.error || "无法读取社区名单");
  blocklist = blocklistResponse.blocklist;
  if (jobResponse?.job) renderJob(jobResponse.job);
  else renderBlocklist();
}

initialize().catch((error) => toast(error.message || String(error)));

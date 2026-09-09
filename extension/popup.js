const $ = (selector) => document.querySelector(selector);
const blocklistView = $("#blocklistView");
const progressView = $("#progressView");
let blocklist = null;

function showOnly(view) {
  [blocklistView, progressView].forEach((item) => item.classList.toggle("hidden", item !== view));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
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
  $("#blocklistSummary").textContent = blocklist.targets.length
    ? `名单内共 ${blocklist.targets.length} 个账号`
    : "内置名单目前为空";
  $("#targetList").innerHTML = blocklist.targets.map((target, index) => `
    <div class="target-row"><span class="index">${index + 1}</span><span>${escapeHtml(target.label)}</span></div>
  `).join("");

  const issues = [];
  if (blocklist.duplicates.length) issues.push(`名单中已自动移除 ${blocklist.duplicates.length} 个重复项`);
  for (const item of blocklist.invalid) issues.push(`${item.raw || "空白项"}：${item.error}`);
  $("#issueList").innerHTML = issues.map((issue) => `<p>${escapeHtml(issue)}</p>`).join("");
  $("#startButton").disabled = blocklist.targets.length === 0;
  showOnly(blocklistView);
}

function renderJob(job) {
  if (!job) return;
  showOnly(progressView);
  const done = job.results.length;
  const total = job.targets.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  $("#progressBar").style.width = `${percent}%`;
  const running = job.status === "running";
  $("#progressTitle").textContent = running ? "正在执行" : job.status === "completed" ? "任务完成" : "任务已停止";
  $("#progressText").textContent = running
    ? `${done} / ${total}${job.currentTarget ? ` · 正在处理 ${job.currentTarget.label}` : ""}`
    : `${done} / ${total}`;

  const statusLabel = { blocked: "已拉黑", already_blocked: "已拉黑过", failed: "失败" };
  $("#resultList").innerHTML = job.results.map((result) => `
    <div class="result-row ${escapeHtml(result.status)}">
      <div><strong>${escapeHtml(result.label)}</strong>${result.status === "failed" ? `<small>${escapeHtml(result.reason || "未返回失败原因")}</small>` : ""}</div>
      <span>${escapeHtml(statusLabel[result.status] || result.status)}</span>
    </div>
  `).join("");
  $("#cancelButton").classList.toggle("hidden", !running);
  $("#newTaskButton").classList.toggle("hidden", running);
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
  await chrome.storage.local.remove("quguangouJob");
  renderBlocklist();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "JOB_UPDATED") renderJob(message.job);
});

async function initialize() {
  const [jobResponse, blocklistResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_JOB" }),
    chrome.runtime.sendMessage({ type: "GET_BLOCKLIST" })
  ]);
  if (!blocklistResponse?.ok) throw new Error(blocklistResponse?.error || "无法读取扩展内置名单");
  blocklist = blocklistResponse.blocklist;
  if (jobResponse?.job) renderJob(jobResponse.job);
  else renderBlocklist();
}

initialize().catch((error) => toast(error.message || String(error)));

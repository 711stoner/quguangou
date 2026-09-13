const downloadCountElement = document.querySelector("#totalDownloadCount");
const DOWNLOAD_COUNT_BASELINE = 60;

async function renderTotalDownloadCount() {
  if (!downloadCountElement) return;
  try {
    const response = await fetch("https://api.github.com/repos/711stoner/quguangou/releases?per_page=100");
    if (!response.ok) throw new Error("download count unavailable");
    const releases = await response.json();
    const releaseDownloads = releases.flatMap((release) => release.assets)
      .filter((asset) => /^quguangou-chrome-v[\d.]+\.zip$/.test(asset.name))
      .reduce((total, asset) => total + asset.download_count, 0);
    const count = DOWNLOAD_COUNT_BASELINE + releaseDownloads;
    downloadCountElement.textContent = count.toLocaleString("zh-CN");
  } catch {
    downloadCountElement.textContent = DOWNLOAD_COUNT_BASELINE.toLocaleString("zh-CN");
  }
}

renderTotalDownloadCount();

const messageForm = document.querySelector("#messageForm");
if (messageForm) {
  messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const feedbackUrl = "https://x.com/woyongyuangeson/status/2098974760801870134?s=20";
    const messageStatus = document.querySelector("#messageStatus");
    if (messageStatus) {
      messageStatus.textContent = "正在打开 X 评论区。请复制你的留言内容，到评论区公开提交。";
    }
    window.open(feedbackUrl, "_blank", "noopener,noreferrer");
  });
}

const yearElement = document.querySelector("#year");
if (yearElement) yearElement.textContent = new Date().getFullYear();

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add("visible");
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

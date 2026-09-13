const downloadCountElement = document.querySelector("#totalDownloadCount");

async function renderTotalDownloadCount() {
  if (!downloadCountElement) return;
  try {
    const response = await fetch("https://api.github.com/repos/711stoner/quguangou/releases/tags/v0.2.12");
    if (!response.ok) throw new Error("download count unavailable");
    const release = await response.json();
    const asset = release.assets.find((item) => item.name === "quguangou-chrome-v0.2.12.zip");
    const count = asset ? asset.download_count : 0;
    downloadCountElement.textContent = count.toLocaleString("zh-CN");
  } catch {
    downloadCountElement.textContent = "暂时无法读取";
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

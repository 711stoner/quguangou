const downloadCountElement = document.querySelector("#totalDownloadCount");

async function renderTotalDownloadCount() {
  if (!downloadCountElement) return;
  try {
    const response = await fetch("https://api.github.com/repos/711stoner/quguangou/releases/tags/v0.2.8");
    if (!response.ok) throw new Error("download count unavailable");
    const release = await response.json();
    const asset = release.assets.find((item) => item.name === "quguangou-chrome-v0.2.8.zip");
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
    const messageStatus = document.querySelector("#messageStatus");
    if (messageStatus) {
      messageStatus.textContent = "X 留言入口正在准备中。你的内容可以先保留在这里，等链接补上后再提交。";
    }
  });
}

const yearElement = document.querySelector("#year");
if (yearElement) yearElement.textContent = new Date().getFullYear();

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add("visible");
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

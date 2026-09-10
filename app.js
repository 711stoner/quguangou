const downloadCountElement = document.querySelector("#totalDownloadCount");

async function renderTotalDownloadCount() {
  if (!downloadCountElement) return;
  try {
    const response = await fetch("https://api.github.com/repos/711stoner/quguangou/releases/tags/v0.2.7");
    if (!response.ok) throw new Error("download count unavailable");
    const release = await response.json();
    const asset = release.assets.find((item) => item.name === "quguangou-chrome-v0.2.7.zip");
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
    const title = document.querySelector("#messageTitle").value.trim();
    const body = document.querySelector("#messageBody").value.trim();
    if (!title || !body) return;
    const subject = encodeURIComponent(`取关狗留言：${title}`);
    const mailBody = encodeURIComponent(`${body}\n\n---\n来自取关狗官网留言页`);
    window.location.href = `mailto:wuhuwang65@gmail.com?subject=${subject}&body=${mailBody}`;
  });
}

const yearElement = document.querySelector("#year");
if (yearElement) yearElement.textContent = new Date().getFullYear();

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add("visible");
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

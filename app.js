const downloadStorageKey = "quguangouDeviceDownloadCount:v0.2.6";
const downloadCountElement = document.querySelector("#deviceDownloadCount");

function readDeviceDownloadCount() {
  const rawValue = window.localStorage.getItem(downloadStorageKey);
  const count = Number.parseInt(rawValue || "0", 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function renderDeviceDownloadCount() {
  if (!downloadCountElement) return;
  downloadCountElement.textContent = String(readDeviceDownloadCount());
}

document.querySelectorAll(".download-link").forEach((link) => {
  link.addEventListener("click", () => {
    const nextCount = readDeviceDownloadCount() + 1;
    window.localStorage.setItem(downloadStorageKey, String(nextCount));
    renderDeviceDownloadCount();
  });
});

renderDeviceDownloadCount();

const messageForm = document.querySelector("#messageForm");
if (messageForm) {
  messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = document.querySelector("#messageTitle").value.trim();
    const body = document.querySelector("#messageBody").value.trim();
    if (!title || !body) return;
    const params = new URLSearchParams({
      labels: "留言",
      title: `[留言] ${title}`,
      body: `${body}\n\n---\n来自取关狗官网留言页`
    });
    window.open(`https://github.com/711stoner/quguangou/issues/new?${params}`, "_blank", "noopener,noreferrer");
  });
}

const yearElement = document.querySelector("#year");
if (yearElement) yearElement.textContent = new Date().getFullYear();

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add("visible");
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

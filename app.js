document.querySelector("#messageForm").addEventListener("submit", (event) => {
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
document.querySelector("#year").textContent = new Date().getFullYear();

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add("visible");
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

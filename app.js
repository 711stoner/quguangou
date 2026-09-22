const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) entry.target.classList.add("visible");
  }
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

const blocklistStats = document.querySelector("#blocklistStats");

if (blocklistStats) {
  fetch("extension/data/blocklist.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("blocklist request failed");
      return response.json();
    })
    .then((data) => {
      const count = Array.isArray(data.accounts) ? data.accounts.length : null;
      const date = data.updated_at;
      if (!count || !date) return;
      blocklistStats.innerHTML = `截至 ${date}，社区名单已收录 <strong>${count}</strong> 个账号。`;
    })
    .catch(() => {});
}

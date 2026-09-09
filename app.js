const repo = "711stoner/quguangou";
const guestbookIssue = 1;
const commentsNode = document.querySelector("#comments");

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function renderComments(comments) {
  commentsNode.replaceChildren();
  if (!comments.length) {
    const empty = document.createElement("div");
    empty.className = "comment-status";
    empty.textContent = "还没有留言。欢迎留下第一句话。";
    commentsNode.append(empty);
    return;
  }

  for (const item of comments.slice(-12).reverse()) {
    const card = document.createElement("article");
    card.className = "comment";
    const head = document.createElement("div");
    head.className = "comment-head";
    const avatar = document.createElement("img");
    avatar.src = item.user.avatar_url;
    avatar.alt = "";
    avatar.loading = "lazy";
    const meta = document.createElement("div");
    const author = document.createElement("strong");
    author.textContent = `@${item.user.login}`;
    const time = document.createElement("time");
    time.dateTime = item.created_at;
    time.textContent = formatDate(item.created_at);
    meta.append(author, time);
    head.append(avatar, meta);
    const body = document.createElement("p");
    body.className = "comment-body";
    body.textContent = item.body.length > 500 ? `${item.body.slice(0, 500)}…` : item.body;
    card.append(head, body);
    commentsNode.append(card);
  }
}

async function loadComments() {
  commentsNode.innerHTML = '<div class="comment-status">正在读取公开留言…</div>';
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues/${guestbookIssue}/comments`, {
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    renderComments(await response.json());
  } catch {
    commentsNode.innerHTML = '<div class="comment-status">暂时无法读取留言，可以点击上方按钮前往 GitHub 查看。</div>';
  }
}

document.querySelector("#refreshComments").addEventListener("click", loadComments);
document.querySelector("#year").textContent = new Date().getFullYear();

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add("visible");
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

loadComments();

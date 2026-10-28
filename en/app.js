const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) entry.target.classList.add("visible");
  }
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

document.querySelectorAll("[data-carousel]").forEach((carousel) => {
  const track = carousel.querySelector(".carousel-track");
  const slides = [...carousel.querySelectorAll(".carousel-slide")];
  const dots = [...carousel.querySelectorAll("[data-carousel-dot]")];
  const prev = carousel.querySelector("[data-carousel-prev]");
  const next = carousel.querySelector("[data-carousel-next]");
  let index = 0;

  const render = () => {
    track.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((slide, i) => slide.classList.toggle("is-active", i === index));
    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
  };

  const go = (nextIndex) => {
    index = (nextIndex + slides.length) % slides.length;
    render();
  };

  prev?.addEventListener("click", () => go(index - 1));
  next?.addEventListener("click", () => go(index + 1));
  dots.forEach((dot, i) => dot.addEventListener("click", () => go(i)));

  let startX = null;
  carousel.addEventListener("pointerdown", (event) => { startX = event.clientX; });
  carousel.addEventListener("pointerup", (event) => {
    if (startX === null) return;
    const delta = event.clientX - startX;
    if (Math.abs(delta) > 55) go(index + (delta < 0 ? 1 : -1));
    startX = null;
  });

  render();
});

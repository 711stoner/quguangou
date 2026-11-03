export function getValuePromoProbability({ shows = 0, missStreak = 0 } = {}) {
  const shown = Math.max(0, Number(shows) || 0);
  const misses = Math.max(0, Number(missStreak) || 0);
  const base = shown === 0 ? 0.65 : shown === 1 ? 0.60 : 0.55;
  const recovery = Math.min(0.25, misses * 0.08);
  return Math.min(0.85, base + recovery);
}

// Read-only relationship scan pacing. These are deliberate capacity limits,
// not a way to bypass server-enforced quotas. The scanner MUST stop on 429.
export const RECENT_RATE_LIMIT_WINDOW_MS = 2 * 60 * 60 * 1000;
export function recentlyRateLimited(lastRateLimitAt, now = Date.now()) {
  const t = Number(lastRateLimitAt || 0);
  return t > 0 && now >= t && now - t < RECENT_RATE_LIMIT_WINDOW_MS;
}
export function cursorPacingWindow(pageNumber, recentlyLimited = false) {
  const page = Math.max(1, Math.floor(Number(pageNumber) || 1));
  if (page % 18 === 0) return recentlyLimited ? [60000, 85000] : [35000, 50000];
  if (page % 5 === 0) return recentlyLimited ? [24000, 34000] : [14000, 22000];
  return recentlyLimited ? [12500, 17500] : [7000, 10500];
}
export function domPacingWindow(atBottom, recentlyLimited = false) {
  if (recentlyLimited) return atBottom ? [4200, 6000] : [3000, 4500];
  return atBottom ? [2500, 3700] : [1750, 2850];
}
// Progress does not instantly erase a genuine recent 429 history: otherwise
// each page after cooldown resets the circuit breaker and can loop forever.
export function shouldClearRecoveryCount(lastRateLimitAt, now = Date.now()) {
  return !recentlyRateLimited(lastRateLimitAt, now);
}
export function advertisedRetryAfterMs(text) {
  const m = String(text || '').match(/(?:retry_after_ms|RETRY_AFTER_MS)\s*[=:]\s*(\d{1,9})/i);
  if (!m) return 0;
  return Math.min(24 * 60 * 60 * 1000, Math.max(0, Number(m[1]) || 0));
}

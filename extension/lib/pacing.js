export function reserveAttempt(state = {}, now = Date.now()) {
  const count = state.cooldownUntil && now >= state.cooldownUntil ? 0 : (state.count || 0);
  const waitUntil = Math.max(state.nextAt || 0, state.cooldownUntil > now ? state.cooldownUntil : 0);
  if (waitUntil > now) return { allowed: false, waitUntil };
  const used = count + 1;
  return { allowed: true, state: {
    count: used,
    nextAt: now + 15_000,
    cooldownUntil: used >= 20 ? now + 1_800_000 : 0
  } };
}

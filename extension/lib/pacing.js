function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function reserveAttempt(state = {}, now = Date.now()) {
  const count = state.cooldownUntil && now >= state.cooldownUntil ? 0 : (state.count || 0);
  const waitUntil = Math.max(state.nextAt || 0, state.cooldownUntil > now ? state.cooldownUntil : 0);
  if (waitUntil > now) return { allowed: false, waitUntil };

  const used = count + 1;
  if (used >= 20) {
    return {
      allowed: true,
      state: {
        count: used,
        nextAt: now + randomInt(16_000, 27_000),
        cooldownUntil: now + 1_800_000,
        nextBreakAfter: null
      }
    };
  }

  let nextBreakAfter = Number.isInteger(state.nextBreakAfter) && state.nextBreakAfter > count
    ? state.nextBreakAfter
    : count + randomInt(5, 8);

  let delayMs = randomInt(13_000, 27_000);
  if (used >= nextBreakAfter) {
    delayMs = randomInt(45_000, 90_000);
    nextBreakAfter = used + randomInt(5, 8);
  }

  return {
    allowed: true,
    state: {
      count: used,
      nextAt: now + delayMs,
      cooldownUntil: 0,
      nextBreakAfter
    }
  };
}

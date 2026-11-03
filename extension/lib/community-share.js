export function planCommunityPromptSchedule(totalTargets, batchSize = 20, seed = "") {
  const total = Math.max(0, Number(totalTargets) || 0);
  const size = Math.max(1, Number(batchSize) || 20);
  const totalBatches = Math.max(1, Math.ceil(total / size));
  const totalPauses = Math.max(0, totalBatches - 1);
  if (totalPauses === 0) {
    return { pauseBatches: [], showOnCompletion: true, totalPauses };
  }

  let state = 2166136261;
  const source = String(seed || `${total}:${size}`);
  for (let i = 0; i < source.length; i += 1) {
    state ^= source.charCodeAt(i);
    state = Math.imul(state, 16777619) >>> 0;
  }
  if (!state) state = 0x9e3779b9;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };

  const candidates = Array.from({ length: totalPauses }, (_, index) => index + 1);
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const promptCount = totalPauses >= 3 ? 3 : 1;
  return {
    pauseBatches: candidates.slice(0, promptCount).sort((a, b) => a - b),
    showOnCompletion: false,
    totalPauses
  };
}

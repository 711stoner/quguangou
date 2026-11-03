/**
 * Informational indicator only. X profile totals can include withheld or
 * unavailable accounts; never use this to mark a scan complete or create users.
 */
export function remainingProfileCountGap(scan) {
  if (scan?.status !== 'running') return null;
  const phase = scan?.phase;
  if (phase !== 'following' && phase !== 'followers') return null;
  const key = phase === 'following' ? 'Following' : 'Followers';
  const expected = Number(scan?.['profile' + key + 'Count']);
  const isExact = Boolean(scan?.['profile' + key + 'Exact']);
  if (!isExact || !Number.isSafeInteger(expected) || expected <= 0) return null;
  const read = Math.max(Number(scan?.progress?.[phase] || 0),
    Number(scan?.[phase + 'Count'] || 0),
    Array.isArray(scan?.partial?.[phase]) ? scan.partial[phase].length : 0);
  if (!Number.isFinite(read) || read < 0) return null;
  const missing = expected - read;
  const nearLimit = Math.max(25, Math.min(50, Math.ceil(expected * 0.01)));
  return missing > 0 && missing <= nearLimit ? {phase, missing, expected, read} : null;
}

/** If the scan reached a confirmed terminal frontier with fewer followers
 * than an exact profile count, surface a warning: missing followers can make
 * a mutual account look like a non-follower. Never invent missing identities. */
export function completedFollowerCountGap(scan) {
  if (scan?.status !== 'completed' || !scan?.profileFollowersExact) return null;
  const displayed=Number(scan?.profileFollowersCount);
  if (!Number.isSafeInteger(displayed) || displayed<=0) return null;
  const tolerance=Number(scan?.profileFollowersTolerance || 0);
  const required=Math.max(0,displayed-(Number.isFinite(tolerance)?tolerance:0));
  const actual=Math.max(Number(scan?.followersCount || 0),Number(scan?.progress?.followers || 0));
  if (!Number.isFinite(actual) || actual>=required) return null;
  return {missing: required-actual,required,actual};
}

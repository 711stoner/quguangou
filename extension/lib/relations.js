export function canonicalHandle(value) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}

export function dedupeUsers(users = []) {
  const map = new Map();
  for (const user of users) {
    const key = canonicalHandle(user?.username);
    if (!key || map.has(key)) continue;
    map.set(key, { ...user, username: String(user.username).replace(/^@/, "") });
  }
  return [...map.values()];
}


export function mergeUsersPreferLatest(existingUsers = [], incomingUsers = []) {
  const map = new Map();
  for (const user of [...existingUsers, ...incomingUsers]) {
    const key = canonicalHandle(user?.username);
    if (!key) continue;
    const previous = map.get(key);
    if (!previous) {
      map.set(key, { ...user, username: String(user.username).replace(/^@/, "") });
      continue;
    }
    map.set(key, {
      ...previous,
      ...user,
      username: String(user.username || previous.username).replace(/^@/, ""),
      displayName: user.displayName || previous.displayName || "",
      avatar: user.avatar || previous.avatar || "",
      verified: Boolean(previous.verified || user.verified)
    });
  }
  return [...map.values()];
}

export function mergeRunningPersonalScan(existing, incoming) {
  if (!existing || !incoming || existing.id !== incoming.id) return incoming;
  if (existing.status !== "running" || incoming.status !== "running") return incoming;

  const merged = { ...existing, ...incoming };
  const existingProgress = existing.progress || {};
  const incomingProgress = incoming.progress || {};
  merged.progress = { ...existingProgress, ...incomingProgress };
  merged.partial = { ...(existing.partial || {}), ...(incoming.partial || {}) };
  merged.relationCompleted = { ...(existing.relationCompleted || {}), ...(incoming.relationCompleted || {}) };

  const phaseRank = { account: 0, following: 1, followers: 2, completed: 3 };
  if ((phaseRank[existing.phase] ?? -1) > (phaseRank[incoming.phase] ?? -1)) merged.phase = existing.phase;
  merged.initialized = Boolean(existing.initialized || incoming.initialized);
  merged.username = incoming.username || existing.username || null;

  for (const relation of ["following", "followers"]) {
    const users = mergeUsersPreferLatest(existing.partial?.[relation] || [], incoming.partial?.[relation] || []);
    merged.partial[relation] = users;
    merged.progress[relation] = Math.max(
      Number(existingProgress[relation] || 0),
      Number(incomingProgress[relation] || 0),
      users.length
    );
    merged.progress[relation + "ResumeTarget"] = Math.max(
      Number(existingProgress[relation + "ResumeTarget"] || 0),
      Number(incomingProgress[relation + "ResumeTarget"] || 0),
      merged.progress[relation]
    );
    merged.relationCompleted[relation] = Boolean(existing.relationCompleted?.[relation] || incoming.relationCompleted?.[relation]);
    merged.progress[relation + "CursorDisabled"] = Boolean(
      existingProgress[relation + "CursorDisabled"] || incomingProgress[relation + "CursorDisabled"]
    );
    if (merged.progress[relation + "CursorDisabled"]) {
      merged.progress[relation + "Cursor"] = "";
      merged.progress[relation + "CursorDisableReason"] = incomingProgress[relation + "CursorDisableReason"]
        || existingProgress[relation + "CursorDisableReason"]
        || merged.progress[relation + "CursorDisableReason"]
        || "";
    }

    for (const suffix of ["ScrollY", "ScrollHeight", "ResumeTarget", "CursorCount", "CursorResumePages"]) {
      const key = relation + suffix;
      merged.progress[key] = Math.max(Number(existingProgress[key] || 0), Number(incomingProgress[key] || 0));
    }

    const existingCursorCount = Number(existingProgress[relation + "CursorCount"] || 0);
    const incomingCursorCount = Number(incomingProgress[relation + "CursorCount"] || 0);
    const existingCursor = String(existingProgress[relation + "Cursor"] || "");
    const incomingCursor = String(incomingProgress[relation + "Cursor"] || "");
    if ((existingCursor && existingCursorCount > incomingCursorCount) || (!incomingCursor && existingCursor)) {
      merged.progress[relation + "Cursor"] = existingCursor;
      merged.progress[relation + "CursorObservedAt"] = existingProgress[relation + "CursorObservedAt"] || merged.progress[relation + "CursorObservedAt"] || null;
      merged.progress[relation + "CursorSource"] = existingProgress[relation + "CursorSource"] || merged.progress[relation + "CursorSource"];
    }
  }

  merged.followingCount = Math.max(Number(existing.followingCount || 0), Number(incoming.followingCount || 0));
  merged.followersCount = Math.max(Number(existing.followersCount || 0), Number(incoming.followersCount || 0));

  const relationDepth = (scan, relation) => Math.max(
    Number(scan?.progress?.[relation] || 0),
    Array.isArray(scan?.partial?.[relation]) ? scan.partial[relation].length : 0
  );
  const incomingAdvanced = ["following", "followers"].some((relation) =>
    relationDepth(incoming, relation) > relationDepth(existing, relation)
    || (!existing.relationCompleted?.[relation] && Boolean(incoming.relationCompleted?.[relation]))
  ) || ((phaseRank[incoming.phase] ?? -1) > (phaseRank[existing.phase] ?? -1));

  const existingRecoveryAt = Number(existing.nextRecoveryAt || 0);
  const incomingRecoveryAt = Number(incoming.nextRecoveryAt || 0);
  if (!incomingAdvanced && existingRecoveryAt > incomingRecoveryAt) {
    merged.nextRecoveryAt = existing.nextRecoveryAt;
    merged.recoveryPending = existing.recoveryPending;
    merged.recoveryMessage = existing.recoveryMessage;
    merged.lastRecoverableError = existing.lastRecoverableError;
    merged.lastRecoveryAt = existing.lastRecoveryAt;
  }
  if (!incomingAdvanced) {
    merged.consecutiveRecoveryCount = Math.max(
      Number(existing.consecutiveRecoveryCount || 0),
      Number(incoming.consecutiveRecoveryCount || 0)
    );
  }
  return merged;
}

export function evaluateUnknownDomEndCheckpoint(previous = {}, users = [], atBottom = false, stableRounds = 0, sameHeightRounds = 0) {
  if (!atBottom || stableRounds < 18 || sameHeightRounds < 12) {
    return { confirmed: false, checkpoint: previous, eligible: false };
  }
  const handles = users
    .map((user) => canonicalHandle(user?.username))
    .filter(Boolean);
  const count = handles.length;
  const tail = handles.slice(-12).join("|");
  const sameFrontier = Number(previous?.count ?? -1) === count && String(previous?.tail || "") === tail;
  const confirmations = sameFrontier ? Number(previous?.confirmations || 0) + 1 : 1;
  return {
    confirmed: confirmations >= 2,
    eligible: true,
    checkpoint: { count, tail, confirmations }
  };
}

export function requiredRelationCount(profileRelation = {}) {
  if (!profileRelation?.known) return 0;
  return Math.max(
    0,
    Number(profileRelation.minimumExpected || 0) - Number(profileRelation.tolerance || 0)
  );
}

export function getCompletedScanCountMismatch(scan = {}) {
  if (scan?.status !== "completed") return null;
  const relations = [
    { key: "following", label: "我关注的人", profile: "Following" },
    { key: "followers", label: "关注我的人", profile: "Followers" }
  ];
  for (const relation of relations) {
    const profileCount = scan?.["profile" + relation.profile + "Count"];
    const exact = Boolean(scan?.["profile" + relation.profile + "Exact"]);
    if (!Number.isFinite(profileCount) || !exact) continue;
    const tolerance = Number(scan?.["profile" + relation.profile + "Tolerance"] || 0);
    const required = Math.max(0, Number(profileCount) - tolerance);
    const actual = Math.max(
      Number(scan?.[relation.key + "Count"] || 0),
      Number(scan?.progress?.[relation.key] || 0)
    );
    const terminalMismatchValidated = Boolean(scan?.progress?.[relation.key + "MismatchEndValidated"]);
    if (required > 0 && actual < required && !terminalMismatchValidated) {
      return {
        relation: relation.key,
        label: relation.label,
        actual,
        profileCount: Number(profileCount),
        tolerance,
        required,
        missing: required - actual
      };
    }
  }
  return null;
}

export function shouldFallbackCursorAfterNoNewPages(profileRelation = {}, foundSize = 0, noNewPages = 0) {
  if (!profileRelation?.known) return false;
  const required = requiredRelationCount(profileRelation);
  return Number(foundSize || 0) >= required && Number(noNewPages || 0) >= 4;
}

export function shouldFallbackCursorToDom(error) {
  const value = String(error || "").toUpperCase();
  return /(?:^|[^0-9])(?:HTTP_)?(?:400|403|404|410)(?:[^0-9]|$)/.test(value);
}

export function scanStallKind(scan, health, now = Date.now()) {
  if (!scan || scan.status !== "running") return "none";
  const until = Number(scan.rateLimitUntil || scan.nextRecoveryAt || 0);
  if (until > now && /HTTP_429|Too Many Requests|rate.?limit|请求过多/i.test(
    String(scan.lastRecoverableError || scan.pauseReason || ""))) return "cooldown";
  const times = [Number(scan.lastAccountProgressAt || 0), Number(scan.lastForceRestartAt || 0),
    Date.parse(scan.startedAt || "") || 0];
  const since = Math.max(...times.filter((t) => Number.isFinite(t)));
  const idle = since > 0 ? now - since : 0;
  // A newly created worker needs time to finish loading X and acquire its marker.
  if (health?.scanId === scan.id && health.running && !health.windowPresent && idle >= 30_000)
    return "missing";
  if (idle >= 3 * 60_000) return "stalled";
  return "normal";
}

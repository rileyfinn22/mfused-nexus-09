// Sign-in sessions expire one hour after issue. If the device clock is off by
// more than a few minutes, the auth client believes fresh sessions are already
// expired and refreshes in a loop until it is rate limited and signed out.
export const CLOCK_SKEW_LIMIT_MS = 5 * 60 * 1000;

/** Device time minus server time, in ms. Null when the server time is unknown. */
export function computeClockSkewMs(serverDateHeader: string | null, deviceNowMs: number): number | null {
  if (!serverDateHeader) return null;
  const serverMs = Date.parse(serverDateHeader);
  if (Number.isNaN(serverMs)) return null;
  return deviceNowMs - serverMs;
}

export function isClockSkewed(skewMs: number | null): boolean {
  return skewMs !== null && Math.abs(skewMs) > CLOCK_SKEW_LIMIT_MS;
}

/** Reads the site's own Date header (same origin, so it's readable). */
export async function detectClockSkewMs(): Promise<number | null> {
  try {
    const res = await fetch(`/?clock=${Date.now()}`, { method: "HEAD", cache: "no-store" });
    return computeClockSkewMs(res.headers.get("date"), Date.now());
  } catch {
    return null;
  }
}

export function describeSkew(skewMs: number): string {
  const minutes = Math.round(Math.abs(skewMs) / 60000);
  const amount = minutes >= 90 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`;
  return `${amount} ${skewMs > 0 ? "ahead" : "behind"}`;
}

// Devices with a wrong clock (e.g. set manually and not moved back after a
// daylight-saving change) treat every fresh sign-in session as already
// expired, because the server sends an absolute `expires_at` in server time.
// The auth client then refreshes in a loop until it is rate limited and the
// user lands back on the login page. Re-basing `expires_at` on the device's
// own clock (now + expires_in) makes sessions work regardless of clock skew.
// Must be imported before the backend client is created (first import in main.tsx).

type SessionLike = { access_token?: unknown; expires_in?: unknown; expires_at?: unknown };

function rebase(obj: SessionLike | null | undefined, nowSec: number): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.access_token !== "string" || typeof obj.expires_in !== "number") return false;
  obj.expires_at = nowSec + obj.expires_in;
  return true;
}

/** Rewrites expires_at on an auth response body to device time. Returns true if changed. */
export function rebaseSessionExpiry(body: any, nowSec: number): boolean {
  const top = rebase(body, nowSec);
  const nested = rebase(body?.session, nowSec);
  return top || nested;
}

function installAuthClockFix() {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  const w = window as typeof window & { __authClockFix?: boolean };
  if (w.__authClockFix) return;
  w.__authClockFix = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/auth/v1/") || !response.ok) return response;
      if (!(response.headers.get("content-type") || "").includes("application/json")) return response;

      const body = await response.clone().json();
      if (!rebaseSessionExpiry(body, Math.round(Date.now() / 1000))) return response;

      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      return new Response(JSON.stringify(body), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return response;
    }
  };
}

installAuthClockFix();

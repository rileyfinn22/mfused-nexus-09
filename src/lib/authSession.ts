import type { Session } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type CompanyRoleRow = {
  role: string;
  company_id: string;
  companies?: { id: string; name: string } | { id: string; name: string }[] | null;
};

type RestQueryParams = Record<string, string | number | boolean | null | undefined>;

export const AUTH_SESSION_EVENT = "vibe-auth-session";
const AUTH_REST_TIMEOUT_MS = 7000;
const TOKEN_REFRESH_BUFFER_SECONDS = 60;
let refreshInFlight: Promise<Session | null> | null = null;

export const withTimeout = async <T,>(
  promise: PromiseLike<T>,
  timeoutMs = AUTH_REST_TIMEOUT_MS,
  fallback?: T
): Promise<T> => {
  let timeoutId: number | undefined;
  const hasFallback = fallback !== undefined;

  const timeoutPromise = new Promise<T>((resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      if (hasFallback) {
        resolve(fallback as T);
      } else {
        reject(new Error("Request timed out"));
      }
    }, timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
};

export const getStoredUserId = () => readStoredAuthSession()?.user?.id ?? null;

const getExpectedAuthStorageKey = () => {
  try {
    const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
};

const isUsableSession = (value: unknown): value is Session => {
  const session = value as Session | null | undefined;
  return Boolean(session?.access_token && session?.user?.id);
};

const getSessionExpiry = (session: Session | null | undefined) => {
  const expiresAt = Number(session?.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt > 0) return expiresAt;

  const token = session?.access_token;
  if (!token) return null;

  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = JSON.parse(window.atob(padded));
    const exp = Number(decoded?.exp);
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
};

const isSessionExpiredOrExpiring = (session: Session | null | undefined) => {
  const expiry = getSessionExpiry(session);
  if (!expiry) return false;
  return expiry <= Math.floor(Date.now() / 1000) + TOKEN_REFRESH_BUFFER_SECONDS;
};

const parseStoredSession = (raw: string | null): Session | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed?.session ?? parsed;
    return isUsableSession(session) ? session : null;
  } catch {
    return null;
  }
};

export const readStoredAuthSession = (): Session | null => {
  if (typeof window === "undefined") return null;

  const expectedKey = getExpectedAuthStorageKey();
  if (expectedKey) {
    const expectedSession = parseStoredSession(window.localStorage.getItem(expectedKey));
    if (expectedSession) return expectedSession;
  }

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;

    const session = parseStoredSession(window.localStorage.getItem(key));
    if (session) return session;
  }

  return null;
};

export const dispatchAuthSession = (session: Session | null | undefined) => {
  if (typeof window === "undefined" || !isUsableSession(session)) return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: { session } }));
};

const persistAuthSession = (session: Session) => {
  if (typeof window === "undefined" || !isUsableSession(session)) return;

  const expectedKey = getExpectedAuthStorageKey();
  if (expectedKey) {
    window.localStorage.setItem(expectedKey, JSON.stringify(session));
  }

  dispatchAuthSession(session);
};

const refreshStoredAuthSession = async (session: Session): Promise<Session | null> => {
  if (!session?.refresh_token) return null;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_REST_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const refreshed = (await response.json()) as Session;
    if (!isUsableSession(refreshed)) return null;

    persistAuthSession(refreshed);
    return refreshed;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const getFreshAuthSession = async (sessionOverride?: Session | null): Promise<Session | null> => {
  const session = sessionOverride ?? readStoredAuthSession();
  if (!isUsableSession(session)) return null;
  if (!isSessionExpiredOrExpiring(session)) return session;

  if (!refreshInFlight) {
    refreshInFlight = refreshStoredAuthSession(session).finally(() => {
      refreshInFlight = null;
    });
  }

  const refreshed = await refreshInFlight;
  if (isUsableSession(refreshed)) return refreshed;

  const latestStoredSession = readStoredAuthSession();
  return isUsableSession(latestStoredSession) ? latestStoredSession : null;
};

export const fetchUserCompanyRolesViaRest = async (session: Session): Promise<CompanyRoleRow[]> => {
  const freshSession = await getFreshAuthSession(session);
  if (!isUsableSession(freshSession)) return [];

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_REST_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      select: "role,company_id,companies:company_id(id,name)",
      user_id: `eq.${session.user.id}`,
    });

    const response = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?${params.toString()}`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${freshSession.access_token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Company roles load failed (${response.status})`);
    }

    return (await response.json()) as CompanyRoleRow[];
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const formatPostgrestInFilter = (values: string[]) =>
  `in.(${values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")})`;

export const fetchRestRowsViaAuth = async <T = any>(
  table: string,
  params: RestQueryParams,
  options?: { session?: Session | null; timeoutMs?: number }
): Promise<T[]> => {
  const session = await getFreshAuthSession(options?.session);
  if (!isUsableSession(session)) return [];

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options?.timeoutMs ?? AUTH_REST_TIMEOUT_MS);

  try {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    });

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${searchParams.toString()}`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${table} load failed (${response.status})`);
    }

    return (await response.json()) as T[];
  } finally {
    window.clearTimeout(timeoutId);
  }
};
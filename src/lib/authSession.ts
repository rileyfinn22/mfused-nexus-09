import type { Session } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type CompanyRoleRow = {
  role: string;
  company_id: string;
  companies?: { id: string; name: string } | { id: string; name: string }[] | null;
};

export const AUTH_SESSION_EVENT = "vibe-auth-session";
const AUTH_REST_TIMEOUT_MS = 30000;

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

export const fetchUserCompanyRolesViaRest = async (session: Session): Promise<CompanyRoleRow[]> => {
  if (!isUsableSession(session)) return [];

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
        Authorization: `Bearer ${session.access_token}`,
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
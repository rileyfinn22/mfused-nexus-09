const DEFAULT_FETCH_TIMEOUT_MS = 12000;
const FETCH_TIMEOUT_FLAG = "__vibeFetchTimeoutInstalled";

declare global {
  interface Window {
    [FETCH_TIMEOUT_FLAG]?: boolean;
  }
}

const isBackendRequest = (input: RequestInfo | URL) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) return false;

  const rawUrl = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  return rawUrl.startsWith(supabaseUrl);
};

export const installFetchTimeout = () => {
  if (typeof window === "undefined" || window[FETCH_TIMEOUT_FLAG]) return;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isBackendRequest(input) || init?.signal) {
      return nativeFetch(input, init);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);

    try {
      return await nativeFetch(input, { ...init, signal: controller.signal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  window[FETCH_TIMEOUT_FLAG] = true;
};

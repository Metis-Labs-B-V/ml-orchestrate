import { authStorage } from "./auth";
import { API_PATHS } from "./apiPaths";

const API_TIMEOUT_MS = 15000;

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SERVICE1_BASE_URL || "";
}

function forceClientLogout() {
  authStorage.clear();
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/dashboard")) {
    window.location.replace("/");
  }
}

async function isTokenInvalidOrBlacklisted(response: Response) {
  if (![401, 403].includes(response.status)) {
    return false;
  }
  let payload: unknown = null;
  try {
    payload = await response.clone().json();
  } catch {
    return response.status === 401;
  }
  const asText = JSON.stringify(payload).toLowerCase();
  if (!asText.includes("token")) {
    return response.status === 401;
  }
  return (
    asText.includes("expired")
    || asText.includes("not valid")
    || asText.includes("blacklist")
    || asText.includes("blacklisted")
    || asText.includes("token_not_valid")
  );
}

async function refreshAccessToken() {
  const refresh = authStorage.getRefresh();
  if (!refresh) {
    return null;
  }
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return null;
  }
  const response = await fetch(`${baseUrl}${API_PATHS.auth.refresh}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!response.ok) {
    return null;
  }
  const payload = await response.json();
  const access = payload?.data?.access;
  const newRefresh = payload?.data?.refresh || refresh;
  if (access) {
    authStorage.updateTokens({ access, refresh: newRefresh });
    return access;
  }
  return null;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean } = { auth: true }
) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing API base URL.");
  }
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");

  if (options.auth) {
    const access = authStorage.getAccess();
    if (access) {
      headers.set("Authorization", `Bearer ${access}`);
    }
  }

  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401 && options.auth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set("Authorization", `Bearer ${refreshed}`);
      const retryResponse = await fetchWithTimeout(`${baseUrl}${path}`, { ...init, headers });
      if (await isTokenInvalidOrBlacklisted(retryResponse)) {
        forceClientLogout();
      }
      return retryResponse;
    }
    forceClientLogout();
    return response;
  }

  if (options.auth && (await isTokenInvalidOrBlacklisted(response))) {
    forceClientLogout();
  }

  return response;
}

export async function logout() {
  const refresh = authStorage.getRefresh();
  if (!refresh) {
    authStorage.clear();
    return;
  }
  try {
    await apiFetch(API_PATHS.auth.logout, {
      method: "POST",
      body: JSON.stringify({ refresh }),
    });
  } finally {
    authStorage.clear();
  }
}

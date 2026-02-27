import { authStorage } from "./auth";
import { API_PATHS } from "./apiPaths";

const API_TIMEOUT_MS = 15000;

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SERVICE1_BASE_URL || "";
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
      return fetchWithTimeout(`${baseUrl}${path}`, { ...init, headers });
    }
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

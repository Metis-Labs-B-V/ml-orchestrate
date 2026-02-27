import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_KEY,
  IMPERSONATOR_KEY,
} from "./authConstants";

export type AuthTokens = {
  access: string;
  refresh: string;
};

export type AuthUser = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  is_superuser?: boolean;
  tenants?: Array<{
    id: number;
    name: string;
    slug: string;
    roles: Array<{ id: number; name: string; slug: string }>;
    permissions?: string[];
  }>;
  customers?: Array<{
    id: number;
    name: string;
    slug: string;
    roles: Array<{ id: number; name: string; slug: string }>;
    permissions?: string[];
  }>;
};

const ACCESS_KEY = ACCESS_TOKEN_KEY;
const REFRESH_KEY = REFRESH_TOKEN_KEY;
const COOKIE_MAX_AGE_DAYS = 30;

const isBrowser = () => typeof window !== "undefined";

const shouldUseSecureCookie = () => {
  if (!isBrowser()) {
    return false;
  }
  return window.location?.protocol === "https:";
};

const setCookie = (key: string, value: string, maxAgeSeconds?: number) => {
  if (typeof document === "undefined") {
    return;
  }
  const encoded = encodeURIComponent(value);
  let cookie = `${key}=${encoded}; Path=/; SameSite=Lax`;
  if (typeof maxAgeSeconds === "number") {
    cookie += `; Max-Age=${maxAgeSeconds}`;
  }
  if (shouldUseSecureCookie()) {
    cookie += "; Secure";
  }
  document.cookie = cookie;
};

const clearCookie = (key: string) => {
  if (typeof document === "undefined") {
    return;
  }
  let cookie = `${key}=; Path=/; Max-Age=0; SameSite=Lax`;
  if (shouldUseSecureCookie()) {
    cookie += "; Secure";
  }
  document.cookie = cookie;
};

const getCookie = (key: string) => {
  if (typeof document === "undefined") {
    return null;
  }
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (const part of parts) {
    const [cookieKey, ...rest] = part.split("=");
    if (cookieKey === key) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
};

const getStorages = () => {
  if (typeof window === "undefined") {
    return [] as Storage[];
  }
  return [window.localStorage, window.sessionStorage];
};

const getPreferredStorage = () => {
  const storages = getStorages();
  if (!storages.length) {
    return null;
  }
  const [localStorage, sessionStorage] = storages;
  if (localStorage.getItem(ACCESS_KEY)) {
    return localStorage;
  }
  if (sessionStorage.getItem(ACCESS_KEY)) {
    return sessionStorage;
  }
  return localStorage;
};

const getItem = (key: string) => {
  for (const storage of getStorages()) {
    const value = storage.getItem(key);
    if (value) {
      return value;
    }
  }
  return null;
};

const clearAll = () => {
  for (const storage of getStorages()) {
    storage.removeItem(ACCESS_KEY);
    storage.removeItem(REFRESH_KEY);
    storage.removeItem(USER_KEY);
    storage.removeItem(IMPERSONATOR_KEY);
  }
  clearCookie(ACCESS_KEY);
  clearCookie(REFRESH_KEY);
};

export const authStorage = {
  save(
    tokens: AuthTokens,
    user: AuthUser,
    impersonator?: AuthUser | null,
    persist?: boolean
  ) {
    const storages = getStorages();
    if (!storages.length) {
      return;
    }
    const persistTokens =
      persist === undefined ? true : persist || storages.length === 1;
    const storage = storages[0];
    clearAll();
    storage.setItem(ACCESS_KEY, tokens.access);
    storage.setItem(REFRESH_KEY, tokens.refresh);
    storage.setItem(USER_KEY, JSON.stringify(user));
    const maxAge = persistTokens ? COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 : undefined;
    setCookie(ACCESS_KEY, tokens.access, maxAge);
    setCookie(REFRESH_KEY, tokens.refresh, maxAge);
    if (impersonator) {
      storage.setItem(IMPERSONATOR_KEY, JSON.stringify(impersonator));
    } else {
      storage.removeItem(IMPERSONATOR_KEY);
    }
  },
  updateTokens(tokens: AuthTokens) {
    const storage = getPreferredStorage();
    if (!storage) {
      return;
    }
    storage.setItem(ACCESS_KEY, tokens.access);
    storage.setItem(REFRESH_KEY, tokens.refresh);
    const maxAge =
      isBrowser() && storage === window.localStorage
        ? COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
        : undefined;
    setCookie(ACCESS_KEY, tokens.access, maxAge);
    setCookie(REFRESH_KEY, tokens.refresh, maxAge);
  },
  clear() {
    clearAll();
  },
  getAccess() {
    return getItem(ACCESS_KEY) || getCookie(ACCESS_KEY);
  },
  getRefresh() {
    return getItem(REFRESH_KEY) || getCookie(REFRESH_KEY);
  },
  getUser(): AuthUser | null {
    const raw = getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  },
  getImpersonator(): AuthUser | null {
    const raw = getItem(IMPERSONATOR_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  },
};

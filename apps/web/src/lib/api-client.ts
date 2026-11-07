import { ApiError } from './api-error';

/**
 * The access token lives in memory only (never localStorage), so a script on the page
 * cannot read it from storage. The refresh token is an httpOnly cookie the browser
 * sends to /api/auth by itself.
 */
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
const expiredListeners = new Set<() => void>();

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** Called once when the session cannot be renewed (logged in elsewhere, deactivated…). */
export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  body?: unknown;
  query?: Query;
  form?: FormData;
  signal?: AbortSignal;
}

/** One refresh at a time: parallel 401s all wait for the same renewal. */
export function refreshSession(): Promise<string | null> {
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const { accessToken: token } = (await res.json()) as { accessToken: string };
      setAccessToken(token);
      return token;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
  retried = false,
): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      signal: options.signal,
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw ApiError.network();
  }

  const isAuthRoute = path.startsWith('/auth/login') || path.startsWith('/auth/refresh');
  if (res.status === 401 && !isAuthRoute && !retried) {
    const token = await refreshSession();
    if (token) return request<T>(method, path, options, true);
    expiredListeners.forEach((listener) => listener());
  }

  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) throw ApiError.fromBody(res.status, body);
  return body as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T>(path: string, query?: Query) => request<T>('DELETE', path, { query }),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, { form }),
};

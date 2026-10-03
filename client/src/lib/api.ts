export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

/**
 * JSON POST/GET against the PHP server. Cookies travel same-origin only (the session cookie is
 * HttpOnly and SameSite=Strict, so scripts never see it). Network failures resolve to a
 * synthetic status 0 result instead of throwing, so pages can render an error state.
 */
export async function request<T = Record<string, unknown>>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken && method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data: unknown = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    return { ok: res.ok, status: res.status, data: data as T };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}

export const api = {
  get: <T = Record<string, unknown>>(path: string) => request<T>('GET', path),
  post: <T = Record<string, unknown>>(path: string, body: unknown = {}) =>
    request<T>('POST', path, body),
};

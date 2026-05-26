// 基础 fetch wrapper. 处理:
//   1. 统一错误抛 ManjuError (含 code + message + requestId)
//   2. Authorization 头自动带 access token (从 token store)
//   3. 401 + INVALID_TOKEN → 触发 refresh → 重试一次

import type {
  ApiErrorEnvelope,
  ApiSuccess,
} from './types';

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './tokens';

export const API_BASE_AUTH = import.meta.env.VITE_PUBLIC_API_BASE ?? 'http://localhost:8001';
export const API_BASE_PROJECT = import.meta.env.VITE_PUBLIC_PROJECT_API_BASE ?? 'http://localhost:8002';

const API_BASE = API_BASE_AUTH;

export class ManjuError extends Error {
  code: string;
  status: number;
  requestId: string;
  details?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorEnvelope['error']) {
    super(body.message);
    this.name = 'ManjuError';
    this.code = body.code;
    this.status = status;
    this.requestId = body.request_id;
    this.details = body.details;
  }
}

type Options = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;       // 是否带 access token (默认 true)
  signal?: AbortSignal;
  base?: string;        // 覆盖 base URL (默认 API_BASE_AUTH)
};

let refreshPromise: Promise<string> | null = null;

async function refreshAccess(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  const refresh = getRefreshToken();
  if (!refresh) throw new ManjuError(401, {
    code: 'INVALID_TOKEN',
    message: 'no refresh token',
    request_id: '',
  });

  refreshPromise = (async () => {
    const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      clearTokens();
      const body = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
      throw new ManjuError(res.status, body?.error ?? {
        code: 'INVALID_TOKEN', message: 'refresh failed', request_id: '',
      });
    }
    const json = (await res.json()) as ApiSuccess<{
      access_token: string; refresh_token: string; expires_in: number;
    }>;
    setTokens(json.data.access_token, json.data.refresh_token);
    return json.data.access_token;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function rawRequest<T>(path: string, opts: Options): Promise<{ envelope: ApiSuccess<T> | null; rawText: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...opts.headers,
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false) {
    const access = getAccessToken();
    if (access) headers.Authorization = `Bearer ${access}`;
  }

  const base = opts.base ?? API_BASE;
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (res.status === 204) return { envelope: null, rawText: '' };

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const body = (parsed as ApiErrorEnvelope | null)?.error;
    if (!body) {
      throw new ManjuError(res.status, {
        code: 'INTERNAL_ERROR',
        message: `${res.status} ${res.statusText}`,
        request_id: '',
      });
    }
    throw new ManjuError(res.status, body);
  }

  return { envelope: parsed as ApiSuccess<T>, rawText: text };
}

async function withRefreshRetry<T>(opts: Options, doFetch: () => Promise<T>): Promise<T> {
  try {
    return await doFetch();
  } catch (err) {
    if (err instanceof ManjuError && err.status === 401 && err.code === 'INVALID_TOKEN' && opts.auth !== false) {
      try {
        await refreshAccess();
      } catch {
        throw err;
      }
      return await doFetch();
    }
    throw err;
  }
}

// request: 单对象响应. 自动剥 .data, 返回 T (204 时返回 undefined).
export async function request<T>(path: string, opts: Options = {}): Promise<T> {
  return withRefreshRetry(opts, async () => {
    const { envelope } = await rawRequest<T>(path, opts);
    if (envelope === null) return undefined as T;
    return envelope.data;
  });
}

// requestEnvelope: list 响应. 返回完整 {data, meta}, meta 含 page_size/has_more/next_cursor.
// 用于 list 端点 (cursor 分页需要 meta).
export async function requestEnvelope<T>(path: string, opts: Options = {}): Promise<ApiSuccess<T>> {
  return withRefreshRetry(opts, async () => {
    const { envelope } = await rawRequest<T>(path, opts);
    if (envelope === null) {
      throw new ManjuError(204, { code: 'INTERNAL_ERROR', message: '空响应不应给到 list 端点', request_id: '' });
    }
    return envelope;
  });
}

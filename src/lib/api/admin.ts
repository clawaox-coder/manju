import { getAccessToken } from './tokens';

const AI_BASE = import.meta.env.VITE_PUBLIC_AI_API_BASE ?? 'http://localhost:8005';

export interface ImageQuotaRow {
  month_yymm: string;
  used: number;
  limit: number;
  updated_at: string | null;
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${AI_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.detail?.message || `${res.status} ${res.statusText}`);
  }
  return (json?.data ?? json) as T;
}

export async function listImageQuota(): Promise<ImageQuotaRow[]> {
  return adminRequest<ImageQuotaRow[]>('/v1/admin/image-quota');
}

export async function updateImageQuota(monthYYMM: string, limit: number): Promise<ImageQuotaRow> {
  return adminRequest<ImageQuotaRow>(`/v1/admin/image-quota/${monthYYMM}`, {
    method: 'PATCH',
    body: JSON.stringify({ limit }),
  });
}

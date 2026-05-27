// render-service API module (:8006)
// 端点: POST /v1/render, GET /v1/render/:id, GET /v1/render?project_id=, DELETE /v1/render/:id

import { request, requestEnvelope } from './client';
import type { ApiSuccess } from './types';

export const API_BASE_RENDER =
  import.meta.env.VITE_PUBLIC_RENDER_API_BASE ?? 'http://localhost:8006';

// --- DTOs (snake_case, 与 api.md 对齐) ---

export interface RenderJob {
  id: string;
  team_id: string;
  project_id: string;
  user_id: string;
  status: RenderStatus;
  progress: number;
  stage: string | null;
  priority: number;
  resolution: string;
  format: string;
  preset: string | null;
  result_url: string | null;
  thumbnail_url: string | null;
  size_bytes: number | null;
  duration_ms: number | null;
  error: string | null;
  worker_id: string | null;
  attempt: number;
  idempotency_key: string | null;
  queued_at: string;
  started_at: string | null;
  done_at: string | null;
}

export type RenderStatus =
  | 'queued'
  | 'running'
  | 'composing'
  | 'encoding'
  | 'uploading'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface CreateRenderInput {
  project_id: string;
  resolution: string;
  format: string;
  preset?: string;
  include_subtitle?: boolean;
  include_bgm?: boolean;
}

export interface CreateRenderResponse {
  job_id: string;
  status: RenderStatus;
  estimated_seconds: number;
  queue_position: number;
}

export interface ListRenderParams {
  project_id?: string;
  status?: RenderStatus;
  page_size?: number;
  cursor?: string;
}

export interface ListRenderMeta {
  request_id: string;
  request_ms: number;
  page_size: number;
  has_more: boolean;
  next_cursor?: string;
}

// --- API functions ---

const opts = { base: API_BASE_RENDER };

export async function createRender(
  input: CreateRenderInput,
  idempotencyKey?: string,
): Promise<CreateRenderResponse> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return request<CreateRenderResponse>('/v1/render', {
    ...opts,
    method: 'POST',
    body: input,
    headers,
  });
}

export async function getRender(id: string): Promise<RenderJob> {
  return request<RenderJob>(`/v1/render/${id}`, opts);
}

export async function listRenders(
  params: ListRenderParams = {},
): Promise<ApiSuccess<RenderJob[]> & { meta: ListRenderMeta }> {
  const qs = new URLSearchParams();
  if (params.project_id) qs.set('project_id', params.project_id);
  if (params.status) qs.set('status', params.status);
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.cursor) qs.set('cursor', params.cursor);
  const q = qs.toString();
  return requestEnvelope<RenderJob[]>(`/v1/render${q ? '?' + q : ''}`, opts) as Promise<ApiSuccess<RenderJob[]> & { meta: ListRenderMeta }>;
}

export async function cancelRender(id: string): Promise<void> {
  await request<void>(`/v1/render/${id}`, { ...opts, method: 'DELETE' });
}

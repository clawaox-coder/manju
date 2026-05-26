import { request, API_BASE_PROJECT } from './client';

export type ProjectStatus = 'draft' | 'rendering' | 'done' | 'archived';

export interface ProjectDTO {
  id: string;
  team_id: string;
  owner_id: string;
  name: string;
  genre: string | null;
  status: ProjectStatus;
  progress: number;
  version: string;
  thumbnail_url: string | null;
  bg_style: string | null;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListMeta {
  page_size: number;
  has_more: boolean;
  next_cursor: string | null;
}

const base = API_BASE_PROJECT;

export interface ListProjectsParams {
  status?: ProjectStatus;
  genre?: string;
  q?: string;
  cursor?: string;
  pageSize?: number;
  sort?: string;
}

export async function listProjects(params: ListProjectsParams = {}) {
  const qs = buildQuery(params);
  return rawList<ProjectDTO>(`/v1/projects${qs}`);
}

export async function getProject(id: string): Promise<ProjectDTO> {
  return request<ProjectDTO>(`/v1/projects/${id}`, { base });
}

export interface CreateProjectInput {
  name: string;
  genre?: string | null;
  from?: 'script' | 'idea' | 'template';
  template_id?: string | null;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectDTO> {
  return request<ProjectDTO>('/v1/projects', { method: 'POST', body: input, base });
}

export async function updateProject(id: string, input: { name?: string; genre?: string | null }): Promise<ProjectDTO> {
  return request<ProjectDTO>(`/v1/projects/${id}`, { method: 'PATCH', body: input, base });
}

export async function duplicateProject(id: string): Promise<ProjectDTO> {
  return request<ProjectDTO>(`/v1/projects/${id}/duplicate`, { method: 'POST', base });
}

export async function deleteProject(id: string): Promise<void> {
  return request<void>(`/v1/projects/${id}`, { method: 'DELETE', base });
}

export async function restoreProject(id: string): Promise<ProjectDTO> {
  return request<ProjectDTO>(`/v1/projects/${id}/restore`, { method: 'POST', base });
}

export async function purgeProject(id: string): Promise<void> {
  return request<void>(`/v1/projects/${id}/purge`, { method: 'DELETE', base });
}

// ---- drafts ----

export async function listDrafts(params: { cursor?: string; pageSize?: number } = {}) {
  const qs = buildQuery({ cursor: params.cursor, page_size: params.pageSize });
  return rawList<ProjectDTO>(`/v1/drafts${qs}`);
}

export async function deleteDraft(id: string): Promise<void> {
  return request<void>(`/v1/drafts/${id}`, { method: 'DELETE', base });
}

export async function clearAllDrafts(): Promise<{ removed: number }> {
  return request<{ removed: number }>('/v1/drafts', { method: 'POST', base });
}

// ---- shared ----

export async function listShared(params: { cursor?: string; pageSize?: number } = {}) {
  const qs = buildQuery({ cursor: params.cursor, page_size: params.pageSize });
  return rawList<ProjectDTO>(`/v1/shared${qs}`);
}

export async function leaveShared(id: string): Promise<void> {
  return request<void>(`/v1/shared/${id}/leave`, { method: 'POST', base });
}

// ---- trash ----

export async function listTrash(params: { cursor?: string; pageSize?: number } = {}) {
  const qs = buildQuery({ cursor: params.cursor, page_size: params.pageSize });
  return rawList<ProjectDTO>(`/v1/trash${qs}`);
}

export async function restoreFromTrash(id: string): Promise<ProjectDTO> {
  return request<ProjectDTO>(`/v1/trash/${id}/restore`, { method: 'POST', base });
}

export async function purgeFromTrash(id: string): Promise<void> {
  return request<void>(`/v1/trash/${id}`, { method: 'DELETE', base });
}

export async function emptyTrash(): Promise<{ removed: number }> {
  return request<{ removed: number }>('/v1/trash/empty', { method: 'POST', base });
}

// ---- helpers ----

async function rawList<T>(path: string): Promise<{ data: T[]; meta: ListMeta }> {
  return request<{ data: T[]; meta: ListMeta }>(path, { base }) as unknown as { data: T[]; meta: ListMeta };
}

function buildQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

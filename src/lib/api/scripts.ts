import { request, API_BASE_PROJECT } from './client';

const SCRIPT_BASE = import.meta.env.VITE_PUBLIC_SCRIPT_API_BASE ?? 'http://localhost:8003';

export interface ScriptDTO {
  project_id: string;
  content: string;
  format: string;
  word_count: number;
  scene_count: number;
  version_no: number;
  updated_by: string | null;
  updated_at: string;
}

export interface ShotDTO {
  id: string;
  project_id: string;
  order_index: number;
  num: string | null;
  title: string | null;
  shot_type: string | null;
  duration_ms: number;
  dialog: string | null;
  image_url: string | null;
  bg_style: string | null;
  voice_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function getScript(projectId: string): Promise<ScriptDTO> {
  return request<ScriptDTO>(`/v1/projects/${projectId}/script`, { base: SCRIPT_BASE });
}

export async function updateScript(projectId: string, input: { content: string; expected_version_no: number }): Promise<ScriptDTO> {
  return request<ScriptDTO>(`/v1/projects/${projectId}/script`, { method: 'PUT', body: input, base: SCRIPT_BASE });
}

export async function listShots(projectId: string): Promise<ShotDTO[]> {
  return request<ShotDTO[]>(`/v1/projects/${projectId}/shots`, { base: SCRIPT_BASE });
}

export interface CreateShotInput {
  title?: string;
  shot_type?: string;
  duration_ms?: number;
  dialog?: string;
  after_shot_id?: string;
}

export async function createShot(projectId: string, input: CreateShotInput): Promise<ShotDTO> {
  return request<ShotDTO>(`/v1/projects/${projectId}/shots`, { method: 'POST', body: input, base: SCRIPT_BASE });
}

export async function updateShot(projectId: string, shotId: string, input: Partial<CreateShotInput>): Promise<ShotDTO> {
  return request<ShotDTO>(`/v1/projects/${projectId}/shots/${shotId}`, { method: 'PATCH', body: input, base: SCRIPT_BASE });
}

export async function deleteShot(projectId: string, shotId: string): Promise<void> {
  return request<void>(`/v1/projects/${projectId}/shots/${shotId}`, { method: 'DELETE', base: SCRIPT_BASE });
}

export async function reorderShots(projectId: string, order: string[]): Promise<ShotDTO[]> {
  return request<ShotDTO[]>(`/v1/projects/${projectId}/shots/reorder`, { method: 'PUT', body: { order }, base: SCRIPT_BASE });
}

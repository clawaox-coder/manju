import { request, requestEnvelope } from './client';

const ASSET_BASE = import.meta.env.VITE_PUBLIC_ASSET_API_BASE ?? 'http://localhost:8004';

export type AssetType = 'character' | 'scene' | 'prop' | 'music' | 'sfx' | 'voice';

// 后端路由用复数路径段 (api.md §7.6): /v1/assets/characters/...，与枚举单数值不同。
const TYPE_PATH: Record<AssetType, string> = {
  character: 'characters',
  scene: 'scenes',
  prop: 'props',
  music: 'music',
  sfx: 'sfx',
  voice: 'voices',
};

export interface AssetDTO {
  id: string;
  team_id: string | null;
  type: AssetType;
  name: string;
  description: string | null;
  tags: string[];
  file_url: string | null;
  thumbnail_url: string | null;
  bg_style: string | null;
  avatar: string | null;
  duration_ms: number | null;
  uses_count: number;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ListMeta {
  page_size: number;
  has_more: boolean;
  next_cursor: string | null;
}

export interface ListAssetsParams {
  type?: AssetType;
  q?: string;
  tags?: string;
  cursor?: string;
  pageSize?: number;
}

export async function listAssets(params: ListAssetsParams = {}) {
  const seg = TYPE_PATH[params.type ?? 'character'];
  const qs = buildQuery({ q: params.q, tags: params.tags, cursor: params.cursor, page_size: params.pageSize });
  const env = await requestEnvelope<AssetDTO[]>(`/v1/assets/${seg}${qs}`, { base: ASSET_BASE });
  return { data: env.data, meta: env.meta as unknown as ListMeta };
}

export async function getAsset(type: AssetType, id: string): Promise<AssetDTO> {
  return request<AssetDTO>(`/v1/assets/${TYPE_PATH[type]}/${id}`, { base: ASSET_BASE });
}

export interface CreateAssetInput {
  type: AssetType;
  name: string;
  description?: string;
  tags?: string[];
  file_url?: string;
  avatar?: string;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

export async function createAsset(input: CreateAssetInput): Promise<AssetDTO> {
  // type 走路径段，后端开启了 DisallowUnknownFields，body 不能再带 type。
  const { type, ...body } = input;
  return request<AssetDTO>(`/v1/assets/${TYPE_PATH[type]}`, { method: 'POST', body, base: ASSET_BASE });
}

export async function updateAsset(type: AssetType, id: string, input: Partial<Omit<CreateAssetInput, 'type'>>): Promise<AssetDTO> {
  return request<AssetDTO>(`/v1/assets/${TYPE_PATH[type]}/${id}`, { method: 'PATCH', body: input, base: ASSET_BASE });
}

export async function deleteAsset(type: AssetType, id: string): Promise<void> {
  return request<void>(`/v1/assets/${TYPE_PATH[type]}/${id}`, { method: 'DELETE', base: ASSET_BASE });
}

export interface SignUploadInput {
  filename: string;
  content_type: string;
  size_bytes: number;
  purpose: string;
}

export interface SignUploadResult {
  upload_url: string;
  method: string;
  headers: Record<string, string>;
  file_url: string;
  expires_in: number;
}

export async function signUpload(input: SignUploadInput): Promise<SignUploadResult> {
  return request<SignUploadResult>('/v1/upload/sign', { method: 'POST', body: input, base: ASSET_BASE });
}

// ---- project_assets (项目 ↔ 资产关联, role 区分用途) ----

export type AssetRole = 'character_ref' | 'style_ref' | 'script_ref';

// 把资产以指定 role 关联到项目(幂等)。
export async function linkProjectAsset(projectId: string, assetId: string, role: AssetRole): Promise<void> {
  await request(`/v1/projects/${projectId}/assets`, {
    method: 'POST',
    body: { asset_id: assetId, role },
    base: ASSET_BASE,
  });
}

// 列出项目下某 role 的关联资产。
export async function listProjectAssets(projectId: string, role: AssetRole = 'character_ref'): Promise<AssetDTO[]> {
  const env = await requestEnvelope<AssetDTO[]>(`/v1/projects/${projectId}/assets?role=${role}`, { base: ASSET_BASE });
  return env.data;
}

function buildQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

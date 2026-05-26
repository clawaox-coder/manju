// auth-service 传输层 DTO. 字段名保持 snake_case 与 api.md 一致.
// 业务侧的 camelCase 类型在 auth.ts 边界做转换.

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  phone: string | null;
}

export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type PlanTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface AuthTeam {
  id: string;
  name: string;
  plan: PlanTier;
  role: TeamRole;
}

export interface SessionPayload {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
  team: AuthTeam;
}

export interface RefreshPayload {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface MePayload {
  user: AuthUser;
  team: AuthTeam;
}

export interface ApiSuccess<T> {
  data: T;
  meta: { request_id: string; request_ms: number };
}

export interface ApiErrorBody {
  code: string;
  message: string;
  request_id: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}

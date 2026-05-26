import { clearTokens, setTokens } from './tokens';
import { request } from './client';
import type {
  AuthTeam,
  AuthUser,
  MePayload,
  RefreshPayload,
  SessionPayload,
} from './types';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
  totp?: string;
}

export interface Session {
  user: AuthUser;
  team: AuthTeam;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function toSession(p: SessionPayload): Session {
  return {
    user: p.user,
    team: p.team,
    accessToken: p.access_token,
    refreshToken: p.refresh_token,
    expiresIn: p.expires_in,
  };
}

export async function register(input: RegisterInput): Promise<Session> {
  const payload = await request<SessionPayload>('/v1/auth/register', {
    method: 'POST',
    body: input,
    auth: false,
  });
  setTokens(payload.access_token, payload.refresh_token);
  return toSession(payload);
}

export async function login(input: LoginInput): Promise<Session> {
  const payload = await request<SessionPayload>('/v1/auth/login', {
    method: 'POST',
    body: input,
    auth: false,
  });
  setTokens(payload.access_token, payload.refresh_token);
  return toSession(payload);
}

export async function logout(refreshToken: string): Promise<void> {
  try {
    await request<unknown>('/v1/auth/logout', {
      method: 'POST',
      body: { refresh_token: refreshToken },
      auth: false,
    });
  } finally {
    clearTokens();
  }
}

export async function refresh(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const payload = await request<RefreshPayload>('/v1/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
    auth: false,
  });
  setTokens(payload.access_token, payload.refresh_token);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
  };
}

export async function fetchMe(): Promise<{ user: AuthUser; team: AuthTeam }> {
  return await request<MePayload>('/v1/me', { method: 'GET' });
}

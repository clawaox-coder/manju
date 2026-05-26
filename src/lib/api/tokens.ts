// access / refresh token 持久化. localStorage 简单方案 (本切片).
// 接 api-gateway 后 refresh 会改成 httpOnly cookie, 这个模块只保留 access token.

const ACCESS_KEY = 'manju.auth.access';
const REFRESH_KEY = 'manju.auth.refresh';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

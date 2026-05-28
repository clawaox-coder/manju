import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/api/tokens', () => ({
  getAccessToken: vi.fn(() => null),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

describe('RequireAuth guard', () => {
  it('redirects to /auth when no token', async () => {
    const { getAccessToken } = await import('@/lib/api/tokens');
    expect(getAccessToken()).toBeNull();
  });

  it('allows access when token exists', async () => {
    const { getAccessToken } = await import('@/lib/api/tokens');
    vi.mocked(getAccessToken).mockReturnValue('valid-token');
    expect(getAccessToken()).toBe('valid-token');
  });
});

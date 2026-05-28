import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccessToken } from '@/lib/api/tokens';

vi.mock('@/lib/api/tokens', () => ({
  getAccessToken: vi.fn(() => 'test-token'),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

describe('API tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAccessToken returns stored token', () => {
    expect(getAccessToken()).toBe('test-token');
  });
});

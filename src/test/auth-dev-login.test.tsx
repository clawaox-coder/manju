import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from './utils';

const setTokens = vi.fn();
const navigate = vi.fn();

// tokens 模块整体 mock：断言 devLogin 写入 token；同时满足 client/auth 的具名导入。
vi.mock('@/lib/api/tokens', () => ({
  setTokens: (a: string, b: string) => setTokens(a, b),
  clearTokens: vi.fn(),
  getAccessToken: () => null,
  getRefreshToken: () => null,
}));

// 保留真实 react-router-dom（MemoryRouter 等），仅把 useNavigate 换成 spy。
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

import AuthPage from '@/pages/Auth';

describe('Auth dev 测试登录', () => {
  beforeEach(() => {
    setTokens.mockClear();
    navigate.mockClear();
  });

  it('点击「测试登录」写入占位 token 并跳转 /home', async () => {
    renderWithProviders(<AuthPage />);

    const btn = screen.getByRole('button', { name: /测试登录/ });
    await userEvent.click(btn);

    expect(setTokens).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/home');
  });
});

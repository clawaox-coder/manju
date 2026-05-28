import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, fireEvent } from './utils';
import Auth from '@/pages/Auth';

vi.mock('@/lib/api/auth', () => ({
  login: vi.fn().mockResolvedValue({ user: { id: '1', name: 'Test' }, team: { id: 't1', name: 'Team' }, accessToken: 'tok', refreshToken: 'ref', expiresIn: 3600 }),
  register: vi.fn().mockResolvedValue({ user: { id: '1', name: 'Test' }, team: { id: 't1', name: 'Team' }, accessToken: 'tok', refreshToken: 'ref', expiresIn: 3600 }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

describe('Auth page', () => {
  it('renders login form by default', () => {
    renderWithProviders(<Auth />);
    expect(screen.getByText('漫剧AI Studio')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('至少 10 位')).toBeInTheDocument();
  });

  it('renders submit button with correct text', () => {
    renderWithProviders(<Auth />);
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('switches to register mode and shows name field', () => {
    renderWithProviders(<Auth />);
    fireEvent.click(screen.getByText('注册'));
    expect(screen.getByPlaceholderText('你的名字')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from './utils';
import Team from '@/pages/Team';

vi.mock('@/hooks/useAuthApi', () => ({
  useMe: () => ({ data: { user: { id: 'u1', name: 'Me', email: 'me@test.com' }, team: { id: 't1', name: '测试团队' } } }),
  useTeamMembers: () => ({
    data: [
      { id: 'u1', name: 'Me', email: 'me@test.com', role: 'owner', joined_at: '2025-01-01', avatar_url: null },
      { id: 'u2', name: 'Bob', email: 'bob@test.com', role: 'editor', joined_at: '2025-02-01', avatar_url: null },
    ],
    isLoading: false,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

describe('Team page', () => {
  it('renders team name from API', () => {
    renderWithProviders(<Team />);
    expect(screen.getByText(/测试团队/)).toBeInTheDocument();
  });

  it('shows member count', () => {
    renderWithProviders(<Team />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('marks current user with badge', () => {
    renderWithProviders(<Team />);
    expect(screen.getByText('你')).toBeInTheDocument();
  });

  it('shows owner badge for owner role', () => {
    renderWithProviders(<Team />);
    expect(screen.getByText('管理员')).toBeInTheDocument();
  });
});

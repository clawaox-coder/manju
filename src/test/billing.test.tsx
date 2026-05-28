import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from './utils';
import Billing from '@/pages/Billing';

vi.mock('@/hooks/useProjectApi', () => ({
  useProjects: () => ({ data: { data: [{ id: '1' }, { id: '2' }] } }),
}));

vi.mock('@/hooks/useAuthApi', () => ({
  useTeamMembers: () => ({ data: [{ id: 'm1', name: 'Test', email: 'a@b.c', role: 'owner', joined_at: '2025-01-01', avatar_url: null }] }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

describe('Billing page', () => {
  it('renders billing page title', () => {
    renderWithProviders(<Billing />);
    expect(screen.getByRole('heading', { name: '订阅与账单' })).toBeInTheDocument();
  });

  it('shows usage section', () => {
    renderWithProviders(<Billing />);
    expect(screen.getByText('本月用量')).toBeInTheDocument();
    expect(screen.getByText('团队席位')).toBeInTheDocument();
  });

  it('shows all plan tiers', () => {
    renderWithProviders(<Billing />);
    expect(screen.getByText('免费版')).toBeInTheDocument();
    expect(screen.getByText('专业版')).toBeInTheDocument();
    expect(screen.getAllByText(/团队版/).length).toBeGreaterThan(0);
  });
});

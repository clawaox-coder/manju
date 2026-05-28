import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from './utils';
import Settings from '@/pages/Settings';

vi.mock('@/hooks/useAuthApi', () => ({
  useMe: () => ({ data: { user: { id: 'u1', name: 'TestUser', email: 'test@manju.ai' }, team: { id: 't1', name: 'TestTeam' } } }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

describe('Settings page', () => {
  it('renders settings page title', () => {
    renderWithProviders(<Settings />);
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
  });

  it('shows user name from API', () => {
    renderWithProviders(<Settings />);
    expect(screen.getByDisplayValue('TestUser')).toBeInTheDocument();
  });

  it('shows email as readonly', () => {
    renderWithProviders(<Settings />);
    const emailInput = screen.getByDisplayValue('test@manju.ai');
    expect(emailInput).toHaveAttribute('readonly');
  });
});

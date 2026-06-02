import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from './utils';
import ImageQuotaAdmin from '@/pages/Admin/ImageQuota';

const mutateAsync = vi.fn(async ({ monthYYMM, limit }: { monthYYMM: string; limit: number }) => ({
  month_yymm: monthYYMM,
  used: 12,
  limit,
  updated_at: '2026-06-02T12:00:00.000Z',
}));

vi.mock('@/hooks/useAuthApi', () => ({
  useMe: () => ({ data: { user: { id: 'u1', name: 'Owner', email: 'owner@test.com' }, team: { id: 't1', name: '测试团队', role: 'owner' } } }),
}));

vi.mock('@/hooks/useAdminApi', () => ({
  useImageQuota: () => ({
    data: [{ month_yymm: '2026-06', used: 12, limit: 50, updated_at: '2026-06-02T12:00:00.000Z' }],
    isLoading: false,
  }),
  useUpdateImageQuotaLimit: () => ({
    mutateAsync,
    isPending: false,
    variables: undefined,
  }),
}));

describe('ImageQuotaAdmin page', () => {
  it('renders existing monthly quota rows', () => {
    renderWithProviders(<ImageQuotaAdmin />);
    expect(screen.getByText('图像配额管理')).toBeInTheDocument();
    expect(screen.getByText('2026-06')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('saves edited limit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImageQuotaAdmin />);
    const input = screen.getByLabelText('2026-06 limit');
    await user.clear(input);
    await user.type(input, '80');
    await user.click(screen.getByRole('button', { name: /保存/ }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ monthYYMM: '2026-06', limit: 80 });
    });
  });
});

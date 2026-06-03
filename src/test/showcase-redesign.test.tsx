import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderWithProviders, screen } from './utils';
import Showcase from '@/pages/Showcase';

vi.mock('@/components/layout/AccountMenu', () => ({
  AccountMenu: () => <button type="button">账户菜单</button>,
}));

vi.mock('@/hooks/useConfirm', () => ({
  ConfirmProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useConfirm: () => vi.fn(),
}));

vi.mock('@/hooks/useProjectApi', () => ({
  useProjects: () => ({
    data: {
      data: [
        {
          id: 'p-1',
          name: '我在修仙界当保安',
          genre: '都市修仙',
          status: 'rendering',
          progress: 42,
          version: '第 12 集分镜',
          thumbnailUrl: null,
          bgStyle: null,
          teamId: 't-1',
          ownerId: 'u-1',
          metadata: {},
          deletedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    },
    isLoading: false,
  }),
  useCreateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutate: vi.fn() }),
  useDuplicateProject: () => ({ mutate: vi.fn() }),
}));

describe('Showcase redesign', () => {
  it('渲染工作台：想法输入标题 + 我的作品网格', () => {
    renderWithProviders(<Showcase />);

    expect(screen.getByRole('heading', { name: '今天想创作点什么?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '我的作品' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '亮点' })).toBeInTheDocument();
    expect(screen.getAllByText('我在修仙界当保安').length).toBeGreaterThan(0);
  });

  it('在我的作品下方渲染社区作品区（含作者）', () => {
    renderWithProviders(<Showcase />);

    expect(screen.getByRole('heading', { name: '社区作品' })).toBeInTheDocument();
    // 社区占位作品的作者名应当出现
    expect(screen.getByText('青衫旧梦')).toBeInTheDocument();
  });
});

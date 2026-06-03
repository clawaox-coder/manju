import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, fireEvent } from './utils';
import { WorkspaceRail } from '@/pages/Canvas/WorkspaceRail';

describe('WorkspaceRail（固定左侧窄侧栏）', () => {
  it('渲染 logo、首页、新对话、资产库、个人中心入口', () => {
    renderWithProviders(
      <WorkspaceRail
        onNewConversation={vi.fn()}
        onOpenAssets={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('漫剧AI')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回首页' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新对话' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '资产库' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '个人中心' })).toBeInTheDocument();
  });

  it('点击新对话和资产库会触发对应动作', () => {
    const onNewConversation = vi.fn();
    const onOpenAssets = vi.fn();
    renderWithProviders(
      <WorkspaceRail
        onNewConversation={onNewConversation}
        onOpenAssets={onOpenAssets}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '新对话' }));
    fireEvent.click(screen.getByRole('button', { name: '资产库' }));

    expect(onNewConversation).toHaveBeenCalledTimes(1);
    expect(onOpenAssets).toHaveBeenCalledTimes(1);
  });
});

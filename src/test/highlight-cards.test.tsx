import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from './utils';
import { HighlightCard, type Highlight } from '@/components/domain/HighlightCard';

const item: Highlight = {
  id: 'h-1',
  title: '剧情故事短片',
  cover: 'linear-gradient(135deg,#6d28d9,#2563eb)',
  tag: '多模型',
};

describe('HighlightCard', () => {
  it('渲染标题与角标', () => {
    renderWithProviders(<HighlightCard highlight={item} />);
    expect(screen.getByText('剧情故事短片')).toBeInTheDocument();
    expect(screen.getByText('多模型')).toBeInTheDocument();
  });

  it('点击触发 onClick 回调', async () => {
    const onClick = vi.fn();
    renderWithProviders(<HighlightCard highlight={item} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: /剧情故事短片/ }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

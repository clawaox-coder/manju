import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from './utils';
import { CommunityCard, formatLikes, type CommunityWork } from '@/components/domain/CommunityCard';

const work: CommunityWork = {
  id: 'c-1',
  title: '我在修仙界当保安',
  cover: 'linear-gradient(135deg,#6d28d9,#2563eb)',
  authorName: '青衫旧梦',
  authorAvatar: '青',
  likes: 24000,
};

describe('CommunityCard', () => {
  it('展示标题、作者名与点赞数（万）', () => {
    renderWithProviders(<CommunityCard work={work} />);
    expect(screen.getByText('我在修仙界当保安')).toBeInTheDocument();
    expect(screen.getByText('青衫旧梦')).toBeInTheDocument();
    expect(screen.getByText('2.4w')).toBeInTheDocument();
  });

  it('不渲染 ProjectCard 那种操作菜单按钮', () => {
    renderWithProviders(<CommunityCard work={work} />);
    // 社区卡只供浏览，不应出现「删除/重命名」等自有作品操作项
    expect(screen.queryByText('删除')).not.toBeInTheDocument();
  });
});

describe('formatLikes', () => {
  it('万级显示为 x.xw 并去掉多余的 .0', () => {
    expect(formatLikes(24000)).toBe('2.4w');
    expect(formatLikes(18000)).toBe('1.8w');
    expect(formatLikes(20000)).toBe('2w');
  });

  it('一万以下显示原始数字', () => {
    expect(formatLikes(856)).toBe('856');
    expect(formatLikes(9999)).toBe('9999');
  });
});

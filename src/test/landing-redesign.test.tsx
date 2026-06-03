import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from './utils';
import Landing from '@/pages/Landing';

vi.mock('@/lib/api/tokens', () => ({
  getAccessToken: vi.fn(() => null),
}));

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

describe('Landing redesign', () => {
  it('渲染新的 hero 文案和主 CTA', () => {
    renderWithProviders(<Landing />);

    expect(screen.getByRole('heading', { name: /从一句想法，\s*进入短剧片场/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '免费开始创作' }).length).toBeGreaterThan(0);
    expect(screen.getByText('一条流水线，全程在画布上')).toBeInTheDocument();
    expect(screen.getByTestId('landing-flow-grid').className).toContain('lg:grid-cols-5');
  });
});

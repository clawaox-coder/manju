const sources = import.meta.glob('@/pages/Canvas/index.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const indexSrc = Object.values(sources)[0] ?? '';

describe('Canvas assistant surface contract', () => {
  it('全局主创协作保留 floating 轻协作模式', () => {
    expect(indexSrc).toContain('data-testid="canvas-assistant-surface"');
    expect(indexSrc).toContain('headerMode="floating"');
  });

  it('默认打开尺寸保持轻量，不回退成大弹层', () => {
    expect(indexSrc).toContain("width: 'min(24rem, calc(100vw - 2rem))'");
    expect(indexSrc).toContain("height: 'min(38rem, calc(100vh - 8rem))'");
  });

  it('围绕对象打开时的锚点尺寸保持克制', () => {
    expect(indexSrc).toContain('Math.min(viewportWidth - 24, 392)');
    expect(indexSrc).toContain('Math.min(Math.max(320, Math.round(viewportWidth * 0.23)), 372)');
    expect(indexSrc).toContain('const maxHeight = Math.min(viewportHeight - 128, 620)');
  });
});

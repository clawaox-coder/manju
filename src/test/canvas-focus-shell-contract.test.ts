const indexSources = import.meta.glob('@/pages/Canvas/index.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const indexSrc = Object.values(indexSources)[0] ?? '';

describe('Canvas focus shell contract', () => {
  it('聚焦态由 assistantOpen 或 objectWorkbenchOpen 统一驱动', () => {
    expect(indexSrc).toContain('const hasWorkbenchOpen = assistantOpen || objectWorkbenchOpen;');
  });

  it('全局 chrome 在聚焦态下统一退场', () => {
    expect(indexSrc).toContain("data-testid=\"canvas-title-strip\"");
    expect(indexSrc).toContain("data-testid=\"canvas-tools-chrome\"");
    expect(indexSrc).toContain("data-testid=\"canvas-assistant-entry\"");
    expect(indexSrc).toContain("hasWorkbenchOpen && 'invisible opacity-0 translate-y-[-6px] pointer-events-none'");
    expect(indexSrc).toContain("!assistantOpen && !objectWorkbenchOpen && (");
  });

  it('全局协作与对象工作面不会同时出现', () => {
    expect(indexSrc).toContain('{assistantOpen && !objectWorkbenchOpen && (');
    expect(indexSrc).toContain('{objectWorkbenchOpen && selectedNode && (');
  });
});

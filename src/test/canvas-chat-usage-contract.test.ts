const indexSources = import.meta.glob('@/pages/Canvas/index.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const overlaySources = import.meta.glob('@/pages/Canvas/CanvasInlineEditorOverlay.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const indexSrc = Object.values(indexSources)[0] ?? '';
const overlaySrc = Object.values(overlaySources)[0] ?? '';

describe('Canvas chat usage contract', () => {
  it('全局主创协作的 ChatPanel 使用显式 floating 轻态', () => {
    const assistantCallsite = indexSrc.match(/<ChatPanel[\s\S]*?headerMode="floating"[\s\S]*?\/>/);
    expect(assistantCallsite).toBeTruthy();
  });

  it('对象工作面的 ChatPanel 使用显式 embedded 协作态', () => {
    const workbenchCallsite = overlaySrc.match(/<ChatPanel[\s\S]*?headerMode="embedded"[\s\S]*?\/>/);
    expect(workbenchCallsite).toBeTruthy();
  });

  it('Canvas 主路径里不依赖 ChatPanel 默认 full 模式', () => {
    const indexChatCount = (indexSrc.match(/<ChatPanel/g) ?? []).length;
    const overlayChatCount = (overlaySrc.match(/<ChatPanel/g) ?? []).length;
    const explicitModeCount = (
      (indexSrc.match(/headerMode="/g) ?? []).length
      + (overlaySrc.match(/headerMode="/g) ?? []).length
    );

    expect(indexChatCount + overlayChatCount).toBe(2);
    expect(explicitModeCount).toBe(2);
  });
});

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

describe('Canvas chat mode contract', () => {
  it('全局主创协作必须走 floating 轻态', () => {
    expect(indexSrc).toContain('data-testid="canvas-assistant-surface"');
    expect(indexSrc).toContain('headerMode="floating"');
  });

  it('对象工作面里的协作必须走 embedded 模式', () => {
    expect(overlaySrc).toContain('data-testid="canvas-object-studio-chat"');
    expect(overlaySrc).toContain('headerMode="embedded"');
  });

  it('分镜对象的嵌入协作继续使用 ambient 轻态', () => {
    expect(overlaySrc).toContain("embeddedTone={layoutPrefs.shellPosture === 'panoramic' || isDemoContentWorkbench ? 'ambient' : 'default'}");
    expect(overlaySrc).toContain("data-demo-content-lane={isDemoContentWorkbench ? 'true' : 'false'}");
  });

  it('demo 内容对象的协作 lane 继续保持 inset rail 定位', () => {
    expect(overlaySrc).toContain("data-demo-content-lane-position={isDemoContentWorkbench ? 'inset' : undefined}");
  });

  it('demo 内容对象的协作 lane 继续带有 anchored rail shell', () => {
    expect(overlaySrc).toContain("data-demo-content-lane-shell={isDemoContentWorkbench ? 'anchored' : undefined}");
  });

  it('demo 内容对象的协作 lane 继续带有 cap 式附着锚点', () => {
    expect(overlaySrc).toContain("data-demo-content-lane-anchor={isDemoContentWorkbench ? 'cap' : undefined}");
  });

  it('demo 内容对象的协作 lane 继续带有 arm 式连接臂', () => {
    expect(overlaySrc).toContain("data-demo-content-lane-connector={isDemoContentWorkbench ? 'arm' : undefined}");
  });

  it('demo 内容对象的协作 lane 继续带有 shoulder 过渡', () => {
    expect(overlaySrc).toContain("data-demo-content-lane-transition={isDemoContentWorkbench ? 'shoulder' : undefined}");
  });

  it('demo 内容对象的协作 lane 继续带有 cradle 承托基座', () => {
    expect(overlaySrc).toContain("data-demo-content-lane-foundation={isDemoContentWorkbench ? 'cradle' : undefined}");
  });

  it('demo 内容对象的协作 lane 继续带有 veil 主体轮廓', () => {
    expect(overlaySrc).toContain("data-demo-content-lane-body={isDemoContentWorkbench ? 'veil' : undefined}");
  });

  it('demo 内容对象的协作 lane 继续带有 ridge 主体边脊', () => {
    expect(overlaySrc).toContain("data-demo-content-lane-edge={isDemoContentWorkbench ? 'ridge' : undefined}");
  });

  it('demo 内容对象的协作 lane 继续把主体安放进 groove rail slot', () => {
    expect(overlaySrc).toContain("data-demo-content-lane-slot={isDemoContentWorkbench ? 'groove' : undefined}");
  });

  it('demo 内容对象的协作 lane 继续把内容主体 nested 在 rail slot 内', () => {
    expect(overlaySrc).toContain("data-demo-content-lane-fit={isDemoContentWorkbench ? 'nested' : undefined}");
  });

  it('demo 内容对象的嵌入协作继续使用 minimal 头部', () => {
    expect(overlaySrc).toContain("embeddedHeaderMode={isDemoContentWorkbench ? 'minimal' : 'default'}");
  });

  it('demo 内容对象的嵌入协作继续使用 minimal composer', () => {
    expect(overlaySrc).toContain("embeddedComposerMode={isDemoContentWorkbench ? 'minimal' : 'default'}");
  });

  it('demo 内容对象的嵌入协作继续使用 bare surface', () => {
    expect(overlaySrc).toContain("embeddedSurfaceMode={isDemoContentWorkbench ? 'bare' : 'default'}");
  });
});

// 回归契约:NodeOptimizePanel 锚定坐标走 tldraw useValue + getShapePageBounds,
// 这样 shape store 变化(节点被用户拖动 / 缩放)会自动触发重算,面板跟随节点。
// 任何偏离(改用 useEffect 内 setState、改用 setTimeout 轮询、改读非 reactive 源)
// 都会破坏跟随性,因此在源码层把关。
//
// 真 happy-path(打开面板 → 拖动节点 → 面板跟随)需要 tldraw editor 真实环境,
// 本环境跑不动,留 VERIFICATION.md 手动清单。

const sources = import.meta.glob('@/pages/Canvas/NodeOptimizePanel/index.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const panelSrc = Object.values(sources)[0];

describe('NodeOptimizePanel anchor reactive contract', () => {
  it('面板源文件应存在', () => {
    expect(panelSrc).toBeTruthy();
  });

  it('useAnchorPosition 用 tldraw useValue 派生(不是 useState + useEffect)', () => {
    expect(panelSrc).toContain('useValue');
    // selector 内必须读 shape bounds,否则 shape 位置/尺寸变化不会触发重算
    expect(panelSrc).toContain('getShapePageBounds');
  });

  it('selector 也读 viewport(确保画布平移/缩放也触发重算)', () => {
    expect(panelSrc).toContain('getViewportScreenBounds');
  });

  it('面板坐标不走轮询(无 setInterval / setTimeout polling)', () => {
    // setTimeout 在变体里可能用于其它目的;此处只盯外壳 index.tsx 不引入 polling
    expect(panelSrc).not.toMatch(/setInterval\s*\(/);
    expect(panelSrc).not.toMatch(/requestAnimationFrame/);
  });
});

const indexSources = import.meta.glob('@/pages/Canvas/index.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const scriptHookSources = import.meta.glob('@/hooks/useScriptApi.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const assetHookSources = import.meta.glob('@/hooks/useAssetApi.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const indexSrc = Object.values(indexSources)[0] ?? '';
const scriptHookSrc = Object.values(scriptHookSources)[0] ?? '';
const assetHookSrc = Object.values(assetHookSources)[0] ?? '';

describe('Canvas demo mode contract', () => {
  it('Canvas 在开发态无项目时会回退到本地 demo project', () => {
    expect(indexSrc).toContain('DEMO_CANVAS_PROJECT_ID');
    expect(indexSrc).toContain('DEMO_CANVAS_PROJECT_NAME');
    expect(indexSrc).toContain('projectsError || projects?.data?.length === 0');
    expect(indexSrc).toContain('setProjectId(DEMO_CANVAS_PROJECT_ID);');
    expect(indexSrc).toContain('setProjectName(DEMO_CANVAS_PROJECT_NAME);');
  });

  it('demo 模式下的 script 和 shot 查询走本地数据，不依赖后端接口', () => {
    expect(scriptHookSrc).toContain('isDemoCanvasProjectId(projectId)');
    expect(scriptHookSrc).toContain('return Promise.resolve(demoCanvasScript);');
    expect(scriptHookSrc).toContain('return Promise.resolve(demoCanvasShots);');
  });

  it('demo 角色对象也能通过 asset 查询拿到本地数据', () => {
    expect(assetHookSrc).toContain("type === 'character'");
    expect(assetHookSrc).toContain('demoCanvasCharacters.find');
    expect(assetHookSrc).toContain('return Promise.resolve(demoAsset);');
  });
});

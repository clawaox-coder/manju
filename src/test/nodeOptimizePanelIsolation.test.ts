// 回归契约:节点优化面板与全局对话接口彻底隔离
// (canvas-node-optimize-panel design Decision 3)。
//
// 任何对 chat() / streamScriptContinue() / classifyIntent() 等对话端点的引入
// 都意味着违背"节点优化用专门接口"的核心约定 —— 该测试在此把这条边界焊死。
//
// 若有正当复用需求(需 review),才能在白名单里增加豁免,而不是悄悄改测试。
//
// 用 Vite 原生 import.meta.glob 加载源码字符串(?raw),避免在 jsdom/ESM 下用 node fs。

const sources = import.meta.glob('@/pages/Canvas/NodeOptimizePanel/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// 这些是对话接口(chat agent / script continue SSE / 意图分类),
// 节点优化经专门 /v1/ai/{script/rewrite-scene,shot/optimize,character/optimize}。
const FORBIDDEN = ['chat(', 'streamScriptContinue', 'classifyIntent', 'intent/classify'];

describe('NodeOptimizePanel isolation', () => {
  it('面板代码至少存在(避免空集导致假绿)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(sources))('%s 不触对话接口', (file, src) => {
    for (const token of FORBIDDEN) {
      expect(src, `${file} 含禁止 token ${token}`).not.toContain(token);
    }
  });
});

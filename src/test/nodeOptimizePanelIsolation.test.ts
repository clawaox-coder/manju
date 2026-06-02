// 回归契约:节点优化面板与全局对话接口彻底隔离
// (canvas-node-optimize-panel design Decision 3)。
//
// 任何对 chat() / streamScriptContinue() / classifyIntent() 等对话端点的引入
// 都意味着违背"节点优化用专门接口"的核心约定 —— 该测试在此把这条边界焊死。
//
// 若有正当复用需求(需 review),才能在白名单里增加豁免,而不是悄悄改测试。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PANEL_DIR = join(__dirname, '..', 'pages', 'Canvas', 'NodeOptimizePanel');

// 这些是对话接口(chat agent / script continue SSE / 意图分类),
// 节点优化经专门 /v1/ai/{script/rewrite-scene,shot/optimize,character/optimize}。
const FORBIDDEN = ['chat(', 'streamScriptContinue', 'classifyIntent', 'intent/classify'];

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...collectFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('NodeOptimizePanel isolation', () => {
  const files = collectFiles(PANEL_DIR);

  it('面板代码至少存在(避免空集导致假绿)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s 不触对话接口', (file) => {
    const src = readFileSync(file, 'utf-8');
    for (const token of FORBIDDEN) {
      expect(src, `${file} 含禁止 token ${token}`).not.toContain(token);
    }
  });
});

// 剧本场景切分契约 —— 前后端共享规则(canvas-node-optimize-panel design Decision 4)。
//
// 规则:
//   1. 以 markdown 标题行 /^#{1,3}\s+(.+)/ 作为场景分隔,标题文本即场景标题。
//   2. 首个标题之前的非空内容归为「场景 1」。
//   3. 全文无标题但非空 → 整体作为一场(标题「场景 1」);仅当没有任何非空行被归入时,
//      才退化为单场「剧本」(content 截前 200 字)。
//
// scene_index = 返回数组下标(0-based),与画布节点 id `script-{i}` 的 i 一致。
// 后端 /v1/ai/script/rewrite-scene 必须用同一规则定位 scene_index,否则错位 ——
// 任何改动都要让 sceneSplit.test.ts 的样例在前后端同时成立。

export interface Scene {
  title: string;
  content: string;
}

export function splitScenes(content: string): Scene[] {
  const lines = content.split('\n');
  const scenes: Scene[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)/);
    if (heading) {
      if (current) scenes.push({ title: current.title, content: current.lines.join('\n').trim() });
      current = { title: heading[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else if (!scenes.length && line.trim()) {
      // 首个标题之前的正文 → 归入「场景 1」
      current = { title: '场景 1', lines: [line] };
    }
  }
  if (current) scenes.push({ title: current.title, content: current.lines.join('\n').trim() });
  if (!scenes.length && content.trim()) {
    scenes.push({ title: '剧本', content: content.slice(0, 200) });
  }
  return scenes;
}

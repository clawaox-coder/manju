// 把画布 nodeId 解析为它背后的领域实体引用。
// nodeId 由 buildGraph 生成:script-{i} | ai-gen | char-{assetId} | shot-{shotId} | video-out。
// 单节点优化面板据此决定面板形态(内容节点 = 单元素优化;枢纽节点 = 整体动作)
// 与调用哪层接口(canvas-node-optimize-panel design Decision 2/3)。

export type NodeEntity =
  | { kind: 'script-scene'; sceneIndex: number }
  | { kind: 'shot'; shotId: string }
  | { kind: 'character'; assetId: string }
  | { kind: 'hub-ai' }
  | { kind: 'hub-video' }
  | { kind: 'unknown'; raw: string };

export function resolveNodeEntity(nodeId: string): NodeEntity {
  if (nodeId === 'ai-gen') return { kind: 'hub-ai' };
  if (nodeId === 'video-out') return { kind: 'hub-video' };

  const scene = nodeId.match(/^script-(\d+)$/);
  if (scene) return { kind: 'script-scene', sceneIndex: Number(scene[1]) };

  // shot/char 的 id 是含连字符的 UUID,故用贪婪捕获其后全部。
  const shot = nodeId.match(/^shot-(.+)$/);
  if (shot) return { kind: 'shot', shotId: shot[1] };

  const char = nodeId.match(/^char-(.+)$/);
  if (char) return { kind: 'character', assetId: char[1] };

  return { kind: 'unknown', raw: nodeId };
}

// 内容节点(可单元素优化) vs 枢纽节点(整体动作)。unknown 视为不可优化。
export function isContentNode(entity: NodeEntity): boolean {
  return entity.kind === 'script-scene' || entity.kind === 'shot' || entity.kind === 'character';
}

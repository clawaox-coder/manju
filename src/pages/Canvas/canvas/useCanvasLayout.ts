import { useMemo } from 'react';
import type { Node } from '@xyflow/react';

const COL_X = { script: 0, ai: 380, storyboard: 650, video: 950, character: 350 };
const ROW_GAP = { script: 200, storyboard: 230, character: 200 };
const CANDIDATE_GAP_X = 200;

export function computeLayout(nodes: Node[]): Node[] {
  if (nodes.length === 0) return [];

  // Transient selection nodes (candidate / selected / leaving) all share the
  // "candidate-" id prefix; keep them side-by-side through the exit animation.
  const candidates = nodes.filter((n) => n.id.startsWith('candidate-'));
  const nonCandidates = nodes.filter((n) => !n.id.startsWith('candidate-'));

  const positioned: Node[] = [];

  if (candidates.length > 0) {
    const baseX = candidates[0].type === 'script' ? COL_X.script : COL_X.storyboard;
    const totalWidth = (candidates.length - 1) * CANDIDATE_GAP_X;
    const startX = baseX - totalWidth / 2;
    candidates.forEach((n, i) => {
      positioned.push({ ...n, position: { x: startX + i * CANDIDATE_GAP_X, y: 100 } });
    });
  }

  let scriptIdx = 0, shotIdx = 0, charIdx = 0;
  for (const node of nonCandidates) {
    if (node.type === 'script') {
      positioned.push({ ...node, position: { x: COL_X.script, y: scriptIdx * ROW_GAP.script } });
      scriptIdx++;
    } else if (node.type === 'storyboard') {
      positioned.push({ ...node, position: { x: COL_X.storyboard, y: shotIdx * ROW_GAP.storyboard } });
      shotIdx++;
    } else if (node.type === 'character') {
      positioned.push({ ...node, position: { x: COL_X.character + (charIdx % 2) * 180, y: -160 + Math.floor(charIdx / 2) * ROW_GAP.character } });
      charIdx++;
    } else if (node.type === 'ai') {
      const maxScripts = Math.max(scriptIdx, 1);
      positioned.push({ ...node, position: { x: COL_X.ai, y: ((maxScripts - 1) * ROW_GAP.script) / 2 } });
    } else if (node.type === 'video') {
      const maxShots = Math.max(shotIdx, 1);
      positioned.push({ ...node, position: { x: COL_X.video, y: ((maxShots - 1) * ROW_GAP.storyboard) / 2 } });
    } else {
      positioned.push(node);
    }
  }

  return positioned;
}

export function useCanvasLayout(nodes: Node[]): Node[] {
  return useMemo(() => computeLayout(nodes), [nodes]);
}

import { describe, expect, it } from 'vitest';
import type { CanvasEdge, CanvasNode } from '@/pages/Canvas/buildGraph';

async function loadLayoutModule() {
  if (typeof CSS !== 'undefined' && typeof CSS.supports !== 'function') {
    Object.defineProperty(CSS, 'supports', {
      configurable: true,
      value: () => false,
    });
  }
  return await import('@/pages/Canvas/layout/elkLayout');
}

const nodes: CanvasNode[] = [
  { id: 'script-0', type: 'script', position: { x: 0, y: 0 } },
  { id: 'shot-s1', type: 'storyboard', position: { x: 300, y: 0 } },
];

const edges: CanvasEdge[] = [
  { id: 'valid-edge', source: 'script-0', target: 'shot-s1' },
  { id: 'dangling-edge', source: 'script-0', target: 'ai-gen' },
];

describe('Canvas ELK layout', () => {
  it('excludes edges whose endpoints are missing from the layout key', async () => {
    const { buildCanvasLayoutKey } = await loadLayoutModule();
    const key = buildCanvasLayoutKey({ nodes, edges });

    expect(key).toContain('valid-edge');
    expect(key).not.toContain('dangling-edge');
    expect(key).not.toContain('ai-gen');
  });

  it('filters dangling edges before invoking ELK layout', async () => {
    const { buildCanvasLayoutKey, runCanvasAutoLayout } = await loadLayoutModule();
    const key = buildCanvasLayoutKey({ nodes, edges });
    const result = await runCanvasAutoLayout({ nodes, edges }, key);

    expect(result.routedEdges.map((edge) => edge.id)).toEqual(['valid-edge']);
    expect(result.nodes).toHaveLength(2);
  });
});

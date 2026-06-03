import { describe, expect, it } from 'vitest';
import { getSystemArrowShape } from '@/pages/Canvas/canvas/arrowStyle';
import type { CanvasEdge } from '@/pages/Canvas/buildGraph';

function edge(overrides: Partial<CanvasEdge> = {}): CanvasEdge {
  return {
    id: 'e-1',
    source: 'script-1',
    target: 'ai-gen',
    ...overrides,
  };
}

describe('canvas system arrow style（画布系统连线样式）', () => {
  it('主流程线条使用低干扰曲线箭头', () => {
    expect(getSystemArrowShape(edge({ style: { stroke: '#a855f7' }, animated: true }))).toEqual({
      isLocked: true,
      opacity: 0.62,
      props: {
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
        bend: 24,
        color: 'violet',
        dash: 'solid',
        fill: 'none',
        kind: 'arc',
        size: 's',
      },
    });
  });

  it('辅助关系线条使用浅色虚线', () => {
    expect(getSystemArrowShape(edge({ style: { strokeDasharray: '4 2' } }))).toMatchObject({
      opacity: 0.44,
      props: {
        color: 'light-blue',
        dash: 'dashed',
      },
    });
  });
});

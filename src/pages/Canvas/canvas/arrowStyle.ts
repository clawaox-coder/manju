import type { CanvasEdge } from '../buildGraph';

export interface SystemArrowShape {
  isLocked: true;
  opacity: number;
  props: {
    arrowheadStart: 'none';
    arrowheadEnd: 'arrow';
    bend: number;
    color: 'blue' | 'green' | 'light-blue' | 'orange' | 'violet' | 'grey';
    dash: 'solid' | 'dashed';
    fill: 'none';
    kind: 'arc';
    size: 's';
  };
}

function colorFromStroke(stroke: unknown): SystemArrowShape['props']['color'] {
  switch (stroke) {
    case '#a855f7':
      return 'violet';
    case '#22c55e':
      return 'green';
    case '#f59e0b':
      return 'orange';
    case '#ec4899':
      return 'light-blue';
    default:
      return 'grey';
  }
}

export function getSystemArrowShape(edge: CanvasEdge): SystemArrowShape {
  const isAuxiliary = typeof edge.style?.strokeDasharray === 'string';
  return {
    isLocked: true,
    opacity: isAuxiliary ? 0.44 : 0.62,
    props: {
      arrowheadStart: 'none',
      arrowheadEnd: 'arrow',
      bend: isAuxiliary ? 18 : 24,
      color: isAuxiliary ? 'light-blue' : colorFromStroke(edge.style?.stroke),
      dash: isAuxiliary ? 'dashed' : 'solid',
      fill: 'none',
      kind: 'arc',
      size: 's',
    },
  };
}

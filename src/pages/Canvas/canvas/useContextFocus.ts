import { useMemo } from 'react';
import type { Node } from '@xyflow/react';

export function applyFocus(nodes: Node[], focusedNodeId: string | null): Node[] {
  if (!focusedNodeId) return nodes;

  return nodes.map((node) => {
    if (node.id === focusedNodeId) {
      return { ...node, className: 'ring-2 ring-primary ring-offset-2 scale-105 transition-all duration-300' };
    }
    return { ...node, style: { ...node.style, opacity: 0.4, transition: 'opacity 0.3s ease' } };
  });
}

export function useContextFocus(nodes: Node[], focusedNodeId: string | null): Node[] {
  return useMemo(() => applyFocus(nodes, focusedNodeId), [nodes, focusedNodeId]);
}

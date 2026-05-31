import { useMemo } from 'react';
import type { CanvasNode } from '../buildGraph';

type FocusNode = CanvasNode & { className?: string; style?: Record<string, string | number> };

export function applyFocus(nodes: FocusNode[], focusedNodeId: string | null): FocusNode[] {
  if (!focusedNodeId) return nodes;

  return nodes.map((node) => {
    if (node.id === focusedNodeId) {
      return { ...node, className: 'ring-2 ring-primary ring-offset-2 scale-105 transition-all duration-300' };
    }
    return { ...node, style: { ...node.style, opacity: 0.4, transition: 'opacity 0.3s ease' } };
  });
}

export function useContextFocus(nodes: FocusNode[], focusedNodeId: string | null): FocusNode[] {
  return useMemo(() => applyFocus(nodes, focusedNodeId), [nodes, focusedNodeId]);
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasEdge, CanvasNode } from '../buildGraph';
import { loadCanvasLayoutGraphKey, saveCanvasLayoutGraphKey, saveCanvasPositions } from '../persistence';
import { buildCanvasLayoutKey, runCanvasAutoLayout, type AutoLayoutResult } from './elkLayout';

export function useCanvasAutoLayout(
  graph: { nodes: CanvasNode[]; edges: CanvasEdge[] },
  projectId: string | null,
) {
  const [layoutResult, setLayoutResult] = useState<AutoLayoutResult | null>(null);
  const [isLayouting, setIsLayouting] = useState(false);
  const graphKey = useMemo(() => buildCanvasLayoutKey(graph), [graph]);
  const requestRef = useRef(0);

  const runLayout = useCallback(async (persistResult: boolean) => {
    if (!graph.nodes.length) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsLayouting(true);
    try {
      const next = await runCanvasAutoLayout(graph, graphKey);
      if (requestRef.current !== requestId) return;
      setLayoutResult(next);
      if (persistResult && projectId) {
        saveCanvasPositions(projectId, new Map(next.nodes.map((node) => {
          const size = node.size;
          return [node.id, {
            x: node.position.x,
            y: node.position.y,
            w: size?.w,
            h: size?.h,
          }];
        })));
        saveCanvasLayoutGraphKey(projectId, graphKey);
      }
    } finally {
      if (requestRef.current === requestId) setIsLayouting(false);
    }
  }, [graph, graphKey, projectId]);

  useEffect(() => {
    if (!graph.nodes.length) return;
    const savedGraphKey = projectId ? loadCanvasLayoutGraphKey(projectId) : null;
    if (savedGraphKey === graphKey) return;
    const timer = window.setTimeout(() => {
      void runLayout(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [graph.nodes.length, graphKey, projectId, runLayout]);

  return {
    graphKey,
    isLayouting,
    layoutedGraph: layoutResult?.graphKey === graphKey
      ? { nodes: layoutResult.nodes, edges: graph.edges }
      : graph,
    routedEdges: layoutResult?.graphKey === graphKey ? layoutResult.routedEdges : [],
    relayout: () => runLayout(true),
  };
}

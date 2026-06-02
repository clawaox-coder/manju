import type { CanvasEdge, CanvasNode } from './buildGraph';

const STORAGE_PREFIX = 'manju.canvas.';

interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  savedAt: string;
}

export function saveCanvasState(projectId: string, nodes: CanvasNode[], edges: CanvasEdge[]) {
  const state: CanvasState = {
    nodes: nodes.map((n) => ({ ...n, data: undefined })),
    edges,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(state));
}

export function loadCanvasPositions(projectId: string): Map<string, { x: number; y: number }> | null {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
  if (!raw) return null;
  try {
    const state: CanvasState = JSON.parse(raw);
    const map = new Map<string, { x: number; y: number }>();
    for (const node of state.nodes) {
      map.set(node.id, node.position);
    }
    return map;
  } catch {
    return null;
  }
}

export function loadCanvasEdges(projectId: string): CanvasEdge[] | null {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
  if (!raw) return null;
  try {
    const state: CanvasState = JSON.parse(raw);
    return state.edges;
  } catch {
    return null;
  }
}

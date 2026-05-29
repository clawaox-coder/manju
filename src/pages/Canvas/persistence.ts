import type { Node, Edge } from '@xyflow/react';
import type { Decision } from './agent/types';

const STORAGE_PREFIX = 'manju.canvas.';
const DECISIONS_KEY_PREFIX = 'manju.canvas.decisions.';

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  savedAt: string;
}

export function saveCanvasState(projectId: string, nodes: Node[], edges: Edge[]) {
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

export function loadCanvasEdges(projectId: string): Edge[] | null {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
  if (!raw) return null;
  try {
    const state: CanvasState = JSON.parse(raw);
    return state.edges;
  } catch {
    return null;
  }
}

export function saveDecisions(projectId: string, decisions: Decision[]): void {
  localStorage.setItem(`${DECISIONS_KEY_PREFIX}${projectId}`, JSON.stringify(decisions));
}

export function loadDecisions(projectId: string): Decision[] {
  const raw = localStorage.getItem(`${DECISIONS_KEY_PREFIX}${projectId}`);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function clearDecisions(projectId: string): void {
  localStorage.removeItem(`${DECISIONS_KEY_PREFIX}${projectId}`);
}

import ELK from 'elkjs/lib/elk.bundled.js';
import type { CanvasEdge, CanvasNode } from '../buildGraph';
import { MANJU_NODE_SIZE, type ManjuNodeType } from '../canvas/ManjuNodeUtil';

export type LayoutPoint = { x: number; y: number };

export type RoutedSystemEdge = {
  id: string;
  color: string;
  points: LayoutPoint[];
};

export type AutoLayoutResult = {
  graphKey: string;
  nodes: CanvasNode[];
  routedEdges: RoutedSystemEdge[];
};

type ElkPoint = { x: number; y: number };
type ElkSection = { startPoint?: ElkPoint; bendPoints?: ElkPoint[]; endPoint?: ElkPoint };
type ElkEdge = { id: string; sections?: ElkSection[] };
type ElkNode = { id: string; x?: number; y?: number; width?: number; height?: number; children?: ElkNode[]; edges?: ElkEdge[] };

const elk = new ELK();

function toNodeType(type?: string): ManjuNodeType {
  return (['script', 'storyboard', 'character', 'ai', 'video', 'decision', 'risk'].includes(type ?? '')
    ? type
    : 'script') as ManjuNodeType;
}

function getNodeSize(node: CanvasNode) {
  const fallback = MANJU_NODE_SIZE[toNodeType(node.type)];
  return node.size ?? fallback;
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildCanvasLayoutKey(graph: { nodes: CanvasNode[]; edges: CanvasEdge[] }): string {
  return JSON.stringify({
    nodes: sortById(graph.nodes).map((node) => {
      const size = getNodeSize(node);
      return { id: node.id, type: node.type ?? 'script', w: size.w, h: size.h };
    }),
    edges: sortById(graph.edges).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
  });
}

function collectEdgePoints(edge: ElkEdge): LayoutPoint[] {
  if (!edge.sections?.length) return [];
  const points: LayoutPoint[] = [];
  for (const section of edge.sections) {
    if (section.startPoint) points.push(section.startPoint);
    if (section.bendPoints?.length) points.push(...section.bendPoints);
    if (section.endPoint) points.push(section.endPoint);
  }
  return points.filter((point, index, array) => index === 0 || point.x !== array[index - 1].x || point.y !== array[index - 1].y);
}

export async function runCanvasAutoLayout(
  graph: { nodes: CanvasNode[]; edges: CanvasEdge[] },
  graphKey: string,
): Promise<AutoLayoutResult> {
  const laidOut = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.spacing.nodeNode': '70',
      'elk.spacing.edgeNode': '28',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '24',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
    },
    children: graph.nodes.map((node) => {
      const size = getNodeSize(node);
      return {
        id: node.id,
        width: size.w,
        height: size.h,
      };
    }),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  } as unknown as Parameters<typeof elk.layout>[0]) as unknown as ElkNode;

  const nodeMap = new Map<string, ElkNode>((laidOut.children ?? []).map((node) => [node.id, node]));
  const laidOutNodes = graph.nodes.map((node) => {
    const laidOutNode = nodeMap.get(node.id);
    const size = getNodeSize(node);
    return {
      ...node,
      position: {
        x: laidOutNode?.x ?? node.position.x,
        y: laidOutNode?.y ?? node.position.y,
      },
      size,
    };
  });

  const edgeMap = new Map<string, ElkEdge>((laidOut.edges ?? []).map((edge) => [edge.id, edge]));
  const routedEdges = graph.edges.map((edge) => ({
    id: edge.id,
    color: typeof edge.style?.stroke === 'string' ? edge.style.stroke : '#a855f7',
    points: collectEdgePoints(edgeMap.get(edge.id) ?? { id: edge.id }),
  }));

  return { graphKey, nodes: laidOutNodes, routedEdges };
}

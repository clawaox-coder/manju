import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Tldraw, useEditor, createShapeId, useValue, getArrowBindings } from 'tldraw';
import { FolderOpen, MessageSquarePlus, MessageSquareText, MoreHorizontal, X } from 'lucide-react';
import 'tldraw/tldraw.css';
import { ChatPanel } from './chat/ChatPanel';
import { CanvasToolbar } from './CanvasToolbar';
import { AssetLibraryPanel } from './AssetLibraryPanel';
import { UploadDialog } from '@/components/domain/UploadDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { linkProjectAsset, type AssetDTO } from '@/lib/api/assets';
import { AgentStateMachine } from './agent/AgentStateMachine';
import { makeUserMessage, makeAiMessage, makeProgressMessage, makeErrorAction, makeSystemMessage, makeCardGroupMessage, makeMilestoneMessage } from './agent/AgentMessages';
import type { ChatMessage, Stage } from './agent/types';
import { useStore } from '@/store';
import { useEffectiveTheme } from '@/hooks/useTheme';
import { useScript, useShots, useUpdateScript } from '@/hooks/useScriptApi';
import { useAssets } from '@/hooks/useAssetApi';
import { useProjects, useUpdateProject } from '@/hooks/useProjectApi';
import { voiceMatch, streamScriptContinue, storyboardGenerate, getAiTask, chat, generateTitle, type ChatTrigger } from '@/lib/api/ai';
import { createRender, getRender } from '@/lib/api/render';
import { buildCanvasGraph, type CanvasEdge as CanvasGraphEdge, type CanvasNode as CanvasGraphNode } from './buildGraph';
import { ManjuNodeUtil, MANJU_NODE_SIZE, type ManjuNodeType, type ManjuNodeProps } from './canvas/ManjuNodeUtil';
import { CanvasInlineEditorOverlay } from './CanvasInlineEditorOverlay';
import { getObjectWorkbenchLayoutPrefs } from './objectWorkbenchLayout';
import {
  DEMO_CANVAS_PROJECT_ID,
  DEMO_CANVAS_PROJECT_NAME,
  demoCanvasCharacters,
  isDemoCanvasProjectId,
} from './demoCanvasData';
import { getConversationResetMessage } from './chat/sessionReset';
import { type RoutedSystemEdge } from './layout/elkLayout';
import { useCanvasAutoLayout } from './layout/useCanvasAutoLayout';
import { deriveCanvasState } from './canvasDerivedState';
import {
  buildCanvasContextSummary,
  buildFocusMemory,
  getNodeFocusTypeLabel,
  getNodeLabel,
  getNodeStageTask,
  type TurnContext,
} from './focusContext';
import {
  loadUserArrows,
  saveCanvasPositions,
  saveUserArrows,
  USER_ARROW_META_KEY,
  type PositionRecord,
  type UserArrowRecord,
} from './persistence';
import { cn } from '@/lib/utils';

const MANJU_SHAPE_UTILS = [ManjuNodeUtil];

const RENDER_TERMINAL = ['done', 'failed', 'cancelled'];
const RENDER_POLL_MS = 2000;
const RENDER_TIMEOUT_MS = 120000;

async function pollRender(jobId: string, onSlow: () => void): Promise<{ ok: boolean; url: string | null }> {
  const start = Date.now();
  let warnedSlow = false;
  for (;;) {
    if (Date.now() - start > RENDER_TIMEOUT_MS) return { ok: false, url: null };
    if (!warnedSlow && Date.now() - start > 30000) { warnedSlow = true; onSlow(); }
    const job = await getRender(jobId);
    if (RENDER_TERMINAL.includes(job.status)) {
      return { ok: job.status === 'done', url: job.result_url };
    }
    await new Promise((r) => setTimeout(r, RENDER_POLL_MS));
  }
}

const AI_TASK_TERMINAL = ['done', 'succeeded', 'failed', 'error'];
const AI_TASK_POLL_MS = 2000;
const AI_TASK_TIMEOUT_MS = 90000;

const STAGE_LABELS = {
  idea: '找方向',
  script: '写剧本',
  storyboard: '做分镜',
  voice: '配声音',
  video: '出成片',
} as const;

const CANVAS_NODE_TYPES: ManjuNodeType[] = ['script', 'storyboard', 'character', 'ai', 'video', 'decision', 'risk'];

// 每个 stage 只允许它对应的那一个制作动作（与后端 CHAT_SYSTEM 的白名单一致）。
// video 阶段不允许任何 trigger。前端据此对 LLM 返回的 trigger 做越权校验。
const STAGE_ALLOWED_ACTION: Record<Stage, ChatTrigger['action'] | null> = {
  idea: 'generate_script',
  script: 'generate_storyboard',
  storyboard: 'match_voice',
  voice: 'render_video',
  video: null,
};

async function genOutline(projectId: string, instruction: string): Promise<string> {
  let full = '';
  for await (const evt of streamScriptContinue({ project_id: projectId, context: '', instruction })) {
    if (evt.event === 'delta') full += (evt.data as { text?: string }).text ?? '';
    else if (evt.event === 'error') {
      // 后端以 error 事件（而非 HTTP 错误）上报失败，需主动抛出，否则会静默返回空串。
      throw new Error((evt.data as { message?: string }).message || 'AI 生成失败');
    }
  }
  const text = full.trim();
  if (!text) throw new Error('AI 未返回内容'); // 空结果按失败处理，触发重试而非渲染空卡
  return text;
}

async function pollAiTask(taskId: string): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > AI_TASK_TIMEOUT_MS) return false;
    const task = await getAiTask(taskId);
    if (AI_TASK_TERMINAL.includes(task.status)) {
      return task.status === 'done' || task.status === 'succeeded';
    }
    await new Promise((r) => setTimeout(r, AI_TASK_POLL_MS));
  }
}

// 把 buildGraph 的 node.data 按 type 映射成 manjuNode 的扁平 props。
// 尺寸:用户已 saved(node.size)优先,否则用 MANJU_NODE_SIZE[type] 默认。
function toManjuProps(node: CanvasGraphNode): ManjuNodeProps {
  const d = node.data ?? {};
  const nodeType = (CANVAS_NODE_TYPES.includes((node.type ?? '') as ManjuNodeType)
    ? node.type : 'script') as ManjuNodeType;
  const size = node.size ?? MANJU_NODE_SIZE[nodeType];
  const base = { ...size, nodeId: node.id, nodeType, title: d.title ?? node.id, body: '', badge: '', imageUrl: '', status: '' };
  switch (nodeType) {
    case 'script':
      return { ...base, badge: d.sceneNumber ? String(d.sceneNumber) : '', body: d.content ?? '', status: d.status ?? 'draft' };
    case 'storyboard':
      return { ...base, badge: d.style ?? '', body: d.dialog ?? '', imageUrl: d.imageUrl ?? '', status: d.status ?? 'draft' };
    case 'character':
      return { ...base, title: d.name ?? d.title ?? '角色', body: d.description ?? '', imageUrl: d.avatar ?? '', status: d.status ?? 'ready' };
    case 'ai':
      return { ...base, title: d.label ?? d.title ?? 'AI', badge: d.model ?? '', status: d.status ?? 'idle' };
    case 'video':
      return { ...base, badge: d.duration ?? '', body: '等待素材', status: d.status ?? 'waiting' };
    case 'decision':
    case 'risk':
      return { ...base, badge: d.badge ?? '', body: d.content ?? '', status: d.status ?? (nodeType === 'decision' ? 'candidate' : 'warning') };
    default:
      return base;
  }
}

function turnContextForNode(node?: CanvasGraphNode | null): TurnContext {
  if (node?.type === 'decision') {
    return {
      intent_source: 'canvas_action',
      canvas_action: { type: 'confirm', target_id: node.id },
      expects: 'confirmation',
    };
  }
  if (node?.type === 'risk') {
    return {
      intent_source: 'canvas_action',
      canvas_action: { type: 'select', target_id: node.id },
      expects: 'risk_review',
    };
  }
  return {
    intent_source: 'canvas_action',
    canvas_action: { type: 'select', target_id: node?.id },
    expects: 'explanation',
  };
}

type OverlayAnchor = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  compact: boolean;
};

function stripShapePrefix(shapeId: string): string {
  return shapeId.replace(/^shape:/, '');
}

type ArrowShapeView = {
  id: string;
  type: string;
  isLocked?: boolean;
  opacity?: number;
  meta?: Record<string, unknown>;
  props?: { kind?: string; bend?: number; arrowheadEnd?: string; arrowheadStart?: string };
};

type ManjuShapeView = {
  id: string;
  type: string;
  x: number;
  y: number;
  props: { w?: number; h?: number };
};

type ArrowBindingView = {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  props: {
    terminal: 'start' | 'end';
    normalizedAnchor: { x: number; y: number };
    isExact: boolean;
    isPrecise: boolean;
  };
};

type SmartAnchorContext = {
  sourceType?: string;
  targetType?: string;
  sourceRank?: number;
  sourceCount?: number;
  targetRank?: number;
  targetCount?: number;
};

type ScreenPoint = { x: number; y: number };

type RectLike = { x: number; y: number; w: number; h: number };

type OverlayEdge = {
  id: string;
  color: string;
  segments: Array<{ a: ScreenPoint; b: ScreenPoint; orientation: 'h' | 'v' }>;
};

type BridgeMarker = {
  edgeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function isUserArrowShape(shape: ArrowShapeView | undefined): boolean {
  if (!shape || shape.type !== 'arrow' || shape.isLocked) return false;
  return shape.meta?.[USER_ARROW_META_KEY] === true;
}

function hashArrowBendSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function getArrowVisualProps(seed: string) {
  const bend = (Math.abs(hashArrowBendSeed(seed)) % 2 === 0 ? 24 : -24);
  return {
    kind: 'elbow',
    bend,
    dash: 'dashed',
    arrowheadStart: 'none',
    arrowheadEnd: 'none',
  } as const;
}

function getAnchorLane(seed: string): number {
  return Math.abs(hashArrowBendSeed(seed)) % 5;
}

function getSmartAnchors(
  fromRect: { x: number; y: number; w: number; h: number },
  toRect: { x: number; y: number; w: number; h: number },
  seed: string,
  context?: SmartAnchorContext,
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const fromCenter = { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 };
  const toCenter = { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const lane = getAnchorLane(seed);
  const laneOffsets = [0.18, 0.34, 0.5, 0.66, 0.82] as const;
  const laneValue = laneOffsets[lane];
  const sourceHub = context?.sourceType === 'ai' || context?.sourceType === 'video';
  const targetHub = context?.targetType === 'ai' || context?.targetType === 'video';
  const sourceCrowded = (context?.sourceCount ?? 0) >= 3;
  const targetCrowded = (context?.targetCount ?? 0) >= 3;
  const sourceLane = context?.sourceRank != null
    ? laneOffsets[Math.min(context.sourceRank, laneOffsets.length - 1)]
    : laneValue;
  const targetLane = context?.targetRank != null
    ? laneOffsets[Math.min(context.targetRank, laneOffsets.length - 1)]
    : laneOffsets[(lane + 1) % laneOffsets.length];

  if ((sourceHub || sourceCrowded) && Math.abs(dy) > 24) {
    return {
      start: dy >= 0 ? { x: sourceLane, y: 1 } : { x: sourceLane, y: 0 },
      end: Math.abs(dx) >= Math.abs(dy)
        ? (dx >= 0 ? { x: 0, y: targetLane } : { x: 1, y: targetLane })
        : (dy >= 0 ? { x: targetLane, y: 0 } : { x: targetLane, y: 1 }),
    };
  }

  if ((targetHub || targetCrowded) && Math.abs(dy) > 24) {
    return {
      start: Math.abs(dx) >= Math.abs(dy)
        ? (dx >= 0 ? { x: 1, y: sourceLane } : { x: 0, y: sourceLane })
        : (dy >= 0 ? { x: sourceLane, y: 1 } : { x: sourceLane, y: 0 }),
      end: dy >= 0 ? { x: targetLane, y: 0 } : { x: targetLane, y: 1 },
    };
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? {
          start: { x: 1, y: sourceLane },
          end: { x: 0, y: targetLane },
        }
      : {
          start: { x: 0, y: sourceLane },
          end: { x: 1, y: targetLane },
        };
  }

  return dy >= 0
    ? {
        start: { x: sourceLane, y: 1 },
        end: { x: targetLane, y: 0 },
      }
    : {
        start: { x: sourceLane, y: 0 },
        end: { x: targetLane, y: 1 },
      };
}

function buildEdgeContextMap(graph: { nodes: CanvasGraphNode[]; edges: CanvasGraphEdge[] }) {
  const graphNodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoingRankMap = new Map<string, number>();
  const incomingRankMap = new Map<string, number>();
  const outgoingCountMap = new Map<string, number>();
  const incomingCountMap = new Map<string, number>();
  const edgeContextMap = new Map<string, SmartAnchorContext>();
  const outgoingGroups = new Map<string, CanvasGraphEdge[]>();
  const incomingGroups = new Map<string, CanvasGraphEdge[]>();

  for (const edge of graph.edges) {
    outgoingGroups.set(edge.source, [...(outgoingGroups.get(edge.source) ?? []), edge]);
    incomingGroups.set(edge.target, [...(incomingGroups.get(edge.target) ?? []), edge]);
  }
  for (const [sourceId, edges] of outgoingGroups) {
    const sorted = [...edges].sort((a, b) => {
      const ay = (graphNodeMap.get(a.target)?.position?.y ?? 0);
      const by = (graphNodeMap.get(b.target)?.position?.y ?? 0);
      return ay - by;
    });
    outgoingCountMap.set(sourceId, sorted.length);
    sorted.forEach((edge, index) => outgoingRankMap.set(edge.id, index));
  }
  for (const [targetId, edges] of incomingGroups) {
    const sorted = [...edges].sort((a, b) => {
      const ay = (graphNodeMap.get(a.source)?.position?.y ?? 0);
      const by = (graphNodeMap.get(b.source)?.position?.y ?? 0);
      return ay - by;
    });
    incomingCountMap.set(targetId, sorted.length);
    sorted.forEach((edge, index) => incomingRankMap.set(edge.id, index));
  }
  for (const edge of graph.edges) {
    edgeContextMap.set(edge.id, {
      sourceType: graphNodeMap.get(edge.source)?.type,
      targetType: graphNodeMap.get(edge.target)?.type,
      sourceRank: outgoingRankMap.get(edge.id),
      sourceCount: outgoingCountMap.get(edge.source),
      targetRank: incomingRankMap.get(edge.id),
      targetCount: incomingCountMap.get(edge.target),
    });
  }
  return edgeContextMap;
}

function anchorToPoint(rect: { x: number; y: number; w: number; h: number }, anchor: { x: number; y: number }): ScreenPoint {
  return {
    x: rect.x + rect.w * anchor.x,
    y: rect.y + rect.h * anchor.y,
  };
}

function pointInsideRect(point: ScreenPoint, rect: RectLike, padding = 0) {
  return point.x >= rect.x - padding
    && point.x <= rect.x + rect.w + padding
    && point.y >= rect.y - padding
    && point.y <= rect.y + rect.h + padding;
}

function segmentIntersectsRect(a: ScreenPoint, b: ScreenPoint, rect: RectLike, padding = 0) {
  const expanded = {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + padding * 2,
    h: rect.h + padding * 2,
  };
  if (pointInsideRect(a, expanded) || pointInsideRect(b, expanded)) return false;
  if (Math.abs(a.x - b.x) < 0.5) {
    const x = a.x;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return x >= expanded.x
      && x <= expanded.x + expanded.w
      && maxY >= expanded.y
      && minY <= expanded.y + expanded.h;
  }
  if (Math.abs(a.y - b.y) < 0.5) {
    const y = a.y;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return y >= expanded.y
      && y <= expanded.y + expanded.h
      && maxX >= expanded.x
      && minX <= expanded.x + expanded.w;
  }
  return false;
}

function isVerticalAnchor(anchor: { x: number; y: number }) {
  return anchor.y === 0 || anchor.y === 1;
}

function isHorizontalAnchor(anchor: { x: number; y: number }) {
  return anchor.x === 0 || anchor.x === 1;
}

function getObstacleAwareAnchors(
  fromRect: RectLike,
  toRect: RectLike,
  seed: string,
  obstacles: RectLike[],
  context?: SmartAnchorContext,
) {
  const anchors = getSmartAnchors(fromRect, toRect, seed, context);
  const start = anchorToPoint(fromRect, anchors.start);
  const end = anchorToPoint(toRect, anchors.end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const sideLane = anchors.start.y === 0 || anchors.start.y === 1 ? anchors.start.x : anchors.start.y;
  const endSideLane = anchors.end.y === 0 || anchors.end.y === 1 ? anchors.end.x : anchors.end.y;
  const startProbe = isVerticalAnchor(anchors.start)
    ? { x: start.x, y: start.y + (dy >= 0 ? 56 : -56) }
    : { x: start.x + (dx >= 0 ? 56 : -56), y: start.y };
  const endProbe = isVerticalAnchor(anchors.end)
    ? { x: end.x, y: end.y + (dy >= 0 ? -56 : 56) }
    : { x: end.x + (dx >= 0 ? -56 : 56), y: end.y };

  const startBlocked = obstacles.some((rect) => segmentIntersectsRect(start, startProbe, rect, 14));
  const endBlocked = obstacles.some((rect) => segmentIntersectsRect(end, endProbe, rect, 14));

  if (startBlocked) {
    anchors.start = Math.abs(dx) >= Math.abs(dy)
      ? (dx >= 0 ? { x: 1, y: sideLane } : { x: 0, y: sideLane })
      : (dx >= 0 ? { x: 1, y: 0.72 } : { x: 0, y: 0.28 });
  }

  if (endBlocked) {
    anchors.end = Math.abs(dx) >= Math.abs(dy)
      ? (dx >= 0 ? { x: 0, y: endSideLane } : { x: 1, y: endSideLane })
      : (dx >= 0 ? { x: 0, y: 0.28 } : { x: 1, y: 0.72 });
  }

  return anchors;
}

function chooseCorridor(
  candidates: number[],
  buildSegment: (value: number) => Array<{ a: ScreenPoint; b: ScreenPoint }>,
  obstacles: RectLike[],
) {
  let bestValue = candidates[0];
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (const value of candidates) {
    const penalty = buildSegment(value).reduce((total, segment) => (
      total + obstacles.filter((rect) => segmentIntersectsRect(segment.a, segment.b, rect, 16)).length
    ), 0);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestValue = value;
    }
    if (penalty === 0) break;
  }
  return bestValue;
}

function buildElbowRoute(
  fromRect: { x: number; y: number; w: number; h: number },
  toRect: { x: number; y: number; w: number; h: number },
  seed: string,
  obstacles: RectLike[],
  context?: SmartAnchorContext,
): ScreenPoint[] {
  const anchors = getObstacleAwareAnchors(fromRect, toRect, seed, obstacles, context);
  const start = anchorToPoint(fromRect, anchors.start);
  const end = anchorToPoint(toRect, anchors.end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const offset = 18;

  if (
    (isHorizontalAnchor(anchors.start) && isHorizontalAnchor(anchors.end))
    || (!isVerticalAnchor(anchors.start) && !isVerticalAnchor(anchors.end) && Math.abs(dx) >= Math.abs(dy))
  ) {
    const dir = dx >= 0 ? 1 : -1;
    const exit = { x: start.x + dir * offset, y: start.y };
    const enter = { x: end.x - dir * offset, y: end.y };
    const sidePadding = 44;
    const candidates = [
      (exit.x + enter.x) / 2,
      Math.max(fromRect.x + fromRect.w, toRect.x + toRect.w) + sidePadding,
      Math.min(fromRect.x, toRect.x) - sidePadding,
    ];
    const midX = chooseCorridor(candidates, (value) => [
      { a: exit, b: { x: value, y: exit.y } },
      { a: { x: value, y: exit.y }, b: { x: value, y: enter.y } },
      { a: { x: value, y: enter.y }, b: enter },
    ], obstacles);
    return [start, exit, { x: midX, y: exit.y }, { x: midX, y: enter.y }, enter, end];
  }

  const dir = dy >= 0 ? 1 : -1;
  const exit = { x: start.x, y: start.y + dir * offset };
  const enter = { x: end.x, y: end.y - dir * offset };
  const sidePadding = 44;
  const candidates = [
    (exit.y + enter.y) / 2,
    Math.max(fromRect.y + fromRect.h, toRect.y + toRect.h) + sidePadding,
    Math.min(fromRect.y, toRect.y) - sidePadding,
  ];
  const midY = chooseCorridor(candidates, (value) => [
    { a: exit, b: { x: exit.x, y: value } },
    { a: { x: exit.x, y: value }, b: { x: enter.x, y: value } },
    { a: { x: enter.x, y: value }, b: enter },
  ], obstacles);
  return [start, exit, { x: exit.x, y: midY }, { x: enter.x, y: midY }, enter, end];
}

function toSegments(points: ScreenPoint[]) {
  const segments: Array<{ a: ScreenPoint; b: ScreenPoint; orientation: 'h' | 'v' }> = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) continue;
    segments.push({
      a,
      b,
      orientation: Math.abs(a.y - b.y) < Math.abs(a.x - b.x) ? 'h' : 'v',
    });
  }
  return segments;
}

function nudgePointAwayFromRect(
  point: ScreenPoint,
  nextPoint: ScreenPoint,
  rect: RectLike,
  gap = 12,
): ScreenPoint {
  if (Math.abs(point.x - nextPoint.x) < 0.5) {
    if (Math.abs(point.x - rect.x) < 1) return { x: point.x - gap, y: point.y };
    if (Math.abs(point.x - (rect.x + rect.w)) < 1) return { x: point.x + gap, y: point.y };
    if (point.y <= rect.y + 1) return { x: point.x, y: point.y - gap };
    if (point.y >= rect.y + rect.h - 1) return { x: point.x, y: point.y + gap };
  }
  if (Math.abs(point.y - nextPoint.y) < 0.5) {
    if (Math.abs(point.y - rect.y) < 1) return { x: point.x, y: point.y - gap };
    if (Math.abs(point.y - (rect.y + rect.h)) < 1) return { x: point.x, y: point.y + gap };
    if (point.x <= rect.x + 1) return { x: point.x - gap, y: point.y };
    if (point.x >= rect.x + rect.w - 1) return { x: point.x + gap, y: point.y };
  }
  return point;
}

function addTerminalGap(points: ScreenPoint[], fromRect: RectLike, toRect: RectLike, gap = 12): ScreenPoint[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const next = points.map((point) => ({ ...point }));
  next[0] = nudgePointAwayFromRect(next[0], next[1], fromRect, gap);
  next[next.length - 1] = nudgePointAwayFromRect(next[next.length - 1], next[next.length - 2], toRect, gap);
  return next;
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number, padding = 0) {
  const minA = Math.min(a0, a1);
  const maxA = Math.max(a0, a1);
  const minB = Math.min(b0, b1) - padding;
  const maxB = Math.max(b0, b1) + padding;
  return maxA >= minB && minA <= maxB;
}

function addEdgeClearance(points: ScreenPoint[], rects: RectLike[], gap = 14): ScreenPoint[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const next = points.map((point) => ({ ...point }));

  for (let i = 0; i < next.length - 1; i += 1) {
    let j = i + 1;

    if (Math.abs(next[i].x - next[j].x) < 0.5) {
      while (j + 1 < next.length && Math.abs(next[j + 1].x - next[i].x) < 0.5) j += 1;
      const x = next[i].x;
      const y0 = next[i].y;
      const y1 = next[j].y;
      let shift = 0;

      for (const rect of rects) {
        if (!rangesOverlap(y0, y1, rect.y, rect.y + rect.h, 8)) continue;
        const leftDistance = Math.abs(x - rect.x);
        const rightDistance = Math.abs(x - (rect.x + rect.w));
        if (leftDistance <= gap) shift = Math.min(shift, -(gap - leftDistance + 2));
        if (rightDistance <= gap) shift = Math.max(shift, gap - rightDistance + 2);
      }

      if (shift !== 0) {
        for (let k = i; k <= j; k += 1) next[k].x += shift;
      }
      i = j - 1;
      continue;
    }

    if (Math.abs(next[i].y - next[j].y) < 0.5) {
      while (j + 1 < next.length && Math.abs(next[j + 1].y - next[i].y) < 0.5) j += 1;
      const y = next[i].y;
      const x0 = next[i].x;
      const x1 = next[j].x;
      let shift = 0;

      for (const rect of rects) {
        if (!rangesOverlap(x0, x1, rect.x, rect.x + rect.w, 8)) continue;
        const topDistance = Math.abs(y - rect.y);
        const bottomDistance = Math.abs(y - (rect.y + rect.h));
        if (topDistance <= gap) shift = Math.min(shift, -(gap - topDistance + 2));
        if (bottomDistance <= gap) shift = Math.max(shift, gap - bottomDistance + 2);
      }

      if (shift !== 0) {
        for (let k = i; k <= j; k += 1) next[k].y += shift;
      }
      i = j - 1;
    }
  }

  return next;
}

function buildBridgePath(segment: { a: ScreenPoint; b: ScreenPoint }, bridges: BridgeMarker[]) {
  const sorted = [...bridges].sort((a, b) => a.x - b.x);
  const left = Math.min(segment.a.x, segment.b.x);
  const right = Math.max(segment.a.x, segment.b.x);
  let d = `M ${left} ${segment.a.y}`;
  let cursor = left;
  for (const bridge of sorted) {
    const startX = Math.max(cursor, bridge.x - bridge.width / 2);
    const endX = Math.min(right, bridge.x + bridge.width / 2);
    if (startX <= cursor || endX <= startX) continue;
    d += ` L ${startX} ${segment.a.y}`;
    d += ` C ${startX + bridge.width * 0.18} ${segment.a.y} ${bridge.x - bridge.width * 0.18} ${bridge.y - bridge.height} ${bridge.x} ${bridge.y - bridge.height}`;
    d += ` C ${bridge.x + bridge.width * 0.18} ${bridge.y - bridge.height} ${endX - bridge.width * 0.18} ${segment.a.y} ${endX} ${segment.a.y}`;
    cursor = endX;
  }
  d += ` L ${right} ${segment.a.y}`;
  return d;
}

function applyArrowVisualStyle(
  editor: ReturnType<typeof useEditor>,
  arrowId: ReturnType<typeof createShapeId>,
  seed: string,
  extra?: Partial<ArrowShapeView>,
) {
  const visual = getArrowVisualProps(seed);
  editor.updateShape({
    id: arrowId,
    type: 'arrow',
    ...extra,
    props: {
      ...visual,
    },
  } as unknown as Parameters<typeof editor.updateShape>[0]);
}

function CanvasEdgeBridgeOverlay({
  graph,
  routedEdges,
}: {
  graph: { nodes: CanvasGraphNode[]; edges: CanvasGraphEdge[] };
  routedEdges: RoutedSystemEdge[];
}) {
  const editor = useEditor();
  const overlay = useValue('canvas-edge-bridge-overlay', () => {
    const viewport = editor.getViewportScreenBounds();
    const contextMap = buildEdgeContextMap(graph);
    const edges: OverlayEdge[] = [];
    const nodeRects = new Map<string, RectLike>();
    const routedEdgeMap = new Map(routedEdges.map((edge) => [edge.id, edge]));

    for (const node of graph.nodes) {
      const shape = editor.getShape(createShapeId(node.id)) as unknown as ManjuShapeView | undefined;
      if (!shape || shape.type !== 'manjuNode') continue;
      nodeRects.set(node.id, {
        x: shape.x,
        y: shape.y,
        w: shape.props.w ?? MANJU_NODE_SIZE[(CANVAS_NODE_TYPES.includes((node.type ?? '') as ManjuNodeType) ? node.type : 'script') as ManjuNodeType].w,
        h: shape.props.h ?? MANJU_NODE_SIZE[(CANVAS_NODE_TYPES.includes((node.type ?? '') as ManjuNodeType) ? node.type : 'script') as ManjuNodeType].h,
      });
    }

    for (const edge of graph.edges) {
      const fromRect = nodeRects.get(edge.source);
      const toRect = nodeRects.get(edge.target);
      if (!fromRect || !toRect) continue;
      const routed = routedEdgeMap.get(edge.id);
      const route = routed?.points.length
        ? routed.points
        : buildElbowRoute(
            fromRect,
            toRect,
            edge.id,
            [...nodeRects.entries()]
              .filter(([id]) => id !== edge.source && id !== edge.target)
              .map(([, rect]) => rect),
            contextMap.get(edge.id),
          );
      const routeWithClearance = addEdgeClearance(
        addTerminalGap(route, fromRect, toRect, 12),
        [...nodeRects.values()],
        14,
      ).map((point) => {
        const screen = editor.pageToScreen(point);
        return { x: screen.x - viewport.x, y: screen.y - viewport.y };
      });
      edges.push({
        id: edge.id,
        color: routed?.color ?? (typeof edge.style?.stroke === 'string' ? edge.style.stroke : '#f5f5f5'),
        segments: toSegments(routeWithClearance),
      });
    }

    const bridges = new Map<string, BridgeMarker[]>();
    for (let i = 0; i < edges.length; i += 1) {
      for (let j = i + 1; j < edges.length; j += 1) {
        const a = edges[i];
        const b = edges[j];
        for (let ai = 0; ai < a.segments.length; ai += 1) {
          for (let bi = 0; bi < b.segments.length; bi += 1) {
            const segA = a.segments[ai];
            const segB = b.segments[bi];
            if (segA.orientation === segB.orientation) continue;
            const horizontal = segA.orientation === 'h' ? { edge: a, index: ai, segment: segA } : { edge: b, index: bi, segment: segB };
            const vertical = segA.orientation === 'v' ? segA : segB;
            const minHX = Math.min(horizontal.segment.a.x, horizontal.segment.b.x);
            const maxHX = Math.max(horizontal.segment.a.x, horizontal.segment.b.x);
            const minVY = Math.min(vertical.a.y, vertical.b.y);
            const maxVY = Math.max(vertical.a.y, vertical.b.y);
            const x = vertical.a.x;
            const y = horizontal.segment.a.y;
            if (x <= minHX + 14 || x >= maxHX - 14 || y <= minVY + 14 || y >= maxVY - 14) continue;
            const key = `${horizontal.edge.id}:${horizontal.index}`;
            bridges.set(key, [
              ...(bridges.get(key) ?? []),
              { edgeId: horizontal.edge.id, x, y, width: 22, height: 10 },
            ]);
          }
        }
      }
    }

    return { viewport, edges, bridges };
  }, [editor, graph]);

  if (!overlay.edges.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[140]">
      <svg
        width={overlay.viewport.w}
        height={overlay.viewport.h}
        viewBox={`0 0 ${overlay.viewport.w} ${overlay.viewport.h}`}
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        {overlay.edges.map((edge) => (
          <g key={edge.id}>
            {edge.segments.map((segment, index) => {
              const bridgeKey = `${edge.id}:${index}`;
              const segmentBridges = overlay.bridges.get(bridgeKey) ?? [];
              const path = segment.orientation === 'h' && segmentBridges.length
                ? buildBridgePath(segment, segmentBridges)
                : `M ${segment.a.x} ${segment.a.y} L ${segment.b.x} ${segment.b.y}`;
              return (
                <path
                  key={bridgeKey}
                  d={path}
                  fill="none"
                  stroke={edge.color}
                  strokeWidth="2.5"
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="manju-flow-edge"
                />
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

function updateArrowBindingsForRects(
  editor: ReturnType<typeof useEditor>,
  arrowId: ReturnType<typeof createShapeId>,
  fromRect: { x: number; y: number; w: number; h: number } | null,
  toRect: { x: number; y: number; w: number; h: number } | null,
  seed: string,
  context?: SmartAnchorContext,
) {
  if (!fromRect || !toRect) return;
  const bindings = editor.getBindingsFromShape(arrowId, 'arrow') as unknown as ArrowBindingView[];
  if (!bindings.length) return;
  const anchors = getSmartAnchors(fromRect, toRect, seed, context);
  editor.updateBindings(bindings.map((binding) => ({
    ...binding,
    props: {
      ...binding.props,
      normalizedAnchor: binding.props.terminal === 'start' ? anchors.start : anchors.end,
      isExact: false,
      isPrecise: false,
    },
  })) as unknown as Parameters<typeof editor.updateBindings>[0]);
}

function getUserArrowRecord(editor: ReturnType<typeof useEditor>, shapeId: string): UserArrowRecord | null {
  const arrow = editor.getShape(createShapeId(shapeId)) as unknown as ArrowShapeView | undefined;
  if (!isUserArrowShape(arrow)) return null;
  const bindings = getArrowBindings(editor, arrow as never);
  const fromId = bindings.start?.toId ? stripShapePrefix(String(bindings.start.toId)) : null;
  const toId = bindings.end?.toId ? stripShapePrefix(String(bindings.end.toId)) : null;
  if (!fromId || !toId || fromId === toId) return null;
  const fromShape = editor.getShape(bindings.start!.toId) as unknown as ArrowShapeView | undefined;
  const toShape = editor.getShape(bindings.end!.toId) as unknown as ArrowShapeView | undefined;
  if (fromShape?.type !== 'manjuNode' || toShape?.type !== 'manjuNode') return null;
  return { id: shapeId, from: fromId, to: toId };
}


// 把 graph 同步成 tldraw 自定义 manjuNode + bound arrow 连线。
// canvas-node-edit-layout:节点可由用户拖动 / 缩放,持久化经 store.listen + debounce 落 localStorage。
function CanvasSync({
  graph,
  projectId,
  onNodeSelect,
}: {
  graph: { nodes: CanvasGraphNode[]; edges: CanvasGraphEdge[] };
  projectId: string | null;
  onNodeSelect?: (nodeId: string) => void;
}) {
  const editor = useEditor();
  const syncedRef = useRef(new Set<string>());
  const syncedEdgesRef = useRef(new Set<string>());
  const selectedShapeIds = useValue('selectedShapeIds', () => editor.getSelectedShapeIds().map((id) => String(id)), [editor]);
  const lastSelectedRef = useRef<string | null>(null);
  const effectiveTheme = useEffectiveTheme();
  const restoredUserArrowsForProjectRef = useRef<string | null>(null);

  // 把有效明暗主题同步给 Tldraw 自己的 colorScheme，否则画布区不跟随 .dark。
  // 系统偏好监听由 useEffectiveTheme 统一处理，此处只消费结果。
  useEffect(() => {
    if (!editor) return;
    editor.user.updateUserPreferences({ colorScheme: effectiveTheme });
  }, [editor, effectiveTheme]);

  useEffect(() => {
    if (!editor || !graph.nodes.length) return;
    const existing = syncedRef.current;
    const currentIds = new Set(graph.nodes.map((n) => n.id));
    const graphNodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    const outgoingRankMap = new Map<string, number>();
    const incomingRankMap = new Map<string, number>();
    const outgoingCountMap = new Map<string, number>();
    const incomingCountMap = new Map<string, number>();
    const edgeContextMap = new Map<string, SmartAnchorContext>();
    const getGraphRect = (nodeId: string) => {
      const node = graphNodeMap.get(nodeId);
      if (!node) return null;
      const size = node.size ?? MANJU_NODE_SIZE[(CANVAS_NODE_TYPES.includes((node.type ?? '') as ManjuNodeType)
        ? node.type
        : 'script') as ManjuNodeType];
      const pos = node.position ?? { x: 0, y: 0 };
      return { x: pos.x, y: pos.y, w: size.w, h: size.h };
    };
    const outgoingGroups = new Map<string, CanvasGraphEdge[]>();
    const incomingGroups = new Map<string, CanvasGraphEdge[]>();
    for (const edge of graph.edges) {
      outgoingGroups.set(edge.source, [...(outgoingGroups.get(edge.source) ?? []), edge]);
      incomingGroups.set(edge.target, [...(incomingGroups.get(edge.target) ?? []), edge]);
    }
    for (const [sourceId, edges] of outgoingGroups) {
      const sorted = [...edges].sort((a, b) => {
        const ay = (graphNodeMap.get(a.target)?.position?.y ?? 0);
        const by = (graphNodeMap.get(b.target)?.position?.y ?? 0);
        return ay - by;
      });
      outgoingCountMap.set(sourceId, sorted.length);
      sorted.forEach((edge, index) => outgoingRankMap.set(edge.id, index));
    }
    for (const [targetId, edges] of incomingGroups) {
      const sorted = [...edges].sort((a, b) => {
        const ay = (graphNodeMap.get(a.source)?.position?.y ?? 0);
        const by = (graphNodeMap.get(b.source)?.position?.y ?? 0);
        return ay - by;
      });
      incomingCountMap.set(targetId, sorted.length);
      sorted.forEach((edge, index) => incomingRankMap.set(edge.id, index));
    }
    for (const edge of graph.edges) {
      edgeContextMap.set(edge.id, {
        sourceType: graphNodeMap.get(edge.source)?.type,
        targetType: graphNodeMap.get(edge.target)?.type,
        sourceRank: outgoingRankMap.get(edge.id),
        sourceCount: outgoingCountMap.get(edge.source),
        targetRank: incomingRankMap.get(edge.id),
        targetCount: incomingCountMap.get(edge.target),
      });
    }

    // 所有写操作包在 editor.run 里聚成一个 history 步骤(撤销/重做语义清晰)。
    // canvas-node-edit-layout:节点已可由用户拖动,不再 isLocked,也不需要 ignoreShapeLock。
    // arrow 连线仍 isLocked(用户不该拖/删 arrow,那是后续 change)。
    // StrictMode 双调时已存在的节点走 update 分支,幂等。
    editor.run(() => {
      // 删掉不再存在的节点（其相连 arrow 由 tldraw 随绑定一并清理）。
      const toRemove = [...existing].filter((id) => !currentIds.has(id));
      if (toRemove.length) {
        editor.deleteShapes(toRemove.map((id) => createShapeId(id)));
      }

      for (const node of graph.nodes) {
        const shapeId = createShapeId(node.id);
        const props = toManjuProps(node);
        const x = node.position?.x ?? 0;
        const y = node.position?.y ?? 0;
        if (!existing.has(node.id)) {
          editor.createShape({
            id: shapeId, type: 'manjuNode', x, y, props,
          } as unknown as Parameters<typeof editor.createShape>[0]);
        } else {
          editor.updateShape({
            id: shapeId, type: 'manjuNode', x, y, props,
          } as unknown as Parameters<typeof editor.updateShape>[0]);
        }
      }

    // 连线：为每条 edge 建一条两端 bound 到源/目标节点的 arrow（只建一次）。
      for (const edge of graph.edges) {
        if (!currentIds.has(edge.source) || !currentIds.has(edge.target)) continue;
        const arrowId = createShapeId(`arrow-${edge.id}`);
        const exists = !!editor.getShape(arrowId);
        if (!exists) {
          editor.createShape({
            id: arrowId,
            type: 'arrow',
            x: 0,
            y: 0,
            props: getArrowVisualProps(edge.id),
          } as unknown as Parameters<typeof editor.createShape>[0]);
          editor.createBindings([
            { fromId: arrowId, toId: createShapeId(edge.source), type: 'arrow',
              props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } },
            { fromId: arrowId, toId: createShapeId(edge.target), type: 'arrow',
              props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } },
          ] as unknown as Parameters<typeof editor.createBindings>[0]);
        }
        applyArrowVisualStyle(editor, arrowId, edge.id, { isLocked: true, opacity: 0 });
        updateArrowBindingsForRects(
          editor,
          arrowId,
          getGraphRect(edge.source),
          getGraphRect(edge.target),
          edge.id,
          edgeContextMap.get(edge.id),
        );
        syncedEdgesRef.current.add(edge.id);
      }

      if (projectId && restoredUserArrowsForProjectRef.current !== projectId) {
        const savedUserArrows = loadUserArrows(projectId);
        for (const userArrow of savedUserArrows) {
          if (!currentIds.has(userArrow.from) || !currentIds.has(userArrow.to) || userArrow.from === userArrow.to) continue;
          const arrowId = createShapeId(userArrow.id);
          const exists = !!editor.getShape(arrowId);
          if (!exists) {
            editor.createShape({
              id: arrowId,
              type: 'arrow',
              x: 0,
              y: 0,
              meta: { [USER_ARROW_META_KEY]: true },
              props: getArrowVisualProps(userArrow.id),
            } as unknown as Parameters<typeof editor.createShape>[0]);
            editor.createBindings([
              { fromId: arrowId, toId: createShapeId(userArrow.from), type: 'arrow',
                props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } },
              { fromId: arrowId, toId: createShapeId(userArrow.to), type: 'arrow',
                props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } },
            ] as unknown as Parameters<typeof editor.createBindings>[0]);
          }
          applyArrowVisualStyle(editor, arrowId, userArrow.id, {
            meta: { [USER_ARROW_META_KEY]: true },
            opacity: 1,
          });
          updateArrowBindingsForRects(
            editor,
            arrowId,
            getGraphRect(userArrow.from),
            getGraphRect(userArrow.to),
            userArrow.id,
            {
              sourceType: graphNodeMap.get(userArrow.from)?.type,
              targetType: graphNodeMap.get(userArrow.to)?.type,
            },
          );
        }
        restoredUserArrowsForProjectRef.current = projectId;
      }
    });

    syncedRef.current = currentIds;
  }, [editor, graph.nodes, graph.edges, projectId]);

  // canvas-node-edit-layout:监听用户拖动 / 缩放节点,debounce 300ms 落 localStorage。
  // source: 'user' 过滤:只听用户操作,程序化 createShape/updateShape(本组件自己)不触发。
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!editor || !projectId) return;
    const flush = () => {
      saveTimerRef.current = null;
      const map = new Map<string, PositionRecord>();
      for (const id of editor.getCurrentPageShapeIds()) {
        const shape = editor.getShape(id) as unknown as ManjuShapeView | undefined;
        if (!shape || shape.type !== 'manjuNode') continue;
        const nodeId = stripShapePrefix(String(id));
        map.set(nodeId, { x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h });
      }
      if (map.size > 0) saveCanvasPositions(projectId, map);
    };
    const unsubscribe = editor.store.listen(
      (entry) => {
        const updated = entry.changes.updated as Record<string, [unknown, unknown]>;
        const hasManju = Object.values(updated).some((pair) => {
          const after = pair[1] as { typeName?: string; type?: string };
          return after?.typeName === 'shape' && after?.type === 'manjuNode';
        });
        if (!hasManju) return;
        if (saveTimerRef.current != null) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(flush, 300);
      },
      { source: 'user', scope: 'document' },
    );
    return () => {
      if (saveTimerRef.current != null) clearTimeout(saveTimerRef.current);
      unsubscribe();
    };
  }, [editor, projectId]);

  const saveUserArrowsTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!editor || !projectId) return;
    const flush = () => {
      saveUserArrowsTimerRef.current = null;
      const rows: UserArrowRecord[] = [];
      const getShapeRect = (shapeId: string) => {
        const shape = editor.getShape(createShapeId(shapeId)) as unknown as ManjuShapeView | undefined;
        if (!shape || shape.type !== 'manjuNode') return null;
        return {
          x: shape.x,
          y: shape.y,
          w: shape.props.w ?? MANJU_NODE_SIZE.script.w,
          h: shape.props.h ?? MANJU_NODE_SIZE.script.h,
        };
      };
      for (const id of editor.getCurrentPageShapeIds()) {
        const shape = editor.getShape(id) as unknown as ArrowShapeView | undefined;
        if (!shape || shape.type !== 'arrow' || shape.isLocked) continue;
        const shapeId = stripShapePrefix(String(id));
        const nextMeta = { ...(shape.meta ?? {}), [USER_ARROW_META_KEY]: true };
        const desiredVisualProps = getArrowVisualProps(shapeId);
        const shouldApplyVisualProps = shape.props?.kind !== desiredVisualProps.kind
          || shape.props?.arrowheadEnd !== desiredVisualProps.arrowheadEnd
          || shape.props?.arrowheadStart !== desiredVisualProps.arrowheadStart
          || typeof shape.props?.bend !== 'number';
        if (shape.meta?.[USER_ARROW_META_KEY] !== true || shouldApplyVisualProps) {
          editor.updateShape({
            id,
            type: 'arrow',
            opacity: 1,
            meta: nextMeta,
            props: {
              ...shape.props,
              ...desiredVisualProps,
            },
          } as unknown as Parameters<typeof editor.updateShape>[0]);
        }
        const record = getUserArrowRecord(editor, shapeId);
        if (!record) {
          const bindings = getArrowBindings(editor, shape as never);
          const fromId = bindings.start?.toId ? stripShapePrefix(String(bindings.start.toId)) : null;
          const toId = bindings.end?.toId ? stripShapePrefix(String(bindings.end.toId)) : null;
          if (fromId && toId && fromId === toId) {
            editor.deleteShape(id);
          }
          continue;
        }
        updateArrowBindingsForRects(
          editor,
          id,
          getShapeRect(record.from),
          getShapeRect(record.to),
          record.id,
        );
        rows.push(record);
      }
      saveUserArrows(projectId, rows);
    };
    const unsubscribe = editor.store.listen(
      (entry) => {
        const added = Object.values(entry.changes.added as Record<string, unknown>).some((item) => {
          const shape = item as { typeName?: string; type?: string; isLocked?: boolean };
          return shape?.typeName === 'shape' && shape?.type === 'arrow' && !shape?.isLocked;
        });
        const updated = Object.values(entry.changes.updated as Record<string, [unknown, unknown]>).some((pair) => {
          const before = pair[0] as { typeName?: string; type?: string; isLocked?: boolean };
          const after = pair[1] as { typeName?: string; type?: string; isLocked?: boolean };
          return (before?.typeName === 'shape' && before?.type === 'arrow' && !before?.isLocked)
            || (after?.typeName === 'shape' && after?.type === 'arrow' && !after?.isLocked);
        });
        const removed = Object.values(entry.changes.removed as Record<string, unknown>).some((item) => {
          const shape = item as { typeName?: string; type?: string; isLocked?: boolean; meta?: Record<string, unknown> };
          return shape?.typeName === 'shape'
            && shape?.type === 'arrow'
            && (!shape?.isLocked || shape?.meta?.[USER_ARROW_META_KEY] === true);
        });
        if (!added && !updated && !removed) return;
        if (saveUserArrowsTimerRef.current != null) clearTimeout(saveUserArrowsTimerRef.current);
        saveUserArrowsTimerRef.current = window.setTimeout(flush, 300);
      },
      { source: 'user', scope: 'document' },
    );
    return () => {
      if (saveUserArrowsTimerRef.current != null) clearTimeout(saveUserArrowsTimerRef.current);
      unsubscribe();
    };
  }, [editor, projectId]);

  useEffect(() => {
    if (!selectedShapeIds.length || !onNodeSelect) return;
    const nodeId = stripShapePrefix(selectedShapeIds[0]);
    // 只对 manjuNode 节点触发聚焦（忽略 arrow 等）。
    if (nodeId.startsWith('arrow-')) return;
    if (lastSelectedRef.current === nodeId) return;
    lastSelectedRef.current = nodeId;
    onNodeSelect(nodeId);
  }, [onNodeSelect, selectedShapeIds]);

  return null;
}

function CanvasInner() {
  const location = useLocation();
  const projectId = useStore((s) => s.projectId);
  const projectName = useStore((s) => s.projectName);
  const setProjectId = useStore((s) => s.setProjectId);
  const setProjectName = useStore((s) => s.setProjectName);
  const { data: projects, isError: projectsError } = useProjects({ pageSize: 10 });
  const { data: script } = useScript(projectId ?? undefined);
  const { data: shots, refetch: refetchShots } = useShots(projectId ?? undefined);
  const { data: characters } = useAssets({ type: 'character' });
  const demoCanvasMode = import.meta.env.DEV && isDemoCanvasProjectId(projectId);
  const updateScript = useUpdateScript(projectId ?? '');
  const updateProject = useUpdateProject();
  const currentProject = useMemo(
    () => projects?.data?.find((project) => project.id === projectId) ?? null,
    [projectId, projects?.data],
  );
  const hasVoice = useMemo(
    () => (shots?.length ?? 0) > 0 && (shots ?? []).every((shot) => !!shot.voice_id),
    [shots],
  );
  const hasVideo = currentProject?.status === 'done';
  // 阶段追踪器（稳定单例）——只追踪 stage/step 与创意设定，不生产对话文案。
  const [sm] = useState(() => new AgentStateMachine());
  const [agentState, setAgentState] = useState(sm.state);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // 会话一旦开始（用户说话、或从 showcase 带入灵感），init effect 就不再重置问候，
  // 否则会在数据延迟加载时冲掉正在进行的对话。
  const conversationStartedRef = useRef(false);
  const ideaKickedRef = useRef(false);
  // 标题只在第一句用户消息后生成一次。
  const titleGenStartedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [objectWorkbenchOpen, setObjectWorkbenchOpen] = useState(false);
  const [assistantAnchor, setAssistantAnchor] = useState<OverlayAnchor | null>(null);
  const [objectWorkbenchAnchor, setObjectWorkbenchAnchor] = useState<OverlayAnchor | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // 从聊天框拖拽/粘贴/选择的参考图：暂存待上传，打开上传弹窗。
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);
  // 防止同一制作动作并发触发（trigger 可能在连续两轮里重复出现）。
  const busyRef = useRef(false);
  // 剧本候选内容缓存：cardId → 大纲全文（点选卡片后据此保存所选方向）。
  const scriptCandidatesRef = useRef<Map<string, string>>(new Map());
  const syncState = useCallback(() => setAgentState({ ...sm.state }), [sm]);
  // Auto-select first project
  useEffect(() => {
    if (!projectId && projects?.data?.length) {
      const first = projects.data[0];
      setProjectId(first.id);
      setProjectName(first.name);
      return;
    }

    if (!projectId && import.meta.env.DEV && (projectsError || projects?.data?.length === 0)) {
      setProjectId(DEMO_CANVAS_PROJECT_ID);
      setProjectName(DEMO_CANVAS_PROJECT_NAME);
    }
  }, [projectId, projects, projectsError, setProjectId, setProjectName]);

  // 初始化：依据项目已有数据恢复阶段；首条问候交由 chat() 在 idea 阶段产生，
  // 这里只在「有产物」时落一条进度态恢复提示，空项目则发一条欢迎语 turn。
  useEffect(() => {
    if (!projectId) return;
    if (conversationStartedRef.current) return;
    conversationStartedRef.current = true;
    const hasScript = !!script?.content;
    const hasShots = (shots?.length ?? 0) > 0;
    sm.restore({ hasScript, hasShots, hasVoice, hasVideo });
    syncState();
    setMessages([
      makeAiMessage('嗨，我是你的创作搭档。想做个什么样的短片？随便聊聊就行——一句灵感、一个画面，都可以。', { stage: 'idea' }),
    ]);
  }, [projectId, script, shots, syncState, sm, hasVoice, hasVideo]);

  // ---- 制作动作：由对话 trigger 显式触发，不再由状态机 step 监听自动跑。 ----
  // 每个都自带忙碌守卫，跑完用 markReady 落进度态 + 一条结果消息。

  // 剧本：用累积的创意设定并行生成 3 个方向的候选，以「对话内卡片组」呈现，
  // 等用户点选某个方向（handleSelectCard）再保存进剧本、推进到分镜。
  const runScriptGen = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('script'); syncState();
    setMessages((m) => [...m, makeProgressMessage('正在构思 3 个剧本方向...', '生成剧本', 'script')]);
    try {
      const { type = '漫剧', style = '日系动漫', tone, duration = '1分钟', audience = '年轻人' } = sm.state.ideaContext;
      const base = `用${type}形式、${style}风格创作一个短剧大纲（约${duration}，受众${audience}${tone ? `，${tone}基调` : ''}）。直接给出分场景大纲。`;
      const dirs = [
        { emoji: '⚡', title: '强冲突反转', extra: '走强冲突、结尾反转路线。' },
        { emoji: '☀️', title: '轻松日常', extra: '走轻松幽默的日常喜剧路线。' },
        { emoji: '🌙', title: '细腻情感', extra: '走细腻情感、人物弧光路线。' },
      ];
      const outlines = await Promise.all(dirs.map((d) => genOutline(projectId, base + d.extra)));
      const cards = dirs.map((d, i) => ({
        id: `script-cand-${i}`,
        emoji: d.emoji,
        title: d.title,
        description: outlines[i] || '（生成为空）',
      }));
      // 缓存内容供点选时取用。
      scriptCandidatesRef.current = new Map(cards.map((c) => [c.id, c.description]));
      sm.markReady('script'); syncState();
      setMessages((m) => [...m, makeCardGroupMessage('给你三个方向，点一个我就照着展开成完整剧本：', cards, 'script')]);
    } catch {
      sm.markReady('idea'); syncState();
      setMessages((m) => [...m, makeErrorAction('生成剧本时出错了。', '重试生成', '点击重新生成剧本', 'idea')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState]);

  const runStoryboardGen = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('storyboard'); syncState();
    setMessages((m) => [...m, makeProgressMessage('🎨 正在生成分镜...', '生成分镜', 'storyboard')]);
    try {
      const style = sm.state.ideaContext.style ?? 'default';
      const res = await storyboardGenerate({ project_id: projectId, style, regenerate_all: true });
      const ok = await pollAiTask(res.task_id);
      if (!ok) throw new Error('storyboard task failed');
      await refetchShots();
      sm.markReady('storyboard'); syncState();
      setMessages((m) => [...m, makeMilestoneMessage('分镜已生成', 'storyboard'), makeAiMessage('每一镜都在画布右侧了，要改某一镜，或者直接去配音。', { stage: 'storyboard' })]);
    } catch {
      sm.markReady('script'); syncState();
      setMessages((m) => [...m, makeErrorAction('生成分镜时出错了。', '重试生成', '点击重新生成分镜', 'script')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState, refetchShots]);

  const runVoiceMatch = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('voice'); syncState();
    setMessages((m) => [...m, makeProgressMessage('🎙 正在为角色匹配配音...', '配音匹配', 'voice')]);
    try {
      const res = await voiceMatch({ project_id: projectId, content: script?.content ?? '', auto_assign: true });
      const n = res.matches?.length ?? 0;
      sm.markReady('voice'); syncState();
      setMessages((m) => [...m, makeMilestoneMessage(`配音完成 · ${n} 个角色`, 'voice'), makeAiMessage('想换某个角色的声音，还是直接出片？', { stage: 'voice' })]);
    } catch {
      sm.markReady('storyboard'); syncState();
      setMessages((m) => [...m, makeErrorAction('配音匹配失败。', '重试配音', '点击重新匹配', 'storyboard')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState, script]);

  const runRender = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('video'); syncState();
    setMessages((m) => [...m, makeProgressMessage('🎬 正在渲染视频...', '渲染中', 'video')]);
    try {
      const job = await createRender(
        { project_id: projectId, resolution: '1080p', format: 'mp4' },
        `render-${projectId}-${Date.now()}`,
      );
      const result = await pollRender(job.job_id, () => {
        setMessages((m) => [...m, makeAiMessage('比预期久一点，还在渲染中...', { stage: 'video' })]);
      });
      if (!result.ok) throw new Error('render failed');
      sm.markReady('video'); syncState();
      setMessages((m) => [...m, makeMilestoneMessage('视频已出片', 'video'), makeAiMessage('右上角可以预览或下载。想调哪段，点画布节点告诉我。', { stage: 'video' })]);
    } catch {
      sm.markReady('voice'); syncState();
      setMessages((m) => [...m, makeErrorAction('渲染遇到问题。', '重试渲染', '点击重新生成视频', 'voice')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState]);

  const aiRuntimeStatus = sm.state.stage === 'storyboard' && sm.state.step === 'generating'
    ? 'running'
    : 'idle';
  const derivedState = useMemo(
    () => deriveCanvasState({
      stage: sm.state.stage,
      script,
      shots,
      characters: demoCanvasMode ? demoCanvasCharacters : characters?.data,
      aiStatus: aiRuntimeStatus,
      hasVoice,
      hasVideo,
    }),
    [sm.state.stage, script, shots, characters?.data, aiRuntimeStatus, hasVoice, hasVideo, demoCanvasMode],
  );
  const graph = useMemo(
    () => buildCanvasGraph(
      script,
      shots,
      demoCanvasMode ? demoCanvasCharacters : characters?.data,
      projectName,
      aiRuntimeStatus,
      undefined,
      projectId,
      derivedState,
      { hasVoice, hasVideo },
    ),
    [script, shots, characters?.data, projectName, aiRuntimeStatus, projectId, derivedState, hasVoice, hasVideo, demoCanvasMode],
  );
  const {
    layoutedGraph,
    routedEdges,
    relayout,
    isLayouting,
  } = useCanvasAutoLayout(graph, projectId);

  // trigger 越权校验：只执行「当前 stage 允许的那一个 action」，非法忽略。
  const executeTrigger = useCallback((trigger: ChatTrigger | null) => {
    if (!trigger) return;
    const allowed = STAGE_ALLOWED_ACTION[sm.state.stage];
    if (trigger.action !== allowed) return; // 越权 / video 阶段 → 忽略
    switch (trigger.action) {
      case 'generate_script': void runScriptGen(); break;
      case 'generate_storyboard': void runStoryboardGen(); break;
      case 'match_voice': void runVoiceMatch(); break;
      case 'render_video': void runRender(); break;
    }
  }, [sm, runScriptGen, runStoryboardGen, runVoiceMatch, runRender]);

  // 统一的对话一轮：全程任意 stage 都走这条 chat() 路径。后端依 stage 给出
  // 自然回应 + 动态 options + 可能的 trigger；前端 merge 设定、落消息、校验 trigger。
  const runAgentTurn = useCallback(async (
    pendingUserText?: string,
    turnContext?: TurnContext,
  ) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const history = messagesRef.current
        .filter((m) => m.role === 'user' || m.role === 'ai')
        .map((m) => ({ role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.text }))
        .filter((t) => t.content.trim());
      // 刚发出的这轮还没进 messagesRef（ref 在渲染后才更新），显式补上保证历史完整。
      if (pendingUserText?.trim()) {
        history.push({ role: 'user', content: pendingUserText.trim() });
      }
      const nodeMap = new Map(layoutedGraph.nodes.map((node) => [node.id, node] as const));
      const selectedNodeForTurn = turnContext?.canvas_action?.target_id ?? selectedNodeId;
      const focusMemory = buildFocusMemory(selectedNodeForTurn ?? null, nodeMap);
      const canvasContextSummary = buildCanvasContextSummary({
        stage: sm.state.stage,
        nodeMap,
        selectedNodeId: selectedNodeForTurn ?? null,
        scriptExists: !!script?.content,
        shotsCount: shots?.length ?? 0,
        hasVoice,
        hasVideo,
        derivedState,
      });
      const res = await chat({
        project_id: projectId,
        stage: sm.state.stage,
        messages: history,
        context: {
          has_script: !!script?.content,
          has_shots: (shots?.length ?? 0) > 0,
          has_voice: hasVoice,
          has_video: hasVideo,
          idea: sm.state.ideaContext as Record<string, string>,
          conversation_memory: {
            idea: sm.state.ideaContext as Record<string, string>,
            stage: sm.state.stage,
            selected_node_id: selectedNodeForTurn ?? null,
          },
          canvas_context_summary: canvasContextSummary,
          focus_memory: focusMemory,
          turn_context: turnContext ?? {
            intent_source: pendingUserText?.trim() ? 'chat_input' : 'system_event',
            expects: pendingUserText?.trim() ? 'decision_support' : 'explanation',
          },
        },
      });
      sm.mergeIdeaContext(res.extracted);
      setMessages((m) => [...m, makeAiMessage(res.reply, { thinking: res.thinking, options: res.options, stage: sm.state.stage })]);
      executeTrigger(res.trigger);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : '网络出了点问题，请再试一次。';
      setMessages((m) => [...m, makeAiMessage(message, { stage: sm.state.stage })]);
    } finally {
      setLoading(false);
    }
  }, [projectId, script, shots, sm, executeTrigger, layoutedGraph.nodes, selectedNodeId, hasVoice, hasVideo, derivedState]);

  // 用户第一句话后，调 LLM 生成一个简短标题并存为项目名。只跑一次。
  // 若用户已经手动改过名字（非空且非默认占位），不覆盖。
  const maybeGenerateTitle = useCallback(async (firstUserText: string) => {
    if (titleGenStartedRef.current || !projectId) return;
    titleGenStartedRef.current = true;
    const current = (projectName || '').trim();
    const looksAuto = !current || current === '未命名项目' || current === '新建项目';
    if (!looksAuto) return;
    try {
      const { title } = await generateTitle({ message: firstUserText, project_id: projectId });
      const clean = title.trim();
      if (!clean) return;
      setProjectName(clean);
      await updateProject.mutateAsync({ id: projectId, input: { name: clean } });
    } catch {
      // 标题生成失败不影响主流程，静默忽略，保留原名。
    }
  }, [projectId, projectName, setProjectName, updateProject]);

  // 用户手动修改标题：乐观更新 store + 持久化到项目名。
  // 锁住 titleGenStartedRef，避免之后自动生成再覆盖用户手填的名字。
  const handleTitleChange = useCallback((next: string) => {
    const clean = next.trim();
    if (!clean || !projectId || clean === projectName) return;
    titleGenStartedRef.current = true;
    setProjectName(clean);
    void updateProject.mutateAsync({ id: projectId, input: { name: clean } });
  }, [projectId, projectName, setProjectName, updateProject]);

  // 从 showcase 带入的灵感：作为第一句用户消息喂给 agent，而非通用问候。只跑一次。
  useEffect(() => {
    const idea = (location.state as { idea?: string } | null)?.idea?.trim();
    if (!idea || ideaKickedRef.current || !projectId) return;
    if (sm.state.stage !== 'idea') return;
    ideaKickedRef.current = true;
    conversationStartedRef.current = true;
    // 清掉 nav state，刷新不再重放灵感。
    window.history.replaceState({}, '');
    queueMicrotask(() => {
      setMessages([makeUserMessage(idea)]);
      void maybeGenerateTitle(idea);
      void runAgentTurn(idea, {
        intent_source: 'chat_input',
        expects: 'decision_support',
      });
    });
  }, [location.state, projectId, sm, runAgentTurn, maybeGenerateTitle]);

  // 快捷回复点选 = 一次用户 turn，喂回统一对话。
  const handleSelectOption = useCallback((value: string) => {
    setMessages((m) => [...m, makeUserMessage(value)]);
    void runAgentTurn(value, {
      intent_source: 'chat_input',
      expects: 'decision_support',
    });
  }, [runAgentTurn]);

  // 点选剧本候选卡：取出该方向全文 → 保存进剧本 → 停在 script/ready，
  // 引导用户继续聊改或进分镜（进分镜由对话 trigger 触发）。
  const handleSelectCard = useCallback(async (cardId: string) => {
    if (!projectId || busyRef.current) return;
    const content = scriptCandidatesRef.current.get(cardId);
    if (!content) return;
    busyRef.current = true;
    setMessages((m) => [...m, makeUserMessage('就用这个方向')]);
    try {
      await updateScript.mutateAsync({ content, expected_version_no: script?.version_no ?? 0 });
      scriptCandidatesRef.current.clear();
      sm.markReady('script'); syncState();
      setMessages((m) => [...m, makeMilestoneMessage('剧本已定', 'script'), makeAiMessage('画布上能看到完整剧本了。想再调哪段，或者直接说"开始分镜"。', { stage: 'script' })]);
    } catch {
      setMessages((m) => [...m, makeErrorAction('保存剧本失败。', '重试保存', '点击重新保存所选方向', 'script')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState, updateScript, script]);

  // 自由输入：全程统一走 runAgentTurn（idea 阶段顺带生成标题）。
  const handleSendMessage = useCallback(async (text: string) => {
    setMessages((m) => [...m, makeUserMessage(text)]);
    if (sm.state.stage === 'idea') {
      void maybeGenerateTitle(text); // 首句话后顺带生成标题（幂等）
    }
    await runAgentTurn(text, {
      intent_source: 'chat_input',
      expects: 'decision_support',
    });
  }, [sm, runAgentTurn, maybeGenerateTitle]);

  // 动作消息（目前只剩「重试」类）：按当前 stage 重新触发对应制作。
  const handleAction = useCallback(() => {
    if (!projectId || busyRef.current) return;
    switch (sm.state.stage) {
      case 'idea':
      case 'script': void runScriptGen(); break;
      case 'storyboard': void runStoryboardGen(); break;
      case 'voice': void runVoiceMatch(); break;
      case 'video': void runRender(); break;
    }
  }, [projectId, sm, runScriptGen, runStoryboardGen, runVoiceMatch, runRender]);

  // 点选画布节点 = 直接进入对象工作台，并围绕该对象拉起一轮协作。
  const handleNodeClick = useCallback((nodeId: string) => {
    const node = layoutedGraph.nodes.find((item) => item.id === nodeId);
    const isSameNode = selectedNodeId === nodeId;
    setSelectedNodeId(nodeId);
    setAssistantOpen(false);
    setObjectWorkbenchOpen(true);
    if (!node) return;
    if (objectWorkbenchOpen && isSameNode) return;
    void runAgentTurn(undefined, turnContextForNode(node));
  }, [layoutedGraph.nodes, objectWorkbenchOpen, runAgentTurn, selectedNodeId]);

  // 聊天框拖拽/粘贴/选择参考图 → 暂存并打开上传弹窗（角色资产，自动落画布）。
  const handleAttachImage = useCallback((file: File) => {
    setPendingImage(file);
  }, []);

  const handleNewConversation = useCallback(() => {
    scriptCandidatesRef.current.clear();
    busyRef.current = false;
    setLoading(false);
    setSelectedNodeId(null);
    setObjectWorkbenchOpen(false);
    setAssistantOpen(true);
    setPendingImage(null);
    setAssetPanelOpen(false);

    const hasScript = !!script?.content;
    const hasShots = (shots?.length ?? 0) > 0;
    sm.restore({ hasScript, hasShots, hasVoice, hasVideo });
    syncState();

    const next = getConversationResetMessage({ hasScript, hasShots });
    setMessages([makeAiMessage(next.text, { stage: next.stage })]);
  }, [script, shots, sm, syncState, hasVoice, hasVideo]);

  // 参考图上传成功 → 资产已创建，再把它以 character_ref 关联到当前项目
  // （这样生成时后端能按 project 拉到它喂模型）。react-query 失效 ['assets']
  // 自动刷新角色节点落画布；关联失败不阻断，仅提示。
  const handleImageUploaded = useCallback((asset: AssetDTO) => {
    setPendingImage(null);
    if (projectId) {
      void linkProjectAsset(projectId, asset.id, 'character_ref')
        .then(() => setMessages((m) => [...m, makeSystemMessage(`🖼 参考图「${asset.name}」已加入，画布上能看到了`)]))
        .catch(() => setMessages((m) => [...m, makeSystemMessage(`🖼 参考图「${asset.name}」已上传，但关联到项目失败，生成时可能用不上`)]));
    } else {
      setMessages((m) => [...m, makeSystemMessage(`🖼 参考图「${asset.name}」已上传`)]);
    }
  }, [projectId]);

  // Pick an asset from the library → drop a note for it at the viewport center.
  const handleAssetPick = useCallback((assetId: string, name: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    editor.createShape({
      id: createShapeId(`asset-${assetId}-${Math.round(performance.now())}`),
      type: 'note',
      x: center.x - 100,
      y: center.y - 100,
      props: { text: name, size: 'm' },
    } as unknown as Parameters<typeof editor.createShape>[0]);
    setAssetPanelOpen(false);
  }, []);

  const suggestedPrompts = useMemo(() => {
    switch (agentState.stage) {
      case 'idea':
        return ['做一个 60 秒都市修仙漫剧', '我想要强冲突反转', '受众是 18-30 岁年轻人'];
      case 'script':
        return ['把第二个方向写得更热血', '前三秒要更抓人', '对白更短更利落'];
      case 'storyboard':
        return ['把第三镜改成特写', '整体风格偏电影感', '每个镜头时长再紧凑一点'];
      case 'voice':
        return ['主角声音更冷一点', '旁白更有压迫感', '配音节奏更快'];
      case 'video':
        return ['生成 1080p 视频', '节奏再快 10%', '给结尾加更强的停顿'];
      default:
        return ['继续创作'];
    }
  }, [agentState.stage]);
  const nodeMap = useMemo(
    () => new Map(layoutedGraph.nodes.map((node) => [node.id, node] as const)),
    [layoutedGraph.nodes],
  );
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : undefined;
  const hasWorkbenchOpen = assistantOpen || objectWorkbenchOpen;
  const focusLabel = selectedNode ? getNodeLabel(selectedNode) : null;
  const focusTypeLabel = selectedNode ? getNodeFocusTypeLabel(selectedNode) : null;
  const focusTask = selectedNode ? getNodeStageTask(selectedNode, agentState.stage) : null;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !selectedNodeId || !objectWorkbenchOpen) {
      setObjectWorkbenchAnchor(null);
      return;
    }

    let frame = 0;
    const updateAnchor = () => {
      const bounds = editor.getShapePageBounds(createShapeId(selectedNodeId));
      if (!bounds) {
        setObjectWorkbenchAnchor(null);
        return;
      }

      const topRight = editor.pageToScreen({ x: bounds.maxX, y: bounds.y });
      const topLeft = editor.pageToScreen({ x: bounds.x, y: bounds.y });
      const bottomLeft = editor.pageToScreen({ x: bounds.x, y: bounds.maxY });
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const nodeType = selectedNode?.type;
      const prefs = getObjectWorkbenchLayoutPrefs(nodeType, viewportWidth, viewportHeight);
      const { compact, width, maxHeight, horizontalGap, verticalPlacement } = prefs;
      const safeTop = 68;
      const safeBottom = 24;
      const safeLeft = 16;
      const safeRight = 16;

      let left = topRight.x + horizontalGap;
      const rightLimit = viewportWidth - width - safeRight;
      const leftCandidate = topLeft.x - width - horizontalGap;
      const canPlaceRight = left <= rightLimit;
      const canPlaceLeft = leftCandidate >= safeLeft;

      if (compact) {
        left = Math.max(safeLeft, Math.min(rightLimit, (viewportWidth - width) / 2));
      } else if (canPlaceRight) {
        left = Math.min(rightLimit, left);
      } else if (canPlaceLeft) {
        left = leftCandidate;
      } else {
        left = Math.max(safeLeft, Math.min(rightLimit, (viewportWidth - width) / 2));
      }

      const nodeMidY = (topRight.y + bottomLeft.y) / 2;
      const preferredTop = compact
        ? bottomLeft.y + 16
        : verticalPlacement === 'centered'
          ? nodeMidY - maxHeight / 2
          : verticalPlacement === 'below'
            ? bottomLeft.y + 14
            : topRight.y - 8;
      const top = Math.max(
        safeTop,
        Math.min(viewportHeight - maxHeight - safeBottom, preferredTop),
      );

      setObjectWorkbenchAnchor((current) => {
        if (
          current
          && Math.abs(current.left - left) < 0.5
          && Math.abs(current.top - top) < 0.5
          && Math.abs(current.width - width) < 0.5
          && Math.abs(current.maxHeight - maxHeight) < 0.5
          && current.compact === compact
        ) {
          return current;
        }
        return { left, top, width, maxHeight, compact };
      });
      frame = window.requestAnimationFrame(updateAnchor);
    };

    frame = window.requestAnimationFrame(updateAnchor);
    window.addEventListener('resize', updateAnchor);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateAnchor);
    };
  }, [selectedNodeId, selectedNode?.type, layoutedGraph.nodes, objectWorkbenchOpen]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !selectedNodeId || !assistantOpen) {
      setAssistantAnchor(null);
      return;
    }

    let frame = 0;
    const updateAnchor = () => {
      const bounds = editor.getShapePageBounds(createShapeId(selectedNodeId));
      if (!bounds) {
        setAssistantAnchor(null);
        return;
      }

      const topRight = editor.pageToScreen({ x: bounds.maxX, y: bounds.y });
      const topLeft = editor.pageToScreen({ x: bounds.x, y: bounds.y });
      const bottomLeft = editor.pageToScreen({ x: bounds.x, y: bounds.maxY });
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const compact = viewportWidth < 1220;
      const width = compact
        ? Math.min(viewportWidth - 24, 392)
        : Math.min(Math.max(320, Math.round(viewportWidth * 0.23)), 372);
      const maxHeight = Math.min(viewportHeight - 128, 620);
      const safeTop = 72;
      const safeBottom = 28;
      const safeLeft = 16;
      const safeRight = 16;
      const rightLimit = viewportWidth - width - safeRight;
      const leftCandidate = topLeft.x - width - 18;
      let left = leftCandidate >= safeLeft ? leftCandidate : topRight.x + 18;

      if (compact) {
        left = Math.max(safeLeft, Math.min(rightLimit, (viewportWidth - width) / 2));
      } else if (left > rightLimit) {
        left = Math.max(safeLeft, rightLimit);
      }

      const preferredTop = compact ? bottomLeft.y + 18 : topRight.y + 20;
      const top = Math.max(
        safeTop,
        Math.min(viewportHeight - maxHeight - safeBottom, preferredTop),
      );

      setAssistantAnchor((current) => {
        if (
          current
          && Math.abs(current.left - left) < 0.5
          && Math.abs(current.top - top) < 0.5
          && Math.abs(current.width - width) < 0.5
          && Math.abs(current.maxHeight - maxHeight) < 0.5
          && current.compact === compact
        ) {
          return current;
        }
        return { left, top, width, maxHeight, compact };
      });
      frame = window.requestAnimationFrame(updateAnchor);
    };

    frame = window.requestAnimationFrame(updateAnchor);
    window.addEventListener('resize', updateAnchor);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateAnchor);
    };
  }, [selectedNodeId, layoutedGraph.nodes, assistantOpen]);

  return (
    <div className="h-screen bg-background">
      <div className="relative h-full overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[320] px-4 pt-4">
          <div
            data-testid="canvas-title-strip"
            className={cn(
              'pointer-events-auto absolute left-1/2 top-4 flex max-w-[min(32rem,calc(100vw-9rem))] -translate-x-1/2 items-center gap-2 rounded-full border border-border/70 bg-background/62 px-3 py-1.5 shadow-[0_10px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl transition duration-200',
              hasWorkbenchOpen && 'invisible opacity-0 translate-y-[-6px] pointer-events-none',
            )}
          >
            <div className="truncate text-[13px] font-medium text-foreground">
              {projectName || '未命名项目'}
            </div>
            <span className="h-1 w-1 shrink-0 rounded-full bg-primary/70" />
            <span className="truncate text-[11px] font-medium text-muted-foreground">
              {STAGE_LABELS[agentState.stage]}
            </span>
          </div>

          <div
            data-testid="canvas-tools-chrome"
            className={cn(
              'pointer-events-auto ml-auto flex w-fit items-center gap-1.5 transition duration-200',
              hasWorkbenchOpen && 'invisible opacity-0 translate-y-[-6px] pointer-events-none',
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-[18px] border-border/80 bg-background/72 shadow-[0_14px_36px_rgba(15,23,42,0.18)] backdrop-blur-xl"
                  aria-label="画布工具"
                  data-testid="canvas-tools-trigger"
                  title="画布工具"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={10} className="w-44 rounded-2xl border-border/80 bg-background/92 p-1.5 backdrop-blur-xl">
                <DropdownMenuItem onClick={handleNewConversation} className="rounded-xl">
                  <MessageSquarePlus className="h-4 w-4" />
                  新对话
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAssetPanelOpen(true)} className="rounded-xl">
                  <FolderOpen className="h-4 w-4" />
                  资产库
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {!assistantOpen && !objectWorkbenchOpen && (
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    setObjectWorkbenchOpen(false);
                    setAssistantOpen(true);
                  }}
                  data-testid="canvas-assistant-entry"
                  className="group pointer-events-auto absolute bottom-24 left-3 z-[315] inline-flex h-9 w-9 items-center gap-1.5 overflow-hidden rounded-full border border-border/60 bg-background/52 px-2.5 text-[11px] font-medium text-foreground/68 shadow-[0_8px_20px_rgba(15,23,42,0.10)] backdrop-blur-lg transition-[width,background-color,color,box-shadow,border-color] duration-200 hover:w-[7.5rem] hover:border-border/80 hover:bg-background/74 hover:text-foreground focus-visible:w-[7.5rem] focus-visible:border-border/80 focus-visible:bg-background/74 focus-visible:text-foreground"
                  aria-label="主创协作"
                  title="主创协作"
                >
                  <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-primary/88" />
                  <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-20 group-hover:opacity-100 group-focus-visible:max-w-20 group-focus-visible:opacity-100">
                    {selectedNode ? '讨论' : '协作'}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {selectedNode ? '围绕当前焦点继续协作' : '继续主创协作'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <Tldraw hideUi shapeUtils={MANJU_SHAPE_UTILS} onMount={(editor) => { editorRef.current = editor; }}>
          <CanvasSync graph={layoutedGraph} projectId={projectId} onNodeSelect={handleNodeClick} />
          <CanvasEdgeBridgeOverlay graph={layoutedGraph} routedEdges={routedEdges} />
          <CanvasToolbar onAutoLayout={relayout} isLayouting={isLayouting} />
        </Tldraw>
        <AssetLibraryPanel
          open={assetPanelOpen}
          onClose={() => setAssetPanelOpen(false)}
          onPick={handleAssetPick}
        />
        <UploadDialog
          key={pendingImage ? `${pendingImage.name}-${pendingImage.size}` : 'none'}
          open={pendingImage !== null}
          onOpenChange={(next) => { if (!next) setPendingImage(null); }}
          assetType="character"
          accept="image/*"
          title="添加参考图（角色）"
          initialFile={pendingImage}
          onUploaded={handleImageUploaded}
        />
        {assistantOpen && !objectWorkbenchOpen && (
          <div
            className="absolute z-[340] overflow-hidden rounded-[28px] border border-border/40 bg-background/18 shadow-[0_18px_42px_rgba(15,23,42,0.16)] backdrop-blur-md"
            data-testid="canvas-assistant-surface"
            style={assistantAnchor
              ? {
                  left: assistantAnchor.left,
                  top: assistantAnchor.top,
                  width: assistantAnchor.width,
                  height: assistantAnchor.maxHeight,
                }
              : {
                  left: 16,
                  bottom: 80,
                  width: 'min(24rem, calc(100vw - 2rem))',
                  height: 'min(38rem, calc(100vh - 8rem))',
                }}
          >
            <button
              type="button"
              onClick={() => setAssistantOpen(false)}
              className="absolute right-3.5 top-3.5 z-[2] rounded-full bg-background/42 p-1.5 text-muted-foreground/72 backdrop-blur-sm transition hover:text-foreground"
              aria-label="收起主创协作"
              title="收起主创协作"
            >
              <X className="h-4 w-4" />
            </button>
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              onSelectOption={handleSelectOption}
              onSelectCard={handleSelectCard}
              onAction={handleAction}
              loading={loading}
              stage={STAGE_LABELS[agentState.stage]}
              suggestedPrompts={suggestedPrompts}
              title={projectName}
              onTitleChange={handleTitleChange}
              onAttachImage={handleAttachImage}
              focusLabel={focusLabel}
              focusTypeLabel={focusTypeLabel}
              focusTask={focusTask}
              headerMode="floating"
              className="shadow-[0_8px_20px_rgba(15,23,42,0.10)]"
            />
          </div>
        )}

        {objectWorkbenchOpen && selectedNode && (
          <CanvasInlineEditorOverlay
            node={selectedNode}
            projectId={projectId}
            anchor={objectWorkbenchAnchor}
            onClose={() => setObjectWorkbenchOpen(false)}
            messages={messages}
            onSendMessage={handleSendMessage}
            onSelectOption={handleSelectOption}
            onSelectCard={handleSelectCard}
            onAction={handleAction}
            loading={loading}
            stage={STAGE_LABELS[agentState.stage]}
            suggestedPrompts={suggestedPrompts}
            title={projectName}
            onTitleChange={handleTitleChange}
            onAttachImage={handleAttachImage}
            focusLabel={focusLabel}
            focusTypeLabel={focusTypeLabel}
            focusTask={focusTask}
          />
        )}

      </div>
    </div>
  );
}

export default function CanvasPage() {
  return <CanvasInner />;
}

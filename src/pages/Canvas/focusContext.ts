import type { Stage } from './agent/types';
import type { CanvasNode } from './buildGraph';
import type { DerivedCanvasState } from './canvasDerivedState';

export type FocusMemory = {
  selection_mode: 'single' | 'multi' | 'none';
  trigger_by: 'user_click' | 'user_text_input' | 'user_multi_select' | 'system_followup' | 'generation_complete';
  object?: {
    id: string;
    kind: string;
    label: string;
    stage: Stage;
  };
};

export type TurnContext = {
  intent_source: 'chat_input' | 'canvas_action' | 'system_event';
  canvas_action?: {
    type: 'select' | 'request_compare' | 'confirm' | 'generate';
    target_id?: string;
  };
  expects: 'explanation' | 'decision_support' | 'confirmation' | 'generation_instruction' | 'risk_review';
};

export type CanvasSummaryItem = {
  id: string;
  kind: string;
  label: string;
  status: string;
};

export type CanvasContextSummary = {
  project_stage: Stage;
  focus: { type: string; ids: string[]; label: string } | null;
  locked_objects: CanvasSummaryItem[];
  active_candidates: CanvasSummaryItem[];
  recent_changes: Array<{ type: string; target: string; label: string }>;
  pending_decisions: Array<{ id: string; kind: string; label: string }>;
  risk_flags: Array<{ id: string; kind: string; label: string }>;
  stage_summary: {
    scene_count: number;
    shot_count: number;
    character_count: number;
    has_output: boolean;
  };
};

export function getStageObjectKind(node?: CanvasNode | null): string {
  if (!node?.type) return 'unknown';
  switch (node.type) {
    case 'script': return 'script_scene';
    case 'storyboard': return 'storyboard_card';
    case 'character': return 'character_profile';
    case 'ai': return 'storyboard_hub';
    case 'video': return 'output_version';
    case 'decision': return 'decision_gate';
    case 'risk': return 'risk_flag';
    default: return node.type;
  }
}

function getStageFromIssueKind(kind?: unknown): Stage {
  switch (kind) {
    case 'generate_script': return 'idea';
    case 'generate_storyboard':
    case 'refresh_storyboard':
    case 'stale_dependency':
    case 'review_focus':
      return 'storyboard';
    case 'match_voice':
    case 'missing_voice':
      return 'voice';
    case 'render_video':
      return 'video';
    default:
      return 'storyboard';
  }
}

export function getStageFromNode(node?: CanvasNode | null): Stage {
  switch (node?.type) {
    case 'script': return 'script';
    case 'storyboard': return 'storyboard';
    case 'character':
    case 'ai': return 'storyboard';
    case 'video': return 'video';
    case 'decision':
    case 'risk':
      return getStageFromIssueKind(node.data?.kind);
    default: return 'idea';
  }
}

export function getNodeLabel(node?: CanvasNode | null): string {
  if (!node) return '未命名对象';
  const data = node.data ?? {};
  return String(data.title ?? data.name ?? node.id);
}

export function getNodeStatus(node?: CanvasNode | null): string {
  const raw = node?.data?.status;
  if (typeof raw === 'string' && raw.trim()) return raw;
  switch (node?.type) {
    case 'script': return 'ready';
    case 'storyboard': return 'ready';
    case 'character': return 'ready';
    case 'ai': return 'idle';
    case 'video': return 'waiting';
    case 'decision': return 'candidate';
    case 'risk': return 'warning';
    default: return 'draft';
  }
}

export function getNodeStageTask(node?: CanvasNode | null, stage: Stage): string {
  switch (node?.type) {
    case 'script':
      return '判断这一场剧本是否要继续展开、改写，还是直接进入分镜。';
    case 'storyboard':
      return '围绕这一镜做判断：节奏是否成立、是否要重做、是否能继续往下。';
    case 'character':
      return '确认角色设定、参考和一致性，再决定是否影响分镜或风格。';
    case 'ai':
      return '从整体视角判断当前剧本是否已经具备生成分镜的条件。';
    case 'video':
      return '评估当前成片链路是否完整，以及是否可以直接出片。';
    case 'decision':
      return '围绕这个待拍板事项做确认：为什么现在该决定、决定后会推进哪一段。';
    case 'risk':
      return '先判断这个风险是否真实成立、影响范围多大，以及现在该怎么处理。';
    default:
      switch (stage) {
        case 'idea': return '先把一个可继续展开的方向锁出来。';
        case 'script': return '围绕剧本结构做判断，而不是继续泛聊。';
        case 'storyboard': return '围绕当前镜头和视觉节奏做判断。';
        case 'voice': return '确认声音策略，再决定是否进入出片。';
        case 'video': return '围绕当前成片状态做最后判断和回看。';
        default: return '先选一个对象，再围绕它继续协作。';
      }
  }
}

export function getNodeFocusTypeLabel(node?: CanvasNode | null): string | null {
  switch (node?.type) {
    case 'script': return '剧本对象';
    case 'storyboard': return '分镜对象';
    case 'character': return '角色对象';
    case 'ai': return '整体决策';
    case 'video': return '成片对象';
    case 'decision': return '待拍板事项';
    case 'risk': return '风险对象';
    default: return null;
  }
}

export function buildFocusMemory(selectedNodeId: string | null, nodeMap: Map<string, CanvasNode>): FocusMemory {
  if (!selectedNodeId) {
    return { selection_mode: 'none', trigger_by: 'system_followup' };
  }
  const node = nodeMap.get(selectedNodeId);
  return {
    selection_mode: 'single',
    trigger_by: 'user_click',
    object: {
      id: selectedNodeId,
      kind: getStageObjectKind(node),
      label: getNodeLabel(node),
      stage: getStageFromNode(node),
    },
  };
}

export function buildCanvasContextSummary({
  stage,
  nodeMap,
  selectedNodeId,
  scriptExists,
  shotsCount,
  hasVoice,
  hasVideo,
  derivedState,
}: {
  stage: Stage;
  nodeMap: Map<string, CanvasNode>;
  selectedNodeId: string | null;
  scriptExists: boolean;
  shotsCount: number;
  hasVoice: boolean;
  hasVideo: boolean;
  derivedState?: DerivedCanvasState;
}): CanvasContextSummary {
  const nodes = [...nodeMap.values()];
  const focusNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
  const pendingDecisions: Array<{ id: string; kind: string; label: string }> = [];
  if (!scriptExists) pendingDecisions.push({ id: 'gate-script', kind: 'generate_script', label: '确定一个可继续展开的剧本方向' });
  else if (shotsCount === 0) pendingDecisions.push({ id: 'gate-storyboard', kind: 'generate_storyboard', label: '决定是否按当前剧本生成分镜' });
  else if (!hasVoice) pendingDecisions.push({ id: 'gate-voice', kind: 'match_voice', label: '确定整体声音策略并进入配音' });
  else if (!hasVideo) pendingDecisions.push({ id: 'gate-video', kind: 'render_video', label: '确认当前素材是否可以出片' });
  if (derivedState?.decisions?.length) {
    pendingDecisions.push(...derivedState.decisions.map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
    })));
  }

  const scriptNodes = nodes.filter((node) => node.type === 'script');
  const storyboardNodes = nodes.filter((node) => node.type === 'storyboard');
  const characterNodes = nodes.filter((node) => node.type === 'character');

  return {
    project_stage: stage,
    focus: focusNode ? {
      type: getStageObjectKind(focusNode),
      ids: [selectedNodeId],
      label: getNodeLabel(focusNode),
    } : null,
    locked_objects: [
      ...(scriptExists ? [{ id: 'script-current', kind: 'script_version', label: '当前剧本版本', status: 'locked' }] : []),
      ...(shotsCount > 0 ? [{ id: 'shots-current', kind: 'storyboard_group', label: `当前分镜 ${shotsCount} 镜`, status: 'ready' }] : []),
      ...(hasVoice ? [{ id: 'voice-current', kind: 'voice_strategy', label: '当前声音策略', status: 'ready' }] : []),
      ...(hasVideo ? [{ id: 'video-current', kind: 'output_version', label: '当前出片版本', status: 'ready' }] : []),
    ],
    active_candidates: nodes
      .filter((node) => ['script', 'storyboard', 'character'].includes(node.type ?? ''))
      .slice(0, 6)
      .map((node) => ({
        id: node.id,
        kind: getStageObjectKind(node),
        label: getNodeLabel(node),
        status: node.id === selectedNodeId ? 'selected' : getNodeStatus(node),
      })),
    recent_changes: focusNode ? [{
      type: 'focus',
      target: focusNode.id,
      label: getNodeLabel(focusNode),
    }] : [],
    pending_decisions: pendingDecisions,
    risk_flags: [
      ...((derivedState?.risks ?? []).map((risk) => ({ id: risk.id, kind: risk.kind, label: risk.label }))),
      ...(stageboardNeedsReview(storyboardNodes, focusNode)
        ? [{ id: 'risk-storyboard-review', kind: 'review_focus', label: '当前焦点分镜仍需要确认节奏和镜头表达' }]
        : []),
    ],
    stage_summary: {
      scene_count: scriptNodes.length,
      shot_count: storyboardNodes.length,
      character_count: characterNodes.length,
      has_output: hasVideo,
    },
  };
}

function stageboardNeedsReview(storyboardNodes: CanvasNode[], focusNode?: CanvasNode | null) {
  if (!focusNode || focusNode.type !== 'storyboard') return false;
  return storyboardNodes.length > 0;
}

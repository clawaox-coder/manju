import type { ScriptDTO, ShotDTO } from '@/lib/api/scripts';
import type { AssetDTO } from '@/lib/api/assets';
import { loadCanvasPositions } from './persistence';
import { splitScenes } from './sceneSplit';
import type { DerivedCanvasState } from './canvasDerivedState';

export interface CanvasNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  // canvas-node-edit-layout:用户手动缩放后的尺寸(从 persistence 复原)。
  // 未设则由 CanvasSync 用 MANJU_NODE_SIZE[type] 默认值兜底。
  size?: { w: number; h: number };
  data?: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  animated?: boolean;
  style?: Record<string, string | number>;
  markerEnd?: { type: string };
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function summarizeTargets(targetIds: string[]) {
  if (targetIds.length <= 1) return '关联 1 个对象';
  return `关联 ${targetIds.length} 个对象`;
}

function formatShotTitle(shot: ShotDTO, index: number) {
  const ordinal = `Shot ${String(index + 1).padStart(2, '0')}`;
  const existing = shot.title?.trim();
  if (!existing) return `${ordinal} · 镜头 ${index + 1}`;
  if (existing === ordinal || existing.startsWith(`${ordinal} ·`)) return existing;
  return `${ordinal} · ${existing}`;
}

export function buildCanvasGraph(
  script: ScriptDTO | undefined,
  shots: ShotDTO[] | undefined,
  characters: AssetDTO[] | undefined,
  projectName: string,
  aiStatus: 'idle' | 'running' | 'done' | 'error' = 'idle',
  onRunAi?: () => void,
  projectId?: string | null,
  derivedState?: DerivedCanvasState,
  workflowState?: {
    hasVoice?: boolean;
    hasVideo?: boolean;
  },
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  const scenes = script ? splitScenes(script.content) : [];
  const shotList = shots ?? [];
  const charList = (characters ?? []).slice(0, 6);
  const hasVoice = workflowState?.hasVoice ?? (shotList.length > 0 && shotList.every((shot) => !!shot.voice_id));
  const hasVideo = workflowState?.hasVideo ?? false;

  const savedPositions = projectId ? loadCanvasPositions(projectId) : null;
  // 把 saved 的 {x,y,w?,h?} 投到 CanvasNode 的 position + 可选 size。
  // 用户已 saved 的位置/尺寸优先于默认布局/默认尺寸。
  const sized = (id: string, fallback: { x: number; y: number }): Pick<CanvasNode, 'position' | 'size'> => {
    const s = savedPositions?.get(id);
    return {
      position: s ? { x: s.x, y: s.y } : fallback,
      size: s && s.w !== undefined && s.h !== undefined ? { w: s.w, h: s.h } : undefined,
    };
  };

  // --- Script scene nodes (left column) ---
  scenes.forEach((scene, i) => {
    const id = `script-${i}`;
    nodes.push({
      id,
      type: 'script',
      ...sized(id, { x: 0, y: i * 200 }),
      data: {
        sceneNumber: i + 1,
        title: `Script ${String(i + 1).padStart(2, '0')} · ${scene.title}`,
        content: scene.content.slice(0, 120),
        status: derivedState?.sceneStatus[id] ?? (script ? 'ready' : 'draft'),
      },
    });
  });

  // --- AI generation node (center) — only once there's a script to feed it,
  // otherwise it floats alone over the empty-state and looks broken ---
  if (scenes.length > 0 || shotList.length > 0) {
    const aiY = Math.max(0, (scenes.length * 200 - 200) / 2);
    nodes.push({
      id: 'ai-gen',
      type: 'ai',
      ...sized('ai-gen', { x: 380, y: aiY }),
      data: {
        title: 'Agent Core · Storyboard Director',
        label: 'AI 分镜生成',
        type: 'generate',
        status: derivedState?.aiStatus ?? aiStatus,
        model: 'Sonnet 4.6',
        onRun: onRunAi,
      },
    });
  }

  // --- Character nodes (top-center) ---
  charList.forEach((char, i) => {
    const id = `char-${char.id}`;
    nodes.push({
      id,
      type: 'character',
      ...sized(id, { x: 350 + (i % 2) * 180, y: -160 + Math.floor(i / 2) * 200 }),
      data: {
        title: `Character · ${char.name}`,
        name: char.name,
        description: char.description || '',
        avatar: char.thumbnail_url || char.avatar || char.file_url,
        tags: char.tags,
        status: derivedState?.characterStatus[id] ?? (char.thumbnail_url || char.avatar || char.file_url ? 'ready' : 'warning'),
      },
    });
    edges.push({
      id: `e-char-${char.id}-ai`,
      source: `char-${char.id}`,
      target: 'ai-gen',
      style: { stroke: '#ec4899', strokeDasharray: '4 2' },
    });
  });

  // --- Storyboard shot nodes (right column) ---
  shotList.forEach((shot, i) => {
    const id = `shot-${shot.id}`;
    nodes.push({
      id,
      type: 'storyboard',
      ...sized(id, { x: 650, y: i * 230 }),
      data: {
        shotNumber: i + 1,
        title: formatShotTitle(shot, i),
        dialog: shot.dialog || '',
        style: (shot.metadata?.style as string) || '日系动漫',
        imageUrl: shot.image_url,
        status: derivedState?.shotStatus[id] ?? 'ready',
      },
    });
    edges.push({
      id: `e-ai-shot-${shot.id}`,
      source: 'ai-gen',
      target: `shot-${shot.id}`,
      style: { stroke: '#f59e0b' },
      markerEnd: { type: 'arrowclosed' },
    });
  });

  // --- Script → AI edges ---
  scenes.forEach((_, i) => {
    edges.push({
      id: `e-script-${i}-ai`,
      source: `script-${i}`,
      target: 'ai-gen',
      animated: true,
      style: { stroke: '#a855f7' },
    });
  });

  // --- Video output node ---
  if (shotList.length > 0) {
    const totalMs = shotList.reduce((sum, s) => sum + (s.duration_ms || 0), 0);
    const videoY = Math.max(0, (shotList.length * 230 - 230) / 2);
    nodes.push({
      id: 'video-out',
      type: 'video',
      ...sized('video-out', { x: 950, y: videoY }),
      data: {
        title: `Video Master · ${projectName || '视频输出'}`,
        duration: formatDuration(totalMs),
        status: derivedState?.videoStatus ?? 'waiting',
      },
    });
    shotList.forEach((shot) => {
      edges.push({
        id: `e-shot-${shot.id}-vid`,
        source: `shot-${shot.id}`,
        sourceHandle: 'video',
        target: 'video-out',
        targetHandle: 'shots',
        style: { stroke: '#22c55e' },
      });
    });
  }

  const coordinationNodeIds = new Set<string>([
    ...(derivedState?.decisions ?? []).map((item) => item.id),
    ...(derivedState?.risks ?? []).map((item) => item.id),
  ]);
  const genericDecisions: Array<{ id: string; kind: string; label: string; targetIds: string[] }> = [];
  if (!script && !coordinationNodeIds.has('gate-script')) {
    genericDecisions.push({
      id: 'gate-script',
      kind: 'generate_script',
      label: '确定一个可继续展开的剧本方向',
      targetIds: [],
    });
  }
  if (script && shotList.length === 0 && !coordinationNodeIds.has('gate-storyboard')) {
    genericDecisions.push({
      id: 'gate-storyboard',
      kind: 'generate_storyboard',
      label: '决定是否按当前剧本生成分镜',
      targetIds: scenes.map((_, index) => `script-${index}`),
    });
  }
  if (shotList.length > 0 && !hasVoice && !coordinationNodeIds.has('gate-voice') && !coordinationNodeIds.has('decision-confirm-voice')) {
    genericDecisions.push({
      id: 'gate-voice',
      kind: 'match_voice',
      label: '确定整体声音策略并进入配音',
      targetIds: shotList.map((shot) => `shot-${shot.id}`),
    });
  }
  if (shotList.length > 0 && hasVoice && !hasVideo && !coordinationNodeIds.has('gate-video')) {
    genericDecisions.push({
      id: 'gate-video',
      kind: 'render_video',
      label: '确认当前素材是否可以直接出片',
      targetIds: ['video-out'],
    });
  }

  genericDecisions.forEach((decision, index) => {
    nodes.push({
      id: decision.id,
      type: 'decision',
      ...sized(decision.id, {
        x: scenes.length === 0 ? 360 : 640,
        y: shotList.length === 0 ? 120 + index * 128 : shotList.length * 230 + 110 + index * 128,
      }),
      data: {
        title: decision.label,
        badge: decision.targetIds.length > 0 ? summarizeTargets(decision.targetIds) : '主线推进',
        content: '这是当前主线上的关键拍板点，确认后才能继续推进下一段制作。',
        status: 'candidate',
        kind: decision.kind,
        targetIds: decision.targetIds,
      },
    });
  });

  const existingNodeIds = new Set(nodes.map((node) => node.id));
  const visibleTargets = (targetIds: string[]) => targetIds.filter((targetId) => existingNodeIds.has(targetId)).slice(0, 3);

  genericDecisions.forEach((decision) => {
    const targets = visibleTargets(decision.targetIds);
    const fallbackTarget = decision.kind === 'generate_storyboard'
      ? 'ai-gen'
      : decision.kind === 'match_voice'
        ? 'video-out'
        : 'ai-gen';
    const edgeTargets = targets.length > 0
      ? targets
      : (existingNodeIds.has(fallbackTarget) ? [fallbackTarget] : []);
    edgeTargets.forEach((targetId, edgeIndex) => {
      edges.push({
        id: `e-${decision.id}-${targetId}-${edgeIndex}`,
        source: decision.id,
        target: targetId,
        style: { stroke: '#6366f1', strokeDasharray: '6 3' },
      });
    });
  });

  (derivedState?.decisions ?? []).forEach((decision, index) => {
    const id = decision.id;
    const targets = visibleTargets(decision.targetIds);
    nodes.push({
      id,
      type: 'decision',
      ...sized(id, { x: 640, y: shotList.length * 230 + 110 + index * 128 }),
      data: {
        title: decision.label,
        badge: summarizeTargets(decision.targetIds),
        content: '选择后会围绕这个对象进入拍板工作态。',
        status: 'candidate',
        kind: decision.kind,
        targetIds: decision.targetIds,
      },
    });
    const fallbackTarget = decision.kind === 'render_video' ? 'video-out' : 'ai-gen';
    const edgeTargets = targets.length > 0
      ? targets
      : (existingNodeIds.has(fallbackTarget) ? [fallbackTarget] : []);
    edgeTargets.forEach((targetId, edgeIndex) => {
      edges.push({
        id: `e-${id}-${targetId}-${edgeIndex}`,
        source: id,
        target: targetId,
        style: { stroke: '#6366f1', strokeDasharray: '6 3' },
      });
    });
  });

  (derivedState?.risks ?? []).forEach((risk, index) => {
    const id = risk.id;
    const targets = visibleTargets(risk.targetIds);
    nodes.push({
      id,
      type: 'risk',
      ...sized(id, { x: 360, y: shotList.length * 230 + 110 + index * 128 }),
      data: {
        title: risk.label,
        badge: summarizeTargets(risk.targetIds),
        content: '选择后会围绕这个对象进入风险评估工作态。',
        status: risk.kind === 'stale_dependency' ? 'stale' : 'warning',
        kind: risk.kind,
        targetIds: risk.targetIds,
      },
    });
    const fallbackTarget = existingNodeIds.has('ai-gen')
      ? 'ai-gen'
      : existingNodeIds.has('video-out')
        ? 'video-out'
        : null;
    const edgeTargets = targets.length > 0
      ? targets
      : (fallbackTarget ? [fallbackTarget] : []);
    edgeTargets.forEach((targetId, edgeIndex) => {
      edges.push({
        id: `e-${id}-${targetId}-${edgeIndex}`,
        source: id,
        target: targetId,
        style: { stroke: '#f43f5e', strokeDasharray: '4 4' },
      });
    });
  });

  return { nodes, edges };
}

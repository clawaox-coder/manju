import { describe, expect, it } from 'vitest';
import {
  buildCanvasContextSummary,
  buildFocusMemory,
  getNodeFocusTypeLabel,
  getNodeStageTask,
  getNodeStatus,
  type CanvasContextSummary,
} from '@/pages/Canvas/focusContext';
import type { CanvasNode } from '@/pages/Canvas/buildGraph';
import type { Stage } from '@/pages/Canvas/agent/types';
import type { DerivedCanvasState } from '@/pages/Canvas/canvasDerivedState';

function node(overrides: Partial<CanvasNode> & Pick<CanvasNode, 'id'>): CanvasNode {
  return {
    id: overrides.id,
    type: overrides.type,
    position: overrides.position ?? { x: 0, y: 0 },
    data: overrides.data ?? {},
    size: overrides.size,
  };
}

function summary(input: {
  stage?: Stage;
  nodes?: CanvasNode[];
  selectedNodeId?: string | null;
  scriptExists?: boolean;
  shotsCount?: number;
  hasVoice?: boolean;
  hasVideo?: boolean;
  derivedState?: DerivedCanvasState;
}): CanvasContextSummary {
  const {
    stage = 'storyboard',
    nodes = [],
    selectedNodeId = null,
    scriptExists = false,
    shotsCount = 0,
    hasVoice = false,
    hasVideo = false,
    derivedState,
  } = input;
  return buildCanvasContextSummary({
    stage,
    nodeMap: new Map(nodes.map((item) => [item.id, item] as const)),
    selectedNodeId,
    scriptExists,
    shotsCount,
    hasVoice,
    hasVideo,
    derivedState,
  });
}

describe('focusContext helpers', () => {
  it('buildFocusMemory records current object focus', () => {
    const shot = node({
      id: 'shot-1',
      type: 'storyboard',
      data: { title: 'Shot 01 · 开场' },
    });

    const result = buildFocusMemory('shot-1', new Map([[shot.id, shot]]));
    expect(result).toEqual({
      selection_mode: 'single',
      trigger_by: 'user_click',
      object: {
        id: 'shot-1',
        kind: 'storyboard_card',
        label: 'Shot 01 · 开场',
        stage: 'storyboard',
      },
    });
  });

  it('buildCanvasContextSummary exposes locked facts, candidates and risk flags', () => {
    const nodes = [
      node({ id: 'script-0', type: 'script', data: { title: 'Script 01' } }),
      node({ id: 'shot-a', type: 'storyboard', data: { title: 'Shot A' } }),
      node({ id: 'char-a', type: 'character', data: { name: '陈迁' } }),
    ];

    const result = summary({
      stage: 'storyboard',
      nodes,
      selectedNodeId: 'shot-a',
      scriptExists: true,
      shotsCount: 1,
      hasVoice: false,
      hasVideo: false,
      derivedState: {
        sceneStatus: {},
        shotStatus: {},
        characterStatus: {},
        aiStatus: 'ready',
        videoStatus: 'warning',
        risks: [
          { id: 'risk-voice-gap', kind: 'missing_voice', label: '分镜已生成，但声音策略尚未确认', targetIds: ['shot-a'] },
        ],
        decisions: [
          { id: 'decision-confirm-voice', kind: 'match_voice', label: '确定整体声音策略并进入配音', targetIds: ['shot-a'] },
        ],
      },
    });

    expect(result.focus).toEqual({
      type: 'storyboard_card',
      ids: ['shot-a'],
      label: 'Shot A',
    });
    expect(result.locked_objects).toEqual([
      { id: 'script-current', kind: 'script_version', label: '当前剧本版本', status: 'locked' },
      { id: 'shots-current', kind: 'storyboard_group', label: '当前分镜 1 镜', status: 'ready' },
    ]);
    expect(result.active_candidates.map((item) => item.id)).toEqual(['script-0', 'shot-a', 'char-a']);
    expect(result.active_candidates.find((item) => item.id === 'shot-a')?.status).toBe('selected');
    expect(result.pending_decisions).toEqual([
      { id: 'gate-voice', kind: 'match_voice', label: '确定整体声音策略并进入配音' },
      { id: 'decision-confirm-voice', kind: 'match_voice', label: '确定整体声音策略并进入配音' },
    ]);
    expect(result.risk_flags.map((item) => item.id)).toEqual(['risk-voice-gap', 'risk-storyboard-review']);
    expect(result.stage_summary).toEqual({
      scene_count: 1,
      shot_count: 1,
      character_count: 1,
      has_output: false,
    });
  });

  it('returns node type labels, stage tasks and fallback statuses for inspector surfaces', () => {
    const script = node({ id: 'script-1', type: 'script', data: { title: 'Script 01' } });
    const aiHub = node({ id: 'ai-gen', type: 'ai', data: { title: 'AI 分镜生成' } });
    const decision = node({ id: 'decision-confirm-voice', type: 'decision', data: { title: '确定整体声音策略并进入配音', kind: 'match_voice' } });
    const risk = node({ id: 'risk-voice-gap', type: 'risk', data: { title: '分镜已生成，但声音策略尚未确认', kind: 'missing_voice' } });

    expect(getNodeFocusTypeLabel(script)).toBe('剧本对象');
    expect(getNodeFocusTypeLabel(aiHub)).toBe('整体决策');
    expect(getNodeFocusTypeLabel(decision)).toBe('待拍板事项');
    expect(getNodeFocusTypeLabel(risk)).toBe('风险对象');
    expect(getNodeStageTask(script, 'script')).toContain('剧本');
    expect(getNodeStageTask(aiHub, 'storyboard')).toContain('生成分镜');
    expect(getNodeStageTask(decision, 'voice')).toContain('拍板');
    expect(getNodeStageTask(risk, 'voice')).toContain('风险');
    expect(getNodeStatus(script)).toBe('ready');
    expect(getNodeStatus(aiHub)).toBe('idle');
    expect(getNodeStatus(decision)).toBe('candidate');
    expect(getNodeStatus(risk)).toBe('warning');
  });
});

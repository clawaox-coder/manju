import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CanvasInspectorRail } from '@/pages/Canvas/CanvasInspectorRail';
import type { CanvasNode } from '@/pages/Canvas/buildGraph';
import type { CanvasContextSummary } from '@/pages/Canvas/focusContext';

vi.mock('@/pages/Canvas/CanvasObjectWorkbench', () => ({
  getCanvasObjectTitle: (node?: CanvasNode) => node?.id ?? '当前对象',
  CanvasObjectWorkbench: () => <div>mocked-object-workbench</div>,
}));

function makeSummary(overrides: Partial<CanvasContextSummary> = {}): CanvasContextSummary {
  return {
    project_stage: 'storyboard',
    focus: null,
    locked_objects: [],
    active_candidates: [],
    recent_changes: [],
    pending_decisions: [],
    risk_flags: [],
    stage_summary: {
      scene_count: 2,
      shot_count: 3,
      character_count: 1,
      has_output: false,
    },
    ...overrides,
  };
}

function makeNode(overrides: Partial<CanvasNode> & Pick<CanvasNode, 'id' | 'type'>): CanvasNode {
  return {
    id: overrides.id,
    type: overrides.type,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  };
}

describe('CanvasInspectorRail', () => {
  it('renders coordination CTA for decision nodes', () => {
    const onRequestNodeConversation = vi.fn();
    const onRunCoordinationAction = vi.fn();
    const node = makeNode({
      id: 'decision-confirm-voice',
      type: 'decision',
      data: {
        title: '确定整体声音策略并进入配音',
        status: 'candidate',
        kind: 'match_voice',
        targetIds: ['shot-a', 'shot-b'],
      },
    });

    render(
      <CanvasInspectorRail
        selectedNodeId={node.id}
        projectId="p1"
        node={node}
        summary={makeSummary()}
        stage="voice"
        onClearSelection={() => {}}
        onRequestNodeConversation={onRequestNodeConversation}
        onRunCoordinationAction={onRunCoordinationAction}
      />,
    );

    expect(screen.getByText('这不是素材对象，而是挂在画布上的协作事项。你可以围绕它继续判断，再决定要不要推进后续动作。')).toBeInTheDocument();
    expect(screen.getByText('影响对象：2 个')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '帮我拍板这个决定' }));
    expect(onRequestNodeConversation).toHaveBeenCalledWith(node);
    fireEvent.click(screen.getByRole('button', { name: '进入配音' }));
    expect(onRunCoordinationAction).toHaveBeenCalledWith(node);
  });

  it('falls back to node inspector content for normal content nodes', () => {
    render(
      <CanvasInspectorRail
        selectedNodeId="shot-a"
        projectId="p1"
        node={makeNode({ id: 'shot-a', type: 'storyboard', data: { title: 'Shot A', status: 'ready' } })}
        summary={makeSummary()}
        stage="storyboard"
        onClearSelection={() => {}}
        onRequestNodeConversation={() => {}}
        onRunCoordinationAction={() => {}}
      />,
    );

    expect(screen.getByText('mocked-object-workbench')).toBeInTheDocument();
  });
});

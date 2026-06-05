import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CanvasObjectWorkbench, getCanvasObjectTitle } from '@/pages/Canvas/CanvasObjectWorkbench';
import type { CanvasNode } from '@/pages/Canvas/buildGraph';

vi.mock('@/pages/Canvas/workbench/editors/ScriptSceneEditor', () => ({
  ScriptSceneEditor: ({ sceneIndex }: { sceneIndex: number }) => <div>script-scene-{sceneIndex}</div>,
}));
vi.mock('@/pages/Canvas/workbench/editors/StoryboardCardEditor', () => ({
  StoryboardCardEditor: ({ shotId }: { shotId: string }) => <div>shot-{shotId}</div>,
}));
vi.mock('@/pages/Canvas/workbench/editors/CharacterProfileEditor', () => ({
  CharacterProfileEditor: ({ assetId }: { assetId: string }) => <div>character-{assetId}</div>,
}));
vi.mock('@/pages/Canvas/workbench/editors/StoryboardHubEditor', () => ({
  StoryboardHubEditor: () => <div>ai-variant</div>,
}));
vi.mock('@/pages/Canvas/workbench/editors/OutputVersionEditor', () => ({
  OutputVersionEditor: () => <div>video-variant</div>,
}));

function makeNode(overrides: Partial<CanvasNode> & Pick<CanvasNode, 'id' | 'type'>): CanvasNode {
  return {
    id: overrides.id,
    type: overrides.type,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  };
}

describe('CanvasObjectWorkbench', () => {
  it('routes storyboard nodes into the shot workbench path', () => {
    render(
      <CanvasObjectWorkbench
        node={makeNode({ id: 'shot-abc', type: 'storyboard', data: { title: 'Shot A', style: '电影感', dialog: '你好', status: 'ready' } })}
        projectId="p1"
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('当前对象')).toBeInTheDocument();
    expect(screen.getByText('这是一个分镜对象，适合围绕镜头表达、对白节奏和画面一致性做局部决策。')).toBeInTheDocument();
    expect(screen.getByText('电影感')).toBeInTheDocument();
    expect(screen.getByText('你好')).toBeInTheDocument();
    expect(screen.getByText('下一步')).toBeInTheDocument();
    expect(screen.getByText('shot-abc')).toBeInTheDocument();
  });

  it('routes character nodes into the character workbench path', () => {
    render(
      <CanvasObjectWorkbench
        node={makeNode({ id: 'char-001', type: 'character', data: { name: '林夏', description: '外冷内热', status: 'warning' } })}
        projectId="p1"
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('林夏')).toBeInTheDocument();
    expect(screen.getByText('外冷内热')).toBeInTheDocument();
    expect(screen.getByText('character-001')).toBeInTheDocument();
  });

  it('returns canvas-first titles for object types', () => {
    expect(getCanvasObjectTitle(makeNode({ id: 'script-0', type: 'script' }))).toBe('剧本 · 场 1');
    expect(getCanvasObjectTitle(makeNode({ id: 'decision-confirm-voice', type: 'decision' }))).toBe('待拍板事项');
  });

  it('keeps decision objects actionable even when no project is bound yet', () => {
    render(
      <CanvasObjectWorkbench
        node={makeNode({ id: 'decision-confirm-voice', type: 'decision', data: { title: '确定剧本方向' } })}
        projectId={null}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('这个对象主要用于拍板推进，先围绕它判断，再决定下一步动作。')).toBeInTheDocument();
  });
});

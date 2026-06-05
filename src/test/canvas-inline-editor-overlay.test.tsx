import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CanvasInlineEditorOverlay } from '@/pages/Canvas/CanvasInlineEditorOverlay';
import type { CanvasNode } from '@/pages/Canvas/buildGraph';
import type { ChatMessage } from '@/pages/Canvas/agent/types';
import { DEMO_CANVAS_PROJECT_ID } from '@/pages/Canvas/demoCanvasData';
import { renderWithProviders, waitFor } from './utils';

const noop = vi.fn();

function makeNode(overrides: Partial<CanvasNode> & Pick<CanvasNode, 'id' | 'type'>): CanvasNode {
  return {
    id: overrides.id,
    type: overrides.type,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    role: 'ai',
    type: 'text',
    text: '先围绕这个对象继续判断。',
    timestamp: 1,
    ...overrides,
  };
}

describe('CanvasInlineEditorOverlay', () => {
  it('keeps decision objects actionable in the main workbench path even without a bound project', () => {
    render(
      <CanvasInlineEditorOverlay
        node={makeNode({
          id: 'decision-confirm-script',
          type: 'decision',
          data: { title: '确定一个可继续展开的剧本方向', kind: 'generate_script', badge: '主线推进' },
        })}
        projectId={null}
        onClose={noop}
        messages={[message()]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="找方向"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusLabel="待拍板事项 · 确定一个可继续展开的剧本方向"
        focusTypeLabel="待拍板事项"
        focusTask="围绕这个待拍板事项做确认：为什么现在该决定、决定后会推进哪一段。"
      />,
    );

    expect(screen.getByText('这个对象主要用于拍板推进，先围绕它判断，再决定下一步动作。')).toBeInTheDocument();
    expect(screen.queryByText('未选择项目，暂时无法编辑这个对象。')).not.toBeInTheDocument();
  });

  it('uses the specific decision title as the main heading instead of repeating the generic object label', () => {
    render(
      <CanvasInlineEditorOverlay
        node={makeNode({
          id: 'gate-script',
          type: 'decision',
          data: { title: '确定一个可继续展开的剧本方向', kind: 'generate_script', badge: '主线推进' },
        })}
        projectId={null}
        onClose={noop}
        messages={[message()]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="找方向"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusLabel="待拍板事项 · 确定一个可继续展开的剧本方向"
        focusTypeLabel="待拍板事项"
        focusTask="围绕这个待拍板事项做确认：为什么现在该决定、决定后会推进哪一段。"
      />,
    );

    expect(screen.getByRole('heading', { name: '确定一个可继续展开的剧本方向' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '待拍板事项' })).not.toBeInTheDocument();
    expect(screen.getByText('待拍板事项')).toBeInTheDocument();
  });

  it('lets demo script objects open straight into the object preview instead of stacking an extra summary block first', async () => {
    renderWithProviders(
      <CanvasInlineEditorOverlay
        node={makeNode({
          id: 'script-0',
          type: 'script',
          data: {
            title: 'Script 01 · 开场 · 屋顶误入',
            sceneNumber: 1,
            content: '夜雨压城。实习生周临躲雨时误闯天台旧货亭。',
            status: 'ready',
          },
        })}
        projectId={DEMO_CANVAS_PROJECT_ID}
        onClose={noop}
        messages={[message()]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusLabel="剧本卡 · 开场 · 屋顶误入"
        focusTypeLabel="剧本卡"
        focusTask="围绕这一场继续判断哪里该重写。"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('开场 · 屋顶误入')).toBeInTheDocument();
    });
    const editorRegion = screen.getByTestId('canvas-object-studio-editor');
    const surface = screen.getByTestId('canvas-object-studio-surface');
    const chatLane = screen.getByTestId('canvas-object-studio-chat');
    const laneShell = within(chatLane).getByTestId('demo-content-lane-shell');
    const laneGuide = within(chatLane).getByTestId('demo-content-lane-guide');
    const laneCap = within(chatLane).getByTestId('demo-content-lane-cap');
    const laneArm = within(chatLane).getByTestId('demo-content-lane-arm');
    const laneShoulder = within(chatLane).getByTestId('demo-content-lane-shoulder');
    const laneCradle = within(chatLane).getByTestId('demo-content-lane-cradle');
    const laneSlot = within(chatLane).getByTestId('demo-content-lane-slot');
    const laneBody = within(chatLane).getByTestId('demo-content-lane-body');
    const bareChatSurface = within(chatLane).getByTestId('bare-embedded-surface');
    expect(screen.getByTestId('demo-workbench-notice')).toBeInTheDocument();
    expect(surface).toHaveAttribute('data-demo-content-workbench', 'true');
    expect(chatLane).toHaveAttribute('data-demo-content-lane', 'true');
    expect(chatLane).toHaveAttribute('data-demo-content-lane-style', 'rail');
    expect(chatLane).toHaveAttribute('data-demo-content-lane-height', 'compact');
    expect(chatLane).toHaveAttribute('data-demo-content-lane-position', 'inset');
    expect(chatLane).toHaveAttribute('data-demo-content-lane-anchor', 'cap');
    expect(chatLane).toHaveAttribute('data-demo-content-lane-connector', 'arm');
    expect(chatLane).toHaveAttribute('data-demo-content-lane-transition', 'shoulder');
    expect(chatLane).toHaveAttribute('data-demo-content-lane-foundation', 'cradle');
    expect(chatLane).toHaveAttribute('data-demo-content-lane-body', 'veil');
    expect(chatLane).toHaveAttribute('data-demo-content-lane-edge', 'ridge');
    expect(chatLane).toHaveAttribute('data-demo-content-lane-slot', 'groove');
    expect(laneShell).toHaveAttribute('data-demo-content-lane-shell', 'anchored');
    expect(laneGuide).toBeInTheDocument();
    expect(laneCap).toBeInTheDocument();
    expect(laneArm).toBeInTheDocument();
    expect(laneShoulder).toBeInTheDocument();
    expect(laneCradle).toBeInTheDocument();
    expect(laneSlot).toHaveAttribute('data-demo-content-lane-slot', 'groove');
    expect(laneBody).toHaveAttribute('data-demo-content-lane-fit', 'nested');
    expect(bareChatSurface).toHaveAttribute('data-embedded-surface-mode', 'bare');
    expect(within(chatLane).getByTestId('annotation-embedded-header')).toBeInTheDocument();
    expect(within(chatLane).getByTestId('bare-embedded-message-stream')).toBeInTheDocument();
    expect(screen.getByTestId('demo-content-workbench-close')).toBeInTheDocument();
    expect(screen.queryByText('剧本卡已展开')).not.toBeInTheDocument();
    expect(screen.queryByText('先在这里把这一场改顺，再决定是否继续推进到分镜。')).not.toBeInTheDocument();
    expect(screen.queryByText('就绪')).not.toBeInTheDocument();
    expect(screen.queryByText('写剧本')).not.toBeInTheDocument();
    expect(within(editorRegion).queryByText('剧本卡')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Script 01 · 开场 · 屋顶误入' })).not.toBeInTheDocument();
  });
});

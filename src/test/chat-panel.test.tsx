import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatPanel } from '@/pages/Canvas/chat/ChatPanel';
import type { ChatMessage } from '@/pages/Canvas/agent/types';

const noop = vi.fn();

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    role: 'ai',
    type: 'text',
    text: '嗨，我是你的创作搭档。',
    timestamp: 1,
    ...overrides,
  };
}

describe('ChatPanel（画布对话框体验）', () => {
  it('头部只保留项目标题，不显示创作助手文案', () => {
    render(
      <ChatPanel
        messages={[message()]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="idea"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
      />,
    );

    expect(screen.getByText('测试项目')).toBeInTheDocument();
    expect(screen.queryByText('创作助手')).not.toBeInTheDocument();
  });

  it('输入框提供明确的创作输入语义', () => {
    render(
      <ChatPanel
        messages={[message()]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="idea"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
      />,
    );

    expect(screen.getByLabelText('创作输入')).toBeInTheDocument();
  });

  it('在有焦点对象时显示当前焦点与当前任务', () => {
    render(
      <ChatPanel
        messages={[message()]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="做分镜"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusLabel="Shot 02 · 人物登场"
        focusTypeLabel="分镜对象"
        focusTask="围绕这一镜做判断：节奏是否成立、是否要重做、是否能继续往下。"
      />,
    );

    expect(screen.getByText('分镜对象 · Shot 02 · 人物登场')).toBeInTheDocument();
    expect(screen.getByText('当前任务: 围绕这一镜做判断：节奏是否成立、是否要重做、是否能继续往下。')).toBeInTheDocument();
  });

  it('嵌入模式下弱化协作区头部，不再显示独立 agent 身份徽章', () => {
    render(
      <ChatPanel
        messages={[message({ text: '围绕这一镜继续判断。' })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="做分镜"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusLabel="Shot 04 · 对峙"
        focusTypeLabel="分镜对象"
        focusTask="先判断这一镜是否成立。"
        headerMode="embedded"
      />,
    );

    expect(screen.getByText('导演协作')).toBeInTheDocument();
    expect(screen.queryByText('主创搭档')).not.toBeInTheDocument();
    expect(screen.queryByText(/当前协作:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/当前焦点:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/当前任务:/)).not.toBeInTheDocument();
    expect(screen.getAllByText('先判断这一镜是否成立。')).toHaveLength(1);
    expect(screen.getByText('分镜对象 · Shot 04 · 对峙')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('围绕 Shot 04 · 对峙 继续判断、改写或推进…')).toBeInTheDocument();
  });

  it('ambient 嵌入模式进一步弱化 stage 芯片，保留更轻的对象附着感', () => {
    render(
      <ChatPanel
        messages={[message({ text: '围绕这一镜继续判断。' })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="做分镜"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusLabel="Shot 07 · 远景"
        focusTypeLabel="分镜对象"
        focusTask="判断这一镜是否还需要重画。"
        headerMode="embedded"
        embeddedTone="ambient"
      />,
    );

    expect(screen.getByText('导演协作')).toBeInTheDocument();
    expect(screen.queryByText('做分镜')).not.toBeInTheDocument();
    expect(screen.getByText('分镜对象 · Shot 07 · 远景')).toBeInTheDocument();
    expect(screen.getByText('判断这一镜是否还需要重画。')).toBeInTheDocument();
    expect(screen.queryByText('围绕 Shot 07 · 远景 继续判断与推进。')).not.toBeInTheDocument();
  });

  it('minimal embedded 头部进一步退成边注，不再显示导演协作或焦点芯片', () => {
    render(
      <ChatPanel
        messages={[message({ text: '围绕这一场继续判断。' })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusLabel="开场 · 屋顶误入"
        focusTypeLabel="剧本卡"
        focusTask="围绕这一场继续判断哪里该重写。"
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
      />,
    );

    expect(screen.queryByText('导演协作')).not.toBeInTheDocument();
    expect(screen.queryByText('剧本卡 · 开场 · 屋顶误入')).not.toBeInTheDocument();
    expect(screen.getAllByText('围绕这一场继续判断哪里该重写。')).toHaveLength(1);
    expect(screen.queryByText('写剧本')).not.toBeInTheDocument();
  });

  it('minimal embedded composer 进一步退成边注式输入区', () => {
    render(
      <ChatPanel
        messages={[message({ text: '围绕这一场继续判断。' })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusTask="围绕这一场继续判断哪里该重写。"
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
        embeddedComposerMode="minimal"
      />,
    );

    expect(screen.getByTestId('minimal-embedded-composer')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('围绕当前对象继续判断与推进…')).toBeInTheDocument();
  });

  it('bare embedded surface 进一步退成贴边边注容器', () => {
    render(
      <ChatPanel
        messages={[message({ text: '围绕这一场继续判断。' })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusTask="围绕这一场继续判断哪里该重写。"
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
        embeddedComposerMode="minimal"
        embeddedSurfaceMode="bare"
      />,
    );

    expect(screen.getByTestId('bare-embedded-surface')).toHaveAttribute('data-embedded-surface-mode', 'bare');
    expect(screen.getByTestId('annotation-embedded-header')).toBeInTheDocument();
    expect(screen.getByTestId('bare-embedded-message-stream')).toBeInTheDocument();
  });

  it('annotation lane 会把 user 和 AI 都收成同向边注流', () => {
    render(
      <ChatPanel
        messages={[
          message({ id: 'm-ai', text: '先把这一场的节奏判断清楚。' }),
          message({ id: 'm-user', role: 'user', text: '我想先把结尾收短一点。' }),
        ]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusTask="围绕这一场继续判断哪里该重写。"
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
        embeddedComposerMode="minimal"
        embeddedSurfaceMode="bare"
      />,
    );

    const aiRow = screen.getByTestId('annotation-message-ai-m-ai');
    const userRow = screen.getByTestId('annotation-message-user-m-user');
    expect(aiRow).toHaveAttribute('data-annotation-message-role', 'ai');
    expect(userRow).toHaveAttribute('data-annotation-message-role', 'user');
    expect(aiRow.className).toContain('justify-start');
    expect(userRow.className).toContain('justify-start');
  });

  it('annotation lane 会把空态建议词收成轻动作列表', () => {
    render(
      <ChatPanel
        messages={[message({ text: '先看这一场的推进节奏。' })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={['先压短结尾', '先把角色动机说清楚']}
        title="测试项目"
        onTitleChange={noop}
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
        embeddedComposerMode="minimal"
        embeddedSurfaceMode="bare"
      />,
    );

    expect(screen.getByTestId('annotation-hero-prompts')).toBeInTheDocument();
    expect(screen.getByTestId('annotation-hero-prompts')).toHaveAttribute('data-annotation-action-list', 'true');
  });

  it('annotation lane 会把最新快捷回复收成轻动作列表', () => {
    render(
      <ChatPanel
        messages={[message({
          id: 'm-ai-options',
          text: '先选一个切入点继续。',
          options: [
            { label: '先压短结尾', value: 'shorten-ending' },
            { label: '先收角色动机', value: 'tighten-motivation' },
          ],
        })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusTask="围绕这一场继续判断哪里该重写。"
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
        embeddedComposerMode="minimal"
        embeddedSurfaceMode="bare"
      />,
    );

    expect(screen.getByTestId('annotation-quick-replies')).toBeInTheDocument();
    expect(screen.getByTestId('annotation-quick-replies')).toHaveAttribute('data-annotation-action-list', 'true');
  });

  it('annotation lane 会把 milestone 收成轻状态线', () => {
    render(
      <ChatPanel
        messages={[message({
          id: 'm-milestone',
          type: 'milestone',
          text: '这一场的主节奏已经收住了。',
        })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusTask="围绕这一场继续判断哪里该重写。"
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
        embeddedComposerMode="minimal"
        embeddedSurfaceMode="bare"
      />,
    );

    expect(screen.getByTestId('annotation-milestone-m-milestone')).toBeInTheDocument();
  });

  it('annotation lane 会把 loading 收成轻状态线', () => {
    render(
      <ChatPanel
        messages={[message({ text: '继续围绕这一场判断。' })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusTask="围绕这一场继续判断哪里该重写。"
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
        embeddedComposerMode="minimal"
        embeddedSurfaceMode="bare"
      />,
    );

    expect(screen.getByTestId('annotation-loading-line')).toBeInTheDocument();
    expect(screen.getByText('继续整理中…')).toBeInTheDocument();
  });

  it('annotation lane 会把 composer 收成轻动作线', () => {
    render(
      <ChatPanel
        messages={[message({ text: '继续围绕这一场判断。' })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusTask="围绕这一场继续判断哪里该重写。"
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
        embeddedComposerMode="minimal"
        embeddedSurfaceMode="bare"
      />,
    );

    expect(screen.getByTestId('annotation-composer')).toHaveAttribute('data-annotation-composer-style', 'inline');
    expect(screen.getByTestId('annotation-send-action')).toBeInTheDocument();
  });

  it('annotation lane 在可附图时也会把附图入口收成轻动作', () => {
    render(
      <ChatPanel
        messages={[message({ text: '继续围绕这一场判断。' })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        onAttachImage={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusTask="围绕这一场继续判断哪里该重写。"
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
        embeddedComposerMode="minimal"
        embeddedSurfaceMode="bare"
      />,
    );

    expect(screen.getByTestId('annotation-attach-action')).toBeInTheDocument();
  });

  it('annotation lane 会把 thinking、progress 和 action 都收成轻反馈块', () => {
    render(
      <ChatPanel
        messages={[
          message({
            id: 'm-rich',
            text: '先把这一场的判断线收短。',
            thinking: '先判断节奏，再看是否需要重写台词。',
            type: 'progress',
            progress: { current: 1, total: 3, label: '整理判断' },
          }),
          {
            ...message({
              id: 'm-action',
              type: 'action',
              text: '',
            }),
            action: {
              label: '继续重写这一场',
              description: '把当前判断直接落成一版新文本。',
              icon: '✍️',
            },
          },
        ]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusTask="围绕这一场继续判断哪里该重写。"
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
        embeddedComposerMode="minimal"
        embeddedSurfaceMode="bare"
      />,
    );

    expect(screen.getByTestId('annotation-thinking-m-rich')).toBeInTheDocument();
    expect(screen.getByTestId('annotation-progress-m-rich')).toBeInTheDocument();
    expect(screen.getByTestId('annotation-action-m-action')).toBeInTheDocument();
    expect(screen.getByText('展开判断脉络')).toBeInTheDocument();
    expect(screen.getByText('整理判断 · 1/3')).toBeInTheDocument();
    expect(screen.getByText('继续重写这一场')).toBeInTheDocument();
  });

  it('annotation lane 会把 card-group 候选收成轻候选条目', () => {
    render(
      <ChatPanel
        messages={[message({
          id: 'm-card-group',
          type: 'card-group',
          text: '',
          cards: [
            {
              id: 'card-1',
              title: '保留屋顶误入',
              description: '让误闯天台保留为主钩子，只压短收尾解释。',
              emoji: '🎬',
            },
            {
              id: 'card-2',
              title: '先收角色动机',
              description: '先把周临为什么会上楼说清楚，再进误入。',
              emoji: '🧭',
            },
          ],
        })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="写剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusTask="围绕这一场继续判断哪里该重写。"
        headerMode="embedded"
        embeddedTone="ambient"
        embeddedHeaderMode="minimal"
        embeddedComposerMode="minimal"
        embeddedSurfaceMode="bare"
      />,
    );

    expect(screen.getByTestId('annotation-card-group-m-card-group')).toBeInTheDocument();
    expect(screen.getByTestId('annotation-card-group-m-card-group')).toHaveAttribute('data-annotation-action-list', 'true');
    expect(screen.getByText('保留屋顶误入')).toBeInTheDocument();
    expect(screen.getByText('先收角色动机')).toBeInTheDocument();
  });

  it('floating 模式弱化全局协作面板的页面感，不再显示重的 AI 身份条', () => {
    render(
      <ChatPanel
        messages={[message({ text: '我们可以先把主线方向锁住。' })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="剧本"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusTask="先把当前阶段的关键判断做完。"
        headerMode="floating"
      />,
    );

    expect(screen.getByText('测试项目')).toBeInTheDocument();
    expect(screen.getAllByText('先把当前阶段的关键判断做完。')).toHaveLength(1);
    expect(screen.queryByText('剧本')).not.toBeInTheDocument();
    expect(screen.queryByText('主创搭档')).not.toBeInTheDocument();
    expect(screen.queryByText(/当前协作:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/当前任务:/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('继续聊项目方向、镜头或当前卡点…')).toBeInTheDocument();
  });

  it('floating 模式在有焦点对象时也不显示阶段芯片', () => {
    render(
      <ChatPanel
        messages={[message({ text: '我们先围绕这一镜继续。' })]}
        onSendMessage={noop}
        onSelectOption={noop}
        onSelectCard={noop}
        onAction={noop}
        loading={false}
        stage="做分镜"
        suggestedPrompts={[]}
        title="测试项目"
        onTitleChange={noop}
        focusLabel="Shot 09 · 推门"
        focusTypeLabel="分镜对象"
        headerMode="floating"
      />,
    );

    expect(screen.getByText('分镜对象 · Shot 09 · 推门')).toBeInTheDocument();
    expect(screen.queryByText('做分镜')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('围绕 Shot 09 · 推门 继续判断、改写或推进…')).toBeInTheDocument();
  });
});

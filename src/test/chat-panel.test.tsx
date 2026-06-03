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
});

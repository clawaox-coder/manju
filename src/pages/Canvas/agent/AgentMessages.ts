import type { ChatMessage } from './types';

// 退化后：不再有任何「按 stage/step 写死台词」的生成器——全程对话文案来自
// 后端 chat() agent。这里只保留纯粹的消息构造工具。

let msgCounter = 0;
function nextId(prefix: string): string {
  return `msg-${prefix}-${++msgCounter}`;
}

/** 用户消息。 */
export function makeUserMessage(text: string): ChatMessage {
  return { id: nextId('user'), role: 'user', type: 'text', text, timestamp: Date.now() };
}

/** AI 文本消息（可带 thinking / 动态 options，对应 chat() 的一轮回应）。 */
export function makeAiMessage(
  text: string,
  extra?: { thinking?: string; options?: { label: string; value: string }[] },
): ChatMessage {
  return {
    id: nextId('ai'),
    role: 'ai',
    type: 'text',
    text,
    thinking: extra?.thinking || undefined,
    options: extra?.options?.length ? extra.options : undefined,
    timestamp: Date.now(),
  };
}

/** 系统提示（轻量上下文切换提示，如「↩ 返回主线」）。 */
export function makeSystemMessage(text: string): ChatMessage {
  return { id: nextId('sys'), role: 'system', type: 'context-switch', text, timestamp: Date.now() };
}

/** 进度消息（生成/匹配/渲染进行中）。 */
export function makeProgressMessage(text: string, label: string): ChatMessage {
  return {
    id: nextId('prog'),
    role: 'ai',
    type: 'progress',
    text,
    progress: { current: 0, total: 1, label },
    timestamp: Date.now(),
  };
}

/** 错误 + 重试动作消息。 */
export function makeErrorAction(text: string, label: string, description: string): ChatMessage {
  return {
    id: nextId('err'),
    role: 'ai',
    type: 'action',
    text,
    action: { label, description, icon: '↻' },
    timestamp: Date.now(),
  };
}

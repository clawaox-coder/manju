export type Stage = 'idea' | 'script' | 'storyboard' | 'voice' | 'video';

// 退化后的步骤：不再是 idea 四步问答 / 各阶段细分流程，而是统一的进度态。
//   chatting   — 正在对话（默认态）
//   generating — 剧本/分镜生成中
//   matching   — 配音匹配中
//   rendering  — 视频渲染中
//   ready      — 当前阶段产物已就绪
export type Step = 'chatting' | 'generating' | 'matching' | 'rendering' | 'ready';

export interface IdeaContext {
  type?: string;
  style?: string;
  duration?: string;
  audience?: string;
  tone?: string;
  theme?: string;
}

// 阶段追踪器的状态：只剩 stage/step、累积的创意设定、当前聚焦节点。
export interface AgentState {
  stage: Stage;
  step: Step;
  ideaContext: IdeaContext;
  focusedNodeId: string | null;
}

export type MessageType = 'text' | 'thinking' | 'options' | 'card-group' | 'preview' | 'progress' | 'action' | 'context-switch';

export interface CardOption {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  emoji?: string;
}

export interface ChatMessage {
  id: string;
  role: 'ai' | 'user' | 'system';
  type: MessageType;
  text: string;
  thinking?: string;
  thinkingCollapsed?: boolean;
  options?: { label: string; value: string }[];
  cards?: CardOption[];
  progress?: { current: number; total: number; label: string };
  action?: { label: string; description: string; icon: string };
  selectedCard?: string;
  timestamp: number;
}

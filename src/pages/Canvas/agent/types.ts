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

// 阶段追踪器的状态：只剩 stage/step、累积的创意设定。
// 节点聚焦现在由画布对象工作面接管,不再走旧的状态机式节点面板。
export interface AgentState {
  stage: Stage;
  step: Step;
  ideaContext: IdeaContext;
}

export type MessageType = 'text' | 'thinking' | 'options' | 'card-group' | 'preview' | 'progress' | 'action' | 'context-switch' | 'milestone';

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
  /** 该 AI 消息产生时所处阶段，决定显示哪个角色头像（创意总监/编剧/…）。 */
  agentRole?: Stage;
  thinking?: string;
  thinkingCollapsed?: boolean;
  options?: { label: string; value: string }[];
  cards?: CardOption[];
  progress?: { current: number; total: number; label: string };
  action?: { label: string; description: string; icon: string };
  selectedCard?: string;
  timestamp: number;
}

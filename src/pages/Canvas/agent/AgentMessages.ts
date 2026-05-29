import type { AgentState, ChatMessage } from './types';

interface MessageContext {
  projectName?: string;
  scriptScenes?: number;
  shotCount?: number;
  focusedNodeLabel?: string;
  scriptPreview?: string;
}

let msgCounter = 0;
function makeMsg(partial: Omit<ChatMessage, 'id' | 'role' | 'timestamp'> & { role?: ChatMessage['role'] }): ChatMessage {
  return { id: `msg-${++msgCounter}`, role: 'ai', timestamp: Date.now(), ...partial };
}

const TYPE_OPTIONS = [
  { label: '🎭 漫剧', value: '漫剧' },
  { label: '🎬 真人短剧', value: '真人短剧' },
  { label: '✨ 动画短片', value: '动画短片' },
];

const STYLE_MAP: Record<string, { label: string; value: string }[]> = {
  漫剧: [
    { label: '🌸 日系动漫', value: '日系动漫' },
    { label: '🦸 美漫风', value: '美漫' },
    { label: '🖌 水墨国风', value: '水墨国风' },
  ],
  真人短剧: [
    { label: '🎥 电影质感', value: '电影质感' },
    { label: '📱 竖屏短剧', value: '竖屏短剧' },
    { label: '🎞 复古胶片', value: '复古胶片' },
  ],
  动画短片: [
    { label: '🧊 3D 渲染', value: '3D渲染' },
    { label: '✏️ 手绘', value: '手绘' },
    { label: '🟨 像素', value: '像素' },
  ],
};

const DURATION_OPTIONS = [
  { label: '⚡ 30 秒', value: '30秒' },
  { label: '🎬 1 分钟', value: '1分钟' },
  { label: '📖 2-3 分钟', value: '2分钟' },
];

const AUDIENCE_OPTIONS = [
  { label: '🧑‍💻 年轻人 (18-30)', value: '年轻人' },
  { label: '👨‍👩‍👧 全年龄', value: '全年龄' },
  { label: '👔 职场人', value: '职场人' },
];

export function getAgentMessage(state: AgentState, ctx?: MessageContext): ChatMessage {
  if (state.step === 'editing' && state.focusedNodeId) {
    const label = ctx?.focusedNodeLabel ?? state.focusedNodeId;
    return makeMsg({
      type: 'text',
      text: `📍 切换到: ${label}\n需要调整什么？我可以换风格、改内容、或重新生成。`,
      options: [
        { label: '换风格', value: 'change_style' },
        { label: '修改内容', value: 'edit_content' },
        { label: '重新生成', value: 'regenerate' },
        { label: '返回主线', value: 'exit_focus' },
      ],
    });
  }

  switch (state.stage) {
    case 'idea':
      return getIdeaMessage(state);
    case 'script':
      return getScriptMessage(state, ctx);
    case 'storyboard':
      return getStoryboardMessage(state);
    case 'voice':
      return getVoiceMessage(state, ctx);
    case 'video':
      return getVideoMessage(state);
    default:
      return makeMsg({ type: 'text', text: '有什么我可以帮你的？' });
  }
}

function getVoiceMessage(state: AgentState, ctx?: MessageContext): ChatMessage {
  switch (state.step) {
    case 'matching':
      return makeMsg({ type: 'progress', text: '🎙 正在为角色匹配配音...', progress: { current: 0, total: 1, label: '配音匹配中' } });
    case 'offer':
    default:
      return makeMsg({ type: 'action', text: '分镜已就绪！接下来给角色配音：', action: { label: '一键配音', description: `${ctx?.shotCount ?? 0} 个镜头 · 预计 20 秒`, icon: '🎙' } });
  }
}

function getVideoMessage(state: AgentState): ChatMessage {
  switch (state.step) {
    case 'rendering':
      return makeMsg({ type: 'progress', text: '🎬 正在渲染视频...', progress: { current: 0, total: 1, label: '渲染中' } });
    case 'done':
      return makeMsg({ type: 'text', text: '🎉 视频已生成！可以在右上角预览或下载。需要调整哪个部分，点击画布节点告诉我。' });
    case 'offer':
    default:
      return makeMsg({ type: 'action', text: '配音完成！最后一步生成视频：', action: { label: '生成视频', description: '预计时长 1:30 · 1080p', icon: '🎬' } });
  }
}

function getIdeaMessage(state: AgentState): ChatMessage {
  switch (state.step) {
    case 'greeting':
      return makeMsg({ type: 'text', text: '你好！我是你的创作助手 🎬 想做什么类型的作品？' });
    case 'ask_type':
      return makeMsg({ type: 'options', text: '想做什么类型？', options: TYPE_OPTIONS });
    case 'ask_style':
      return makeMsg({ type: 'options', text: '选个风格方向：', options: STYLE_MAP[state.ideaContext.type ?? '漫剧'] ?? STYLE_MAP['漫剧'] });
    case 'ask_duration':
      return makeMsg({ type: 'options', text: '视频时长大概多久？', options: DURATION_OPTIONS });
    case 'ask_audience':
      return makeMsg({ type: 'options', text: '目标受众是？', options: AUDIENCE_OPTIONS });
    default:
      return makeMsg({ type: 'text', text: '让我们开始吧！' });
  }
}

function getScriptMessage(state: AgentState, ctx?: MessageContext): ChatMessage {
  switch (state.step) {
    case 'generate':
      return makeMsg({ type: 'progress', text: '正在构思剧本方向...', progress: { current: 0, total: 3, label: '生成中' } });
    case 'show_options':
      return makeMsg({ type: 'text', text: '为你准备了 3 个剧本方向，已放到画布上 👉 点选你喜欢的那个。' });
    case 'expand': {
      const preview = (ctx?.scriptPreview ?? '').slice(0, 160);
      return makeMsg({
        type: 'action',
        text: preview ? `已选定这个方向：\n\n${preview}${preview.length >= 160 ? '…' : ''}` : '已选定剧本方向。',
        action: { label: '确认剧本', description: '保存并开始生成分镜', icon: '✅' },
      });
    }
    default:
      return makeMsg({ type: 'text', text: '继续创作剧本...' });
  }
}

function getStoryboardMessage(state: AgentState): ChatMessage {
  switch (state.step) {
    case 'generate_scene':
      return makeMsg({ type: 'progress', text: '🎨 正在生成分镜...', progress: { current: 0, total: 1, label: '生成分镜' } });
    case 'complete':
      return makeMsg({ type: 'text', text: '🎉 分镜已生成！接下来可以配音或直接生成视频。' });
    default:
      return makeMsg({ type: 'text', text: '继续生成分镜...' });
  }
}

export function makeUserMessage(text: string): ChatMessage {
  return { id: `msg-${++msgCounter}`, role: 'user', type: 'text', text, timestamp: Date.now() };
}

export function makeSystemMessage(text: string): ChatMessage {
  return { id: `msg-${++msgCounter}`, role: 'system', type: 'context-switch', text, timestamp: Date.now() };
}

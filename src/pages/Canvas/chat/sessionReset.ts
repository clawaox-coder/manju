import type { Stage } from '../agent/types';

interface ConversationResetState {
  hasScript: boolean;
  hasShots: boolean;
}

export function getConversationResetMessage(
  state: ConversationResetState,
): { stage: Stage; text: string } {
  if (state.hasShots) {
    return {
      stage: 'voice',
      text: '分镜已经准备好了。想继续配音，还是先改单镜内容？',
    };
  }

  if (state.hasScript) {
    return {
      stage: 'storyboard',
      text: '剧本已经在画布上了。想继续生成分镜，还是先调整某一场？',
    };
  }

  return {
    stage: 'idea',
    text: '嗨，我是你的创作搭档。想做个什么样的短片？随便聊聊就行——一句灵感、一个画面，都可以。',
  };
}

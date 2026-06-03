import { describe, expect, it } from 'vitest';
import { getConversationResetMessage } from '@/pages/Canvas/chat/sessionReset';

describe('getConversationResetMessage（新对话重置文案）', () => {
  it('空项目回到灵感收集欢迎语', () => {
    expect(getConversationResetMessage({ hasScript: false, hasShots: false })).toEqual({
      stage: 'idea',
      text: '嗨，我是你的创作搭档。想做个什么样的短片？随便聊聊就行——一句灵感、一个画面，都可以。',
    });
  });

  it('已有剧本时，引导继续剧本后续流程', () => {
    expect(getConversationResetMessage({ hasScript: true, hasShots: false })).toEqual({
      stage: 'storyboard',
      text: '剧本已经在画布上了。想继续生成分镜，还是先调整某一场？',
    });
  });

  it('已有分镜时，引导继续配音或调镜头', () => {
    expect(getConversationResetMessage({ hasScript: true, hasShots: true })).toEqual({
      stage: 'voice',
      text: '分镜已经准备好了。想继续配音，还是先改单镜内容？',
    });
  });
});

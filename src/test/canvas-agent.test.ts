import { describe, it, expect } from 'vitest';
import { AgentStateMachine } from '@/pages/Canvas/agent/AgentStateMachine';
import type { Stage } from '@/pages/Canvas/agent/types';

// 与 index.tsx 的 STAGE_ALLOWED_ACTION 保持一致：每个 stage 只允许一个制作动作。
const STAGE_ALLOWED_ACTION: Record<Stage, string | null> = {
  idea: 'generate_script',
  script: 'generate_storyboard',
  storyboard: 'match_voice',
  voice: 'render_video',
  video: null,
};

function isTriggerAllowed(stage: Stage, action: string): boolean {
  return STAGE_ALLOWED_ACTION[stage] === action;
}

describe('AgentStateMachine（阶段追踪器）', () => {
  it('初始停在 idea/chatting', () => {
    const sm = new AgentStateMachine();
    expect(sm.state.stage).toBe('idea');
    expect(sm.state.step).toBe('chatting');
  });

  it('mergeIdeaContext 累积创意设定，忽略空值', () => {
    const sm = new AgentStateMachine();
    sm.mergeIdeaContext({ type: '漫剧', style: '' });
    sm.mergeIdeaContext({ style: '日系动漫', audience: '年轻人' });
    expect(sm.state.ideaContext).toEqual({ type: '漫剧', style: '日系动漫', audience: '年轻人' });
  });

  it('enterBusy / markReady 切换阶段与进度态', () => {
    const sm = new AgentStateMachine();
    sm.enterBusy('script');
    expect(sm.state.stage).toBe('script');
    expect(sm.state.step).toBe('generating');
    sm.markReady('script');
    expect(sm.state.step).toBe('ready');

    sm.enterBusy('voice');
    expect(sm.state.step).toBe('matching');
    sm.enterBusy('video');
    expect(sm.state.step).toBe('rendering');
  });

  // ---- restore：按已有产物恢复阶段 ----

  it('空项目恢复到 idea', () => {
    const sm = new AgentStateMachine();
    sm.restore({ hasScript: false, hasShots: false, hasVoice: false, hasVideo: false });
    expect(sm.state.stage).toBe('idea');
  });

  it('有剧本无分镜 → storyboard', () => {
    const sm = new AgentStateMachine();
    sm.restore({ hasScript: true, hasShots: false, hasVoice: false, hasVideo: false });
    expect(sm.state.stage).toBe('storyboard');
  });

  it('有分镜 → voice', () => {
    const sm = new AgentStateMachine();
    sm.restore({ hasScript: true, hasShots: true, hasVoice: false, hasVideo: false });
    expect(sm.state.stage).toBe('voice');
  });

  it('有配音 → video（chatting，尚未出片）', () => {
    const sm = new AgentStateMachine();
    sm.restore({ hasScript: true, hasShots: true, hasVoice: true, hasVideo: false });
    expect(sm.state.stage).toBe('video');
    expect(sm.state.step).toBe('chatting');
  });

  it('已出片 → video/ready', () => {
    const sm = new AgentStateMachine();
    sm.restore({ hasScript: true, hasShots: true, hasVoice: true, hasVideo: true });
    expect(sm.state.stage).toBe('video');
    expect(sm.state.step).toBe('ready');
  });
});

describe('trigger 阶段白名单校验', () => {
  it('每个 stage 只放行其对应的 action', () => {
    expect(isTriggerAllowed('idea', 'generate_script')).toBe(true);
    expect(isTriggerAllowed('script', 'generate_storyboard')).toBe(true);
    expect(isTriggerAllowed('storyboard', 'match_voice')).toBe(true);
    expect(isTriggerAllowed('voice', 'render_video')).toBe(true);
  });

  it('越权 action 一律拒绝', () => {
    // idea 阶段不能直接渲染视频
    expect(isTriggerAllowed('idea', 'render_video')).toBe(false);
    // script 阶段不能跳过分镜去配音
    expect(isTriggerAllowed('script', 'match_voice')).toBe(false);
    // storyboard 阶段不能直接出片
    expect(isTriggerAllowed('storyboard', 'render_video')).toBe(false);
  });

  it('video 阶段不允许任何 trigger', () => {
    for (const action of ['generate_script', 'generate_storyboard', 'match_voice', 'render_video']) {
      expect(isTriggerAllowed('video', action)).toBe(false);
    }
  });
});

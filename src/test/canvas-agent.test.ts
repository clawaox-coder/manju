import { describe, it, expect } from 'vitest';
import { AgentStateMachine } from '@/pages/Canvas/agent/AgentStateMachine';

describe('AgentStateMachine', () => {
  it('starts at idea/greeting', () => {
    const sm = new AgentStateMachine();
    expect(sm.state.stage).toBe('idea');
    expect(sm.state.step).toBe('greeting');
  });

  it('advances from greeting to ask_type', () => {
    const sm = new AgentStateMachine();
    sm.advance();
    expect(sm.state.step).toBe('ask_type');
  });

  it('records decision and advances on selectOption', () => {
    const sm = new AgentStateMachine();
    sm.advance();
    sm.selectOption('漫剧');
    expect(sm.state.ideaContext.type).toBe('漫剧');
    expect(sm.state.step).toBe('ask_style');
    expect(sm.state.history).toHaveLength(1);
    expect(sm.state.history[0].chosen).toBe('漫剧');
  });

  it('transitions from idea to script stage after all idea steps', () => {
    const sm = new AgentStateMachine();
    sm.advance();
    sm.selectOption('漫剧');
    sm.selectOption('日系动漫');
    sm.selectOption('2分钟');
    sm.selectOption('年轻人');
    expect(sm.state.stage).toBe('script');
    expect(sm.state.step).toBe('generate');
  });

  it('enters focus mode (B mode) and restores', () => {
    const sm = new AgentStateMachine();
    sm.advance();
    sm.selectOption('漫剧');
    sm.focusNode('script-0');
    expect(sm.state.focusedNodeId).toBe('script-0');
    expect(sm.state.step).toBe('editing');
    sm.exitFocus();
    expect(sm.state.focusedNodeId).toBeNull();
    expect(sm.state.step).toBe('ask_style');
  });

  it('restores state from project data', () => {
    const sm = new AgentStateMachine();
    sm.restore({ hasScript: true, hasShots: false, hasVoice: false, hasVideo: false });
    expect(sm.state.stage).toBe('storyboard');
    expect(sm.state.step).toBe('generate_scene');
  });
});

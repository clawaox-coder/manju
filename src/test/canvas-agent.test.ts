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

  it('loops through storyboard scenes and completes', () => {
    const sm = new AgentStateMachine();
    sm.restore({ hasScript: true, hasShots: false, hasVoice: false, hasVideo: false });
    sm.setTotalScenes(3);
    expect(sm.state.totalScenes).toBe(3);

    // scene 0
    sm.showSceneOptions();
    expect(sm.state.step).toBe('show_scene_options');
    sm.selectCard('style-a');
    expect(sm.state.sceneIndex).toBe(1);
    expect(sm.state.step).toBe('generate_scene');

    // scene 1
    sm.showSceneOptions();
    sm.selectCard('style-b');
    expect(sm.state.sceneIndex).toBe(2);
    expect(sm.state.step).toBe('generate_scene');

    // scene 2 (last)
    sm.showSceneOptions();
    sm.selectCard('style-c');
    expect(sm.state.sceneIndex).toBe(3);
    expect(sm.state.step).toBe('complete');
    expect(sm.state.history).toHaveLength(3);
  });

  it('records edit action in B mode', () => {
    const sm = new AgentStateMachine();
    sm.advance();
    sm.selectOption('漫剧');
    sm.focusNode('shot-1');
    sm.applyEditAction('change_style');
    expect(sm.state.lastEditAction).toBe('change_style');
    sm.exitFocus();
    expect(sm.state.focusedNodeId).toBeNull();
  });

  it('transitions script generate → show_options', () => {
    const sm = new AgentStateMachine();
    sm.advance();
    sm.selectOption('漫剧');
    sm.selectOption('日系动漫');
    sm.selectOption('2分钟');
    sm.selectOption('年轻人');
    expect(sm.state.step).toBe('generate');
    sm.showScriptOptions();
    expect(sm.state.step).toBe('show_options');
    sm.selectOption('outline-1');
    expect(sm.state.step).toBe('expand');
    sm.confirm();
    expect(sm.state.stage).toBe('storyboard');
    expect(sm.state.step).toBe('generate_scene');
  });

  it('advances storyboard complete → voice → video → done', () => {
    const sm = new AgentStateMachine();
    sm.restore({ hasScript: true, hasShots: false, hasVoice: false, hasVideo: false });
    sm.setTotalScenes(1);

    // finish the one scene → complete
    sm.showSceneOptions();
    sm.selectCard('style-a');
    expect(sm.state.step).toBe('complete');

    // complete → voice offer
    sm.proceedToVoice();
    expect(sm.state.stage).toBe('voice');
    expect(sm.state.step).toBe('offer');

    // voice offer → matching → video offer
    sm.startVoiceMatch();
    expect(sm.state.step).toBe('matching');
    sm.completeVoice();
    expect(sm.state.stage).toBe('video');
    expect(sm.state.step).toBe('offer');

    // video offer → rendering → done
    sm.startRender();
    expect(sm.state.step).toBe('rendering');
    sm.completeRender();
    expect(sm.state.step).toBe('done');
  });

  it('voice/video transitions are no-ops when stage does not match', () => {
    const sm = new AgentStateMachine();
    // still in idea — none of these should fire
    sm.proceedToVoice();
    sm.completeVoice();
    sm.startRender();
    sm.completeRender();
    expect(sm.state.stage).toBe('idea');
    expect(sm.state.step).toBe('greeting');
  });
});

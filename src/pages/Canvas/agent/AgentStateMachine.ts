import type { AgentState, Step, Decision, IdeaContext, EditAction } from './types';

const IDEA_STEPS: Step[] = ['ask_type', 'ask_style', 'ask_duration', 'ask_audience'];
const IDEA_CONTEXT_KEYS: (keyof IdeaContext)[] = ['type', 'style', 'duration', 'audience'];

export interface ProjectData {
  hasScript: boolean;
  hasShots: boolean;
  hasVoice: boolean;
  hasVideo: boolean;
}

export const INITIAL_STATE: AgentState = {
  stage: 'idea',
  step: 'greeting',
  ideaContext: {},
  focusedNodeId: null,
  previousStep: null,
  history: [],
  sceneIndex: 0,
  totalScenes: 0,
  lastEditAction: null,
};

export class AgentStateMachine {
  state: AgentState;

  constructor(initial?: AgentState) {
    this.state = initial ? { ...initial } : { ...INITIAL_STATE };
  }

  advance(): void {
    if (this.state.stage === 'idea' && this.state.step === 'greeting') {
      this.state = { ...this.state, step: 'ask_type' };
    }
  }

  selectOption(value: string): void {
    const decision: Decision = {
      stage: this.state.stage,
      step: this.state.step,
      chosen: value,
      alternatives: [],
      timestamp: Date.now(),
    };
    const history = [...this.state.history, decision];

    if (this.state.stage === 'idea') {
      const idx = IDEA_STEPS.indexOf(this.state.step);
      const contextKey = IDEA_CONTEXT_KEYS[idx];
      const ideaContext = { ...this.state.ideaContext, [contextKey]: value };

      if (idx < IDEA_STEPS.length - 1) {
        this.state = { ...this.state, step: IDEA_STEPS[idx + 1], ideaContext, history };
      } else {
        this.state = { ...this.state, stage: 'script', step: 'generate', ideaContext, history };
      }
    } else if (this.state.stage === 'script' && this.state.step === 'show_options') {
      this.state = { ...this.state, step: 'expand', history };
    }
  }

  selectCard(cardId: string): void {
    if (this.state.stage === 'storyboard' && this.state.step === 'show_scene_options') {
      const decision: Decision = {
        stage: this.state.stage,
        step: this.state.step,
        chosen: cardId,
        alternatives: [],
        timestamp: Date.now(),
      };
      const history = [...this.state.history, decision];
      const next = this.state.sceneIndex + 1;
      if (next >= this.state.totalScenes) {
        this.state = { ...this.state, step: 'complete', sceneIndex: next, history };
      } else {
        this.state = { ...this.state, step: 'generate_scene', sceneIndex: next, history };
      }
      return;
    }
    this.selectOption(cardId);
  }

  setTotalScenes(total: number): void {
    this.state = { ...this.state, totalScenes: total };
  }

  showSceneOptions(): void {
    if (this.state.stage === 'storyboard' && this.state.step === 'generate_scene') {
      this.state = { ...this.state, step: 'show_scene_options' };
    }
  }

  showScriptOptions(): void {
    if (this.state.stage === 'script' && this.state.step === 'generate') {
      this.state = { ...this.state, step: 'show_options' };
    }
  }

  applyEditAction(action: EditAction): void {
    if (this.state.step === 'editing') {
      this.state = { ...this.state, lastEditAction: action };
    }
  }

  confirm(): void {
    if (this.state.stage === 'script' && this.state.step === 'expand') {
      this.state = { ...this.state, stage: 'storyboard', step: 'generate_scene', sceneIndex: 0 };
    } else if (this.state.stage === 'storyboard' && this.state.step === 'show_scene_options') {
      const next = this.state.sceneIndex + 1;
      if (next >= this.state.totalScenes) {
        this.state = { ...this.state, stage: 'storyboard', step: 'complete', sceneIndex: next };
      } else {
        this.state = { ...this.state, step: 'generate_scene', sceneIndex: next };
      }
    }
  }

  focusNode(nodeId: string): void {
    this.state = {
      ...this.state,
      focusedNodeId: nodeId,
      previousStep: { stage: this.state.stage, step: this.state.step },
      step: 'editing',
    };
  }

  exitFocus(): void {
    if (this.state.previousStep) {
      this.state = {
        ...this.state,
        stage: this.state.previousStep.stage,
        step: this.state.previousStep.step,
        focusedNodeId: null,
        previousStep: null,
      };
    }
  }

  restore(data: ProjectData): void {
    if (data.hasVideo) {
      this.state = { ...this.state, stage: 'video', step: 'offer' };
    } else if (data.hasVoice) {
      this.state = { ...this.state, stage: 'video', step: 'offer' };
    } else if (data.hasShots) {
      this.state = { ...this.state, stage: 'voice', step: 'offer' };
    } else if (data.hasScript) {
      this.state = { ...this.state, stage: 'storyboard', step: 'generate_scene' };
    }
  }
}

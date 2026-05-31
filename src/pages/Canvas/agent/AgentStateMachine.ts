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

  /** Agent-driven idea stage: merge LLM-extracted settings into ideaContext. */
  mergeIdeaContext(extracted: Partial<IdeaContext>): void {
    const clean = Object.fromEntries(
      Object.entries(extracted).filter(([, v]) => typeof v === 'string' && v.trim()),
    ) as Partial<IdeaContext>;
    if (Object.keys(clean).length === 0) return;
    this.state = { ...this.state, ideaContext: { ...this.state.ideaContext, ...clean } };
  }

  /** Agent-driven idea stage: jump straight to script generation when the
   *  conversation agent decides enough is collected (trigger: generate_script). */
  beginScriptGen(): void {
    if (this.state.stage === 'idea') {
      this.state = { ...this.state, stage: 'script', step: 'generate' };
    }
  }

  selectCard(cardId: string): void {
    this.selectOption(cardId);
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

  proceedToVoice(): void {
    if (this.state.stage === 'storyboard' && this.state.step === 'complete') {
      this.state = { ...this.state, stage: 'voice', step: 'offer' };
    }
  }

  completeStoryboard(): void {
    if (this.state.stage === 'storyboard') {
      this.state = { ...this.state, step: 'complete' };
    }
  }

  startVoiceMatch(): void {
    if (this.state.stage === 'voice' && this.state.step === 'offer') {
      this.state = { ...this.state, step: 'matching' };
    }
  }

  completeVoice(): void {
    if (this.state.stage === 'voice') {
      this.state = { ...this.state, stage: 'video', step: 'offer' };
    }
  }

  startRender(): void {
    if (this.state.stage === 'video' && this.state.step === 'offer') {
      this.state = { ...this.state, step: 'rendering' };
    }
  }

  completeRender(): void {
    if (this.state.stage === 'video') {
      this.state = { ...this.state, step: 'done' };
    }
  }

  confirm(): void {
    if (this.state.stage === 'script' && this.state.step === 'expand') {
      this.state = { ...this.state, stage: 'storyboard', step: 'generate_scene' };
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

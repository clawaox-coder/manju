import { classifyIntent } from '@/lib/api/ai';
import type { AgentStateMachine } from './AgentStateMachine';

interface RouteResult {
  handled: boolean;
  fallbackMessage?: string;
}

export class AgentIntentRouter {
  private sm: AgentStateMachine;

  constructor(sm: AgentStateMachine) {
    this.sm = sm;
  }

  async processInput(text: string): Promise<RouteResult> {
    const context = this.sm.state.history
      .slice(-3)
      .map((d) => `${d.stage}/${d.step}: ${d.chosen}`)
      .join('; ');

    const result = await classifyIntent({
      message: text,
      stage: this.sm.state.stage,
      step: this.sm.state.step as string,
      context,
    });

    switch (result.intent) {
      case 'continue':
        if (result.params.value) {
          this.sm.selectOption(result.params.value);
        }
        return { handled: true };

      case 'skip':
        if (result.params.skip_to) {
          while (this.sm.state.stage !== result.params.skip_to && this.sm.state.stage === 'idea') {
            this.sm.selectOption(result.params.value || '默认');
          }
        }
        return { handled: true };

      case 'modify':
        if (result.params.target_node) {
          this.sm.focusNode(result.params.target_node);
        }
        return { handled: true };

      case 'back':
        this.sm.exitFocus();
        return { handled: true };

      case 'off_topic':
        return { handled: false, fallbackMessage: '我专注在创作上哦，要继续吗？' };

      case 'clarify':
        return { handled: false, fallbackMessage: result.params.question || '能再具体一点吗？' };

      default:
        return { handled: false };
    }
  }
}

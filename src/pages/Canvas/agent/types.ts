export type Stage = 'idea' | 'script' | 'storyboard' | 'voice' | 'video';

export type IdeaStep = 'greeting' | 'ask_type' | 'ask_style' | 'ask_duration' | 'ask_audience';
export type ScriptStep = 'generate' | 'show_options' | 'expand';
export type StoryboardStep = 'generate_scene' | 'show_scene_options' | 'next_scene' | 'complete';
export type VoiceStep = 'offer';
export type VideoStep = 'offer';
export type ContextEditStep = 'editing';

export type Step = IdeaStep | ScriptStep | StoryboardStep | VoiceStep | VideoStep | ContextEditStep;

export interface IdeaContext {
  type?: string;
  style?: string;
  duration?: string;
  audience?: string;
  tone?: string;
}

export interface Decision {
  stage: Stage;
  step: Step;
  chosen: string;
  alternatives: string[];
  timestamp: number;
}

export interface AgentState {
  stage: Stage;
  step: Step;
  ideaContext: IdeaContext;
  focusedNodeId: string | null;
  previousStep: { stage: Stage; step: Step } | null;
  history: Decision[];
  sceneIndex: number;
  totalScenes: number;
}

export type MessageType = 'text' | 'thinking' | 'options' | 'card-group' | 'preview' | 'progress' | 'action' | 'context-switch';

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
  thinking?: string;
  thinkingCollapsed?: boolean;
  options?: { label: string; value: string }[];
  cards?: CardOption[];
  progress?: { current: number; total: number; label: string };
  action?: { label: string; description: string; icon: string };
  selectedCard?: string;
  timestamp: number;
}

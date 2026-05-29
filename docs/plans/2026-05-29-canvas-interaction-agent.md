# Canvas Interaction & Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a conversational AI agent that guides users through the creation pipeline (idea → script → storyboard → voice → video) via chat, with the canvas auto-updating as a live preview.

**Architecture:** Front-end state machine drives structured interactions; LLM intent classification handles free-form input. Chat renders rich message types (thinking, card-group, progress, action). Canvas nodes have lifecycle states (candidate → selected → active → settled) with animated transitions.

**Tech Stack:** React 19, ReactFlow, Vitest, TypeScript, Framer Motion (animations), Zustand (state)

**Spec:** `docs/2026-05-29-canvas-interaction-agent-design.md`

---

## File Structure

```
src/pages/Canvas/
├── agent/
│   ├── types.ts                — AgentState, Decision, ChatMessage, MessageType
│   ├── AgentStateMachine.ts    — State machine: stage/step transitions, option selection
│   ├── AgentMessages.ts        — Message templates per stage/step
│   └── AgentIntentRouter.ts    — Free input → POST /v1/ai/intent.classify → state transition
├── chat/
│   ├── ChatPanel.tsx           — Refactored: renders messages by type, delegates to sub-components
│   ├── MessageThinking.tsx     — Thinking block: streaming + collapsible
│   ├── MessageCardGroup.tsx    — 2-3 option cards with selection animation
│   ├── MessageProgress.tsx     — Progress indicator with stage text
│   ├── MessageAction.tsx       — One-click trigger cards (voice/video)
│   ├── MessagePreview.tsx      — Large preview card with confirm/retry/edit
│   └── OptionPill.tsx          — Capsule button for quick options
├── canvas/
│   ├── useCanvasLayout.ts      — Auto-layout algorithm per stage
│   ├── useCanvasAnimation.ts   — Node enter/exit/select animations
│   ├── useContextFocus.ts      — B-mode: focus node, dim others
│   └── EmptyState.tsx          — Empty canvas with guidance text
├── nodes/                      — Existing nodes, add `nodeStatus` prop
├── index.tsx                   — Refactored to use AgentStateMachine
├── buildGraph.ts               — Support candidate nodes
└── persistence.ts              — Add Decision[] storage
```

---

## Phase 1: MVP (idea + script stages)

### Task 1: Agent Types & State Machine Core

**Files:**
- Create: `src/pages/Canvas/agent/types.ts`
- Create: `src/pages/Canvas/agent/AgentStateMachine.ts`
- Test: `src/test/canvas-agent.test.ts`

- [ ] **Step 1: Write agent types**

```typescript
// src/pages/Canvas/agent/types.ts
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

export const INITIAL_STATE: AgentState = {
  stage: 'idea',
  step: 'greeting',
  ideaContext: {},
  focusedNodeId: null,
  previousStep: null,
  history: [],
  sceneIndex: 0,
  totalScenes: 0,
};
```

- [ ] **Step 2: Write failing test for state machine transitions**

```typescript
// src/test/canvas-agent.test.ts
import { describe, it, expect } from 'vitest';
import { AgentStateMachine } from '@/pages/Canvas/agent/AgentStateMachine';
import { INITIAL_STATE } from '@/pages/Canvas/agent/types';

describe('AgentStateMachine', () => {
  it('starts at idea/greeting', () => {
    const sm = new AgentStateMachine();
    expect(sm.state.stage).toBe('idea');
    expect(sm.state.step).toBe('greeting');
  });

  it('advances from greeting to ask_type on selectOption', () => {
    const sm = new AgentStateMachine();
    sm.advance(); // greeting → ask_type
    expect(sm.state.step).toBe('ask_type');
  });

  it('records decision and advances on selectOption', () => {
    const sm = new AgentStateMachine();
    sm.advance(); // → ask_type
    sm.selectOption('漫剧');
    expect(sm.state.ideaContext.type).toBe('漫剧');
    expect(sm.state.step).toBe('ask_style');
    expect(sm.state.history).toHaveLength(1);
    expect(sm.state.history[0].chosen).toBe('漫剧');
  });

  it('transitions from idea to script stage after all idea steps', () => {
    const sm = new AgentStateMachine();
    sm.advance(); // → ask_type
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
    expect(sm.state.previousStep).toEqual({ stage: 'idea', step: 'ask_style' });
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-agent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement AgentStateMachine**

```typescript
// src/pages/Canvas/agent/AgentStateMachine.ts
import type { AgentState, Stage, Step, Decision, IdeaContext } from './types';
import { INITIAL_STATE } from './types';

const IDEA_STEPS: Step[] = ['ask_type', 'ask_style', 'ask_duration', 'ask_audience'];
const IDEA_CONTEXT_KEYS: (keyof IdeaContext)[] = ['type', 'style', 'duration', 'audience'];

interface ProjectData {
  hasScript: boolean;
  hasShots: boolean;
  hasVoice: boolean;
  hasVideo: boolean;
}

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
    this.selectOption(cardId);
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-agent.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Canvas/agent/types.ts src/pages/Canvas/agent/AgentStateMachine.ts src/test/canvas-agent.test.ts
git commit -m "feat(canvas): add agent types and state machine core"
```

---

### Task 2: Agent Message Templates

**Files:**
- Create: `src/pages/Canvas/agent/AgentMessages.ts`
- Test: `src/test/canvas-agent-messages.test.ts`

- [ ] **Step 1: Write failing test for message generation**

```typescript
// src/test/canvas-agent-messages.test.ts
import { describe, it, expect } from 'vitest';
import { getAgentMessage } from '@/pages/Canvas/agent/AgentMessages';
import type { AgentState } from '@/pages/Canvas/agent/types';
import { INITIAL_STATE } from '@/pages/Canvas/agent/types';

describe('AgentMessages', () => {
  it('generates greeting message on initial state', () => {
    const msg = getAgentMessage(INITIAL_STATE);
    expect(msg.type).toBe('text');
    expect(msg.role).toBe('ai');
    expect(msg.text).toContain('你好');
  });

  it('generates options message for ask_type', () => {
    const state: AgentState = { ...INITIAL_STATE, step: 'ask_type' };
    const msg = getAgentMessage(state);
    expect(msg.type).toBe('options');
    expect(msg.options).toBeDefined();
    expect(msg.options!.length).toBeGreaterThanOrEqual(3);
  });

  it('generates options for ask_style with context-aware choices', () => {
    const state: AgentState = { ...INITIAL_STATE, step: 'ask_style', ideaContext: { type: '漫剧' } };
    const msg = getAgentMessage(state);
    expect(msg.type).toBe('options');
    expect(msg.options!.some((o) => o.label.includes('日系'))).toBe(true);
  });

  it('generates restore message with progress summary', () => {
    const state: AgentState = { ...INITIAL_STATE, stage: 'storyboard', step: 'generate_scene' };
    const msg = getAgentMessage(state, { projectName: '搞笑职场', scriptScenes: 5, shotCount: 0 });
    expect(msg.type).toBe('card-group');
    expect(msg.text).toContain('搞笑职场');
  });

  it('generates context-switch message for B mode', () => {
    const state: AgentState = { ...INITIAL_STATE, step: 'editing', focusedNodeId: 'shot-1' };
    const msg = getAgentMessage(state, { focusedNodeLabel: '镜头 1' });
    expect(msg.type).toBe('text');
    expect(msg.text).toContain('镜头 1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-agent-messages.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AgentMessages**

```typescript
// src/pages/Canvas/agent/AgentMessages.ts
import type { AgentState, ChatMessage, MessageType, CardOption } from './types';

interface MessageContext {
  projectName?: string;
  scriptScenes?: number;
  shotCount?: number;
  focusedNodeLabel?: string;
}

let msgCounter = 0;
function makeMsg(partial: Omit<ChatMessage, 'id' | 'role' | 'timestamp'>): ChatMessage {
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
      return getStoryboardMessage(state, ctx);
    case 'voice':
      return makeMsg({ type: 'action', text: '分镜已就绪！', action: { label: '一键配音', description: `${ctx?.shotCount ?? 0} 个镜头 · 预计 20 秒`, icon: '🎙' } });
    case 'video':
      return makeMsg({ type: 'action', text: '配音完成！', action: { label: '生成视频', description: '预计时长 1:30 · 1080p', icon: '🎬' } });
    default:
      return makeMsg({ type: 'text', text: '有什么我可以帮你的？' });
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
  if (ctx?.projectName && ctx.scriptScenes && state.step === 'generate_scene') {
    return makeMsg({
      type: 'card-group',
      text: `欢迎回来！「${ctx.projectName}」的进度：\n✅ 剧本 — ${ctx.scriptScenes} 场\n⬜ 分镜 — 未开始`,
      cards: [
        { id: 'continue', title: '继续', description: '生成分镜', emoji: '▶️' },
        { id: 'adjust', title: '调整剧本', description: '回到剧本编辑', emoji: '✏️' },
        { id: 'restart', title: '从头来过', description: '重新开始创作', emoji: '🔄' },
      ],
    });
  }
  switch (state.step) {
    case 'generate':
      return makeMsg({ type: 'progress', text: '正在构思剧本方向...', progress: { current: 0, total: 3, label: '生成中' } });
    case 'show_options':
      return makeMsg({ type: 'card-group', text: '为你准备了 3 个方向：', cards: [] });
    case 'expand':
      return makeMsg({ type: 'preview', text: '剧本已展开，确认后继续生成分镜：' });
    default:
      return makeMsg({ type: 'text', text: '继续创作剧本...' });
  }
}

function getStoryboardMessage(state: AgentState, ctx?: MessageContext): ChatMessage {
  if (ctx?.projectName && !ctx.shotCount && state.step === 'generate_scene') {
    return makeMsg({
      type: 'card-group',
      text: `欢迎回来！「${ctx.projectName}」的进度：\n✅ 剧本 — ${ctx.scriptScenes ?? 0} 场\n⬜ 分镜 — 未开始`,
      cards: [
        { id: 'continue', title: '继续', description: '生成分镜', emoji: '▶️' },
        { id: 'adjust', title: '调整剧本', description: '回到剧本编辑', emoji: '✏️' },
        { id: 'restart', title: '从头来过', description: '重新开始创作', emoji: '🔄' },
      ],
    });
  }
  switch (state.step) {
    case 'generate_scene':
      return makeMsg({ type: 'progress', text: `🎨 正在绘制第 ${state.sceneIndex + 1} 个镜头...`, progress: { current: state.sceneIndex, total: state.totalScenes, label: '生成分镜' } });
    case 'show_scene_options':
      return makeMsg({ type: 'card-group', text: `镜头 ${state.sceneIndex + 1} 有 3 种方案：`, cards: [] });
    case 'complete':
      return makeMsg({ type: 'text', text: '🎉 分镜全部完成！接下来可以配音或直接生成视频。' });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-agent-messages.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Canvas/agent/AgentMessages.ts src/test/canvas-agent-messages.test.ts
git commit -m "feat(canvas): add agent message templates for all stages"
```

---

### Task 3: Chat Message Type Components

**Files:**
- Create: `src/pages/Canvas/chat/MessageThinking.tsx`
- Create: `src/pages/Canvas/chat/MessageCardGroup.tsx`
- Create: `src/pages/Canvas/chat/MessageProgress.tsx`
- Create: `src/pages/Canvas/chat/MessageAction.tsx`
- Create: `src/pages/Canvas/chat/OptionPill.tsx`
- Test: `src/test/canvas-chat-messages.test.tsx`

- [ ] **Step 1: Write failing tests for message components**

```typescript
// src/test/canvas-chat-messages.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageThinking } from '@/pages/Canvas/chat/MessageThinking';
import { MessageCardGroup } from '@/pages/Canvas/chat/MessageCardGroup';
import { MessageProgress } from '@/pages/Canvas/chat/MessageProgress';
import { MessageAction } from '@/pages/Canvas/chat/MessageAction';
import { OptionPill } from '@/pages/Canvas/chat/OptionPill';

describe('MessageThinking', () => {
  it('renders thinking text and collapses on click', () => {
    render(<MessageThinking text="分析需求中..." collapsed={false} onToggle={() => {}} />);
    expect(screen.getByText(/分析需求中/)).toBeInTheDocument();
  });

  it('shows collapsed summary when collapsed', () => {
    render(<MessageThinking text="分析需求中..." collapsed={true} onToggle={() => {}} />);
    expect(screen.getByText(/💭/)).toBeInTheDocument();
  });
});

describe('MessageCardGroup', () => {
  const cards = [
    { id: '1', title: '悬疑', description: '紧张刺激', emoji: '🎭' },
    { id: '2', title: '搞笑', description: '轻松幽默', emoji: '😂' },
  ];

  it('renders all cards', () => {
    render(<MessageCardGroup cards={cards} onSelect={() => {}} />);
    expect(screen.getByText('悬疑')).toBeInTheDocument();
    expect(screen.getByText('搞笑')).toBeInTheDocument();
  });

  it('calls onSelect with card id', () => {
    const onSelect = vi.fn();
    render(<MessageCardGroup cards={cards} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('悬疑'));
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('shows selected state', () => {
    render(<MessageCardGroup cards={cards} onSelect={() => {}} selectedId="1" />);
    expect(screen.getByText(/已选择/)).toBeInTheDocument();
  });
});

describe('MessageProgress', () => {
  it('renders progress label and bar', () => {
    render(<MessageProgress current={3} total={8} label="正在绘制第 3/8 个镜头" />);
    expect(screen.getByText(/3\/8/)).toBeInTheDocument();
  });
});

describe('MessageAction', () => {
  it('renders action button with description', () => {
    render(<MessageAction label="一键配音" description="8 个镜头" icon="🎙" onClick={() => {}} />);
    expect(screen.getByText('一键配音')).toBeInTheDocument();
    expect(screen.getByText(/8 个镜头/)).toBeInTheDocument();
  });
});

describe('OptionPill', () => {
  it('renders label and fires onClick', () => {
    const onClick = vi.fn();
    render(<OptionPill label="日系动漫" value="日系动漫" onClick={onClick} />);
    fireEvent.click(screen.getByText('日系动漫'));
    expect(onClick).toHaveBeenCalledWith('日系动漫');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-chat-messages.test.tsx`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement OptionPill**

```tsx
// src/pages/Canvas/chat/OptionPill.tsx
interface OptionPillProps {
  label: string;
  value: string;
  onClick: (value: string) => void;
}

export function OptionPill({ label, value, onClick }: OptionPillProps) {
  return (
    <button
      className="text-[12px] px-3 py-1.5 rounded-full border border-border bg-card hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 active:scale-95"
      onClick={() => onClick(value)}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Implement MessageThinking**

```tsx
// src/pages/Canvas/chat/MessageThinking.tsx
interface MessageThinkingProps {
  text: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function MessageThinking({ text, collapsed, onToggle }: MessageThinkingProps) {
  if (collapsed) {
    return (
      <button onClick={onToggle} className="text-[11px] text-muted-foreground hover:text-foreground transition">
        💭 思考了几个方向...
      </button>
    );
  }

  return (
    <div
      className="border border-dashed border-border/60 rounded-lg px-3 py-2 mb-2 cursor-pointer hover:border-border transition"
      onClick={onToggle}
    >
      <p className="text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}
```

- [ ] **Step 5: Implement MessageCardGroup**

```tsx
// src/pages/Canvas/chat/MessageCardGroup.tsx
import type { CardOption } from '../agent/types';

interface MessageCardGroupProps {
  cards: CardOption[];
  onSelect: (id: string) => void;
  selectedId?: string;
}

export function MessageCardGroup({ cards, onSelect, selectedId }: MessageCardGroupProps) {
  if (selectedId) {
    const chosen = cards.find((c) => c.id === selectedId);
    return (
      <div className="text-[12px] text-muted-foreground">
        ✓ 已选择: {chosen?.emoji} {chosen?.title}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
      {cards.map((card) => (
        <button
          key={card.id}
          className="flex-shrink-0 w-[140px] snap-start bg-card border border-border rounded-xl p-3 text-left hover:border-primary/50 hover:shadow-md transition-all duration-200 active:scale-[0.97]"
          onClick={() => onSelect(card.id)}
        >
          {card.emoji && <div className="text-xl mb-1.5">{card.emoji}</div>}
          <div className="text-xs font-semibold mb-0.5">{card.title}</div>
          <div className="text-[10px] text-muted-foreground line-clamp-2">{card.description}</div>
          {card.thumbnail && (
            <img src={card.thumbnail} alt="" className="w-full h-16 object-cover rounded mt-2" />
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Implement MessageProgress**

```tsx
// src/pages/Canvas/chat/MessageProgress.tsx
interface MessageProgressProps {
  current: number;
  total: number;
  label: string;
}

export function MessageProgress({ current, total, label }: MessageProgressProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/70 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/70 text-right">{current}/{total}</p>
    </div>
  );
}
```

- [ ] **Step 7: Implement MessageAction**

```tsx
// src/pages/Canvas/chat/MessageAction.tsx
interface MessageActionProps {
  label: string;
  description: string;
  icon: string;
  onClick: () => void;
}

export function MessageAction({ label, description, icon, onClick }: MessageActionProps) {
  return (
    <button
      className="w-full bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-4 text-left hover:from-primary/15 hover:to-primary/10 transition-all duration-200 active:scale-[0.98]"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-[11px] text-muted-foreground">{description}</div>
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-chat-messages.test.tsx`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/pages/Canvas/chat/
git add src/test/canvas-chat-messages.test.tsx
git commit -m "feat(canvas): add rich message type components for chat panel"
```

---

### Task 4: Refactor ChatPanel to Use Message Types

**Files:**
- Modify: `src/pages/Canvas/chat/ChatPanel.tsx` (rewrite from `src/pages/Canvas/ChatPanel.tsx`)
- Test: `src/test/canvas-chatpanel.test.tsx`

- [ ] **Step 1: Write failing test for refactored ChatPanel**

```typescript
// src/test/canvas-chatpanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanel } from '@/pages/Canvas/chat/ChatPanel';
import type { ChatMessage } from '@/pages/Canvas/agent/types';

const baseProps = {
  messages: [] as ChatMessage[],
  onSendMessage: vi.fn(),
  onSelectOption: vi.fn(),
  onSelectCard: vi.fn(),
  onAction: vi.fn(),
  loading: false,
  contextIndicator: null as string | null,
  onExitContext: vi.fn(),
};

describe('ChatPanel (refactored)', () => {
  it('renders text messages as bubbles', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'ai', type: 'text', text: '你好！', timestamp: 1 },
    ];
    render(<ChatPanel {...baseProps} messages={messages} />);
    expect(screen.getByText('你好！')).toBeInTheDocument();
  });

  it('renders options messages with pills', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'ai', type: 'options', text: '选类型', options: [{ label: '漫剧', value: '漫剧' }], timestamp: 1 },
    ];
    render(<ChatPanel {...baseProps} messages={messages} />);
    expect(screen.getByText('漫剧')).toBeInTheDocument();
  });

  it('renders card-group messages', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'ai', type: 'card-group', text: '3 个方向', cards: [
        { id: 'a', title: '悬疑', description: '紧张', emoji: '🎭' },
      ], timestamp: 1 },
    ];
    render(<ChatPanel {...baseProps} messages={messages} />);
    expect(screen.getByText('悬疑')).toBeInTheDocument();
  });

  it('shows context indicator when in B mode', () => {
    render(<ChatPanel {...baseProps} contextIndicator="📍 正在编辑: 场景 3" />);
    expect(screen.getByText(/场景 3/)).toBeInTheDocument();
  });

  it('sends user input on Enter', () => {
    render(<ChatPanel {...baseProps} />);
    const input = screen.getByPlaceholderText(/说点什么/);
    fireEvent.change(input, { target: { value: '你好' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(baseProps.onSendMessage).toHaveBeenCalledWith('你好');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-chatpanel.test.tsx`
Expected: FAIL — module path changed

- [ ] **Step 3: Implement refactored ChatPanel**

Move `src/pages/Canvas/ChatPanel.tsx` → `src/pages/Canvas/chat/ChatPanel.tsx` and rewrite:

```tsx
// src/pages/Canvas/chat/ChatPanel.tsx
import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../agent/types';
import { MessageThinking } from './MessageThinking';
import { MessageCardGroup } from './MessageCardGroup';
import { MessageProgress } from './MessageProgress';
import { MessageAction } from './MessageAction';
import { OptionPill } from './OptionPill';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSelectOption: (value: string) => void;
  onSelectCard: (cardId: string) => void;
  onAction: (action: string) => void;
  loading: boolean;
  contextIndicator: string | null;
  onExitContext: () => void;
}

export function ChatPanel({
  messages, onSendMessage, onSelectOption, onSelectCard, onAction, loading, contextIndicator, onExitContext,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [collapsedThinking, setCollapsedThinking] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="w-[340px] border-l border-border flex flex-col bg-card/50 backdrop-blur">
      {contextIndicator && (
        <div className="px-4 py-2 bg-primary/5 border-b border-primary/20 flex items-center justify-between">
          <span className="text-xs text-primary">{contextIndicator}</span>
          <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={onExitContext}>
            返回主线
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'} rounded-2xl px-3.5 py-2.5`}>
              {msg.thinking && (
                <MessageThinking
                  text={msg.thinking}
                  collapsed={collapsedThinking.has(msg.id)}
                  onToggle={() => setCollapsedThinking((s) => { const n = new Set(s); n.has(msg.id) ? n.delete(msg.id) : n.add(msg.id); return n; })}
                />
              )}
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              {msg.type === 'options' && msg.options && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {msg.options.map((opt) => (
                    <OptionPill key={opt.value} label={opt.label} value={opt.value} onClick={onSelectOption} />
                  ))}
                </div>
              )}
              {msg.type === 'card-group' && msg.cards && (
                <div className="mt-2.5">
                  <MessageCardGroup cards={msg.cards} onSelect={onSelectCard} selectedId={msg.selectedCard} />
                </div>
              )}
              {msg.type === 'progress' && msg.progress && (
                <div className="mt-2">
                  <MessageProgress current={msg.progress.current} total={msg.progress.total} label={msg.progress.label} />
                </div>
              )}
              {msg.type === 'action' && msg.action && (
                <div className="mt-2.5">
                  <MessageAction label={msg.action.label} description={msg.action.description} icon={msg.action.icon} onClick={() => onAction(msg.action!.label)} />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl px-3.5 py-2.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.1s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="说点什么..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={loading}
          />
          <button className="text-xs text-primary font-medium disabled:opacity-40" onClick={handleSend} disabled={!input.trim() || loading}>
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-chatpanel.test.tsx`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Canvas/chat/ChatPanel.tsx src/test/canvas-chatpanel.test.tsx
git rm src/pages/Canvas/ChatPanel.tsx
git commit -m "refactor(canvas): move ChatPanel to chat/ dir with rich message type rendering"
```

---

### Task 5: Canvas Auto-Layout Hook

**Files:**
- Create: `src/pages/Canvas/canvas/useCanvasLayout.ts`
- Test: `src/test/canvas-layout.test.ts`

- [ ] **Step 1: Write failing test for auto-layout**

```typescript
// src/test/canvas-layout.test.ts
import { describe, it, expect } from 'vitest';
import { computeLayout } from '@/pages/Canvas/canvas/useCanvasLayout';
import type { Node } from '@xyflow/react';
import type { Stage } from '@/pages/Canvas/agent/types';

describe('computeLayout', () => {
  it('returns empty layout for idea stage with no nodes', () => {
    const result = computeLayout([], 'idea');
    expect(result).toEqual([]);
  });

  it('places script nodes in left column', () => {
    const nodes: Node[] = [
      { id: 'script-0', type: 'script', position: { x: 0, y: 0 }, data: {} },
      { id: 'script-1', type: 'script', position: { x: 0, y: 0 }, data: {} },
    ];
    const result = computeLayout(nodes, 'script');
    expect(result[0].position.x).toBe(0);
    expect(result[1].position.x).toBe(0);
    expect(result[1].position.y).toBeGreaterThan(result[0].position.y);
  });

  it('places AI node in center column', () => {
    const nodes: Node[] = [
      { id: 'script-0', type: 'script', position: { x: 0, y: 0 }, data: {} },
      { id: 'ai-gen', type: 'ai', position: { x: 0, y: 0 }, data: {} },
    ];
    const result = computeLayout(nodes, 'script');
    const aiNode = result.find((n) => n.id === 'ai-gen');
    expect(aiNode!.position.x).toBe(380);
  });

  it('places storyboard nodes in right column', () => {
    const nodes: Node[] = [
      { id: 'shot-1', type: 'storyboard', position: { x: 0, y: 0 }, data: {} },
      { id: 'shot-2', type: 'storyboard', position: { x: 0, y: 0 }, data: {} },
    ];
    const result = computeLayout(nodes, 'storyboard');
    expect(result[0].position.x).toBe(650);
    expect(result[1].position.x).toBe(650);
  });

  it('places candidate nodes side-by-side', () => {
    const nodes: Node[] = [
      { id: 'candidate-0', type: 'script', position: { x: 0, y: 0 }, data: { nodeStatus: 'candidate' } },
      { id: 'candidate-1', type: 'script', position: { x: 0, y: 0 }, data: { nodeStatus: 'candidate' } },
      { id: 'candidate-2', type: 'script', position: { x: 0, y: 0 }, data: { nodeStatus: 'candidate' } },
    ];
    const result = computeLayout(nodes, 'script');
    const xs = result.map((n) => n.position.x);
    expect(new Set(xs).size).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-layout.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement computeLayout**

```typescript
// src/pages/Canvas/canvas/useCanvasLayout.ts
import { useMemo } from 'react';
import type { Node } from '@xyflow/react';
import type { Stage } from '../agent/types';

const COL_X = { script: 0, ai: 380, storyboard: 650, video: 950, character: 350 };
const ROW_GAP = { script: 200, storyboard: 230, character: 200 };
const CANDIDATE_GAP_X = 200;

export function computeLayout(nodes: Node[], stage: Stage): Node[] {
  if (nodes.length === 0) return [];

  const scripts = nodes.filter((n) => n.type === 'script');
  const storyboards = nodes.filter((n) => n.type === 'storyboard');
  const characters = nodes.filter((n) => n.type === 'character');
  const ai = nodes.filter((n) => n.type === 'ai');
  const video = nodes.filter((n) => n.type === 'video');
  const candidates = nodes.filter((n) => (n.data as { nodeStatus?: string }).nodeStatus === 'candidate');
  const nonCandidates = nodes.filter((n) => (n.data as { nodeStatus?: string }).nodeStatus !== 'candidate');

  const positioned: Node[] = [];

  // Candidates: spread horizontally at their column position
  if (candidates.length > 0) {
    const baseX = candidates[0].type === 'script' ? COL_X.script : COL_X.storyboard;
    const totalWidth = (candidates.length - 1) * CANDIDATE_GAP_X;
    const startX = baseX - totalWidth / 2;
    candidates.forEach((n, i) => {
      positioned.push({ ...n, position: { x: startX + i * CANDIDATE_GAP_X, y: 100 } });
    });
  }

  // Non-candidates: column layout
  let scriptIdx = 0, shotIdx = 0, charIdx = 0;
  for (const node of nonCandidates) {
    if (node.type === 'script') {
      positioned.push({ ...node, position: { x: COL_X.script, y: scriptIdx * ROW_GAP.script } });
      scriptIdx++;
    } else if (node.type === 'storyboard') {
      positioned.push({ ...node, position: { x: COL_X.storyboard, y: shotIdx * ROW_GAP.storyboard } });
      shotIdx++;
    } else if (node.type === 'character') {
      positioned.push({ ...node, position: { x: COL_X.character + (charIdx % 2) * 180, y: -160 + Math.floor(charIdx / 2) * ROW_GAP.character } });
      charIdx++;
    } else if (node.type === 'ai') {
      const maxScripts = Math.max(scriptIdx, 1);
      positioned.push({ ...node, position: { x: COL_X.ai, y: ((maxScripts - 1) * ROW_GAP.script) / 2 } });
    } else if (node.type === 'video') {
      const maxShots = Math.max(shotIdx, 1);
      positioned.push({ ...node, position: { x: COL_X.video, y: ((maxShots - 1) * ROW_GAP.storyboard) / 2 } });
    } else {
      positioned.push(node);
    }
  }

  return positioned;
}

export function useCanvasLayout(nodes: Node[], stage: Stage): Node[] {
  return useMemo(() => computeLayout(nodes, stage), [nodes, stage]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-layout.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Canvas/canvas/useCanvasLayout.ts src/test/canvas-layout.test.ts
git commit -m "feat(canvas): add auto-layout hook for stage-aware node positioning"
```

---

### Task 6: Context Focus Hook (B Mode)

**Files:**
- Create: `src/pages/Canvas/canvas/useContextFocus.ts`
- Test: `src/test/canvas-context-focus.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/test/canvas-context-focus.test.ts
import { describe, it, expect } from 'vitest';
import { applyFocus } from '@/pages/Canvas/canvas/useContextFocus';
import type { Node } from '@xyflow/react';

describe('applyFocus', () => {
  const nodes: Node[] = [
    { id: 'script-0', type: 'script', position: { x: 0, y: 0 }, data: {} },
    { id: 'shot-1', type: 'storyboard', position: { x: 650, y: 0 }, data: {} },
    { id: 'shot-2', type: 'storyboard', position: { x: 650, y: 230 }, data: {} },
  ];

  it('returns nodes unchanged when no focus', () => {
    const result = applyFocus(nodes, null);
    expect(result).toEqual(nodes);
  });

  it('dims non-focused nodes', () => {
    const result = applyFocus(nodes, 'shot-1');
    const dimmed = result.filter((n) => n.id !== 'shot-1');
    dimmed.forEach((n) => {
      expect(n.style?.opacity).toBe(0.4);
    });
  });

  it('highlights focused node', () => {
    const result = applyFocus(nodes, 'shot-1');
    const focused = result.find((n) => n.id === 'shot-1');
    expect(focused!.style?.opacity).toBeUndefined();
    expect(focused!.className).toContain('ring');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-context-focus.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement applyFocus**

```typescript
// src/pages/Canvas/canvas/useContextFocus.ts
import { useMemo } from 'react';
import type { Node } from '@xyflow/react';

export function applyFocus(nodes: Node[], focusedNodeId: string | null): Node[] {
  if (!focusedNodeId) return nodes;

  return nodes.map((node) => {
    if (node.id === focusedNodeId) {
      return { ...node, className: 'ring-2 ring-primary ring-offset-2 scale-105 transition-all duration-300' };
    }
    return { ...node, style: { ...node.style, opacity: 0.4, transition: 'opacity 0.3s ease' } };
  });
}

export function useContextFocus(nodes: Node[], focusedNodeId: string | null): Node[] {
  return useMemo(() => applyFocus(nodes, focusedNodeId), [nodes, focusedNodeId]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-context-focus.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Canvas/canvas/useContextFocus.ts src/test/canvas-context-focus.test.ts
git commit -m "feat(canvas): add B-mode context focus hook (dim/highlight nodes)"
```

---

### Task 7: Empty State Component

**Files:**
- Create: `src/pages/Canvas/canvas/EmptyState.tsx`
- Test: `src/test/canvas-empty-state.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/test/canvas-empty-state.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/pages/Canvas/canvas/EmptyState';

describe('EmptyState', () => {
  it('shows project name', () => {
    render(<EmptyState projectName="搞笑职场" />);
    expect(screen.getByText('搞笑职场')).toBeInTheDocument();
  });

  it('shows guidance text', () => {
    render(<EmptyState projectName="搞笑职场" />);
    expect(screen.getByText(/右侧对话/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement EmptyState**

```tsx
// src/pages/Canvas/canvas/EmptyState.tsx
interface EmptyStateProps {
  projectName: string;
}

export function EmptyState({ projectName }: EmptyStateProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
      <h1 className="text-3xl font-bold text-foreground/80 mb-3">{projectName || '新项目'}</h1>
      <p className="text-sm text-muted-foreground">在右侧对话开始创作</p>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent" />
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-empty-state.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/Canvas/canvas/EmptyState.tsx src/test/canvas-empty-state.test.tsx
git commit -m "feat(canvas): add empty state component with project name and guidance"
```

---

### Task 8: Intent Classification API Client

**Files:**
- Modify: `src/lib/api/ai.ts` (add intent classification)
- Create: `src/pages/Canvas/agent/AgentIntentRouter.ts`
- Test: `src/test/canvas-intent-router.test.ts`

- [ ] **Step 1: Add intent.classify API to ai.ts**

Append to `src/lib/api/ai.ts`:

```typescript
// ---- Intent Classification ----

export type IntentType = 'continue' | 'skip' | 'modify' | 'back' | 'off_topic' | 'clarify';

export interface IntentClassifyInput {
  message: string;
  stage: string;
  step: string;
  context: string;
}

export interface IntentResult {
  intent: IntentType;
  params: Record<string, string>;
  confidence: number;
}

export async function classifyIntent(input: IntentClassifyInput): Promise<IntentResult> {
  return request<IntentResult>('/v1/ai/intent/classify', {
    method: 'POST',
    body: input,
    base: AI_BASE,
  });
}
```

- [ ] **Step 2: Write failing test for IntentRouter**

```typescript
// src/test/canvas-intent-router.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AgentIntentRouter } from '@/pages/Canvas/agent/AgentIntentRouter';
import { AgentStateMachine } from '@/pages/Canvas/agent/AgentStateMachine';
import * as aiApi from '@/lib/api/ai';

vi.mock('@/lib/api/ai', () => ({
  classifyIntent: vi.fn(),
}));

describe('AgentIntentRouter', () => {
  it('routes continue intent to selectOption', async () => {
    vi.mocked(aiApi.classifyIntent).mockResolvedValue({
      intent: 'continue',
      params: { value: '漫剧' },
      confidence: 0.95,
    });

    const sm = new AgentStateMachine();
    sm.advance(); // → ask_type
    const router = new AgentIntentRouter(sm);
    await router.processInput('我想做漫剧');

    expect(sm.state.ideaContext.type).toBe('漫剧');
  });

  it('routes modify intent to focusNode', async () => {
    vi.mocked(aiApi.classifyIntent).mockResolvedValue({
      intent: 'modify',
      params: { target_node: 'shot-1' },
      confidence: 0.9,
    });

    const sm = new AgentStateMachine();
    sm.advance();
    sm.selectOption('漫剧');
    const router = new AgentIntentRouter(sm);
    await router.processInput('改一下第一个镜头');

    expect(sm.state.focusedNodeId).toBe('shot-1');
  });

  it('routes off_topic intent without state change', async () => {
    vi.mocked(aiApi.classifyIntent).mockResolvedValue({
      intent: 'off_topic',
      params: {},
      confidence: 0.85,
    });

    const sm = new AgentStateMachine();
    sm.advance(); // → ask_type
    const router = new AgentIntentRouter(sm);
    const result = await router.processInput('今天天气怎么样');

    expect(result.handled).toBe(false);
    expect(sm.state.step).toBe('ask_type');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-intent-router.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement AgentIntentRouter**

```typescript
// src/pages/Canvas/agent/AgentIntentRouter.ts
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
    const context = this.sm.state.history.slice(-3).map((d) => `${d.stage}/${d.step}: ${d.chosen}`).join('; ');

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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-intent-router.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/ai.ts src/pages/Canvas/agent/AgentIntentRouter.ts src/test/canvas-intent-router.test.ts
git commit -m "feat(canvas): add intent classification API and router for free-form input"
```

---

### Task 9: Wire It All Together — Refactor Canvas index.tsx

**Files:**
- Modify: `src/pages/Canvas/index.tsx`
- Modify: `src/pages/Canvas/buildGraph.ts` (add nodeStatus support)

- [ ] **Step 1: Update buildGraph.ts to support nodeStatus**

Add `nodeStatus` to node data when building the graph. In `src/pages/Canvas/buildGraph.ts`, update the `buildCanvasGraph` function signature to accept a `candidateNodes` parameter:

```typescript
// Add to buildCanvasGraph params:
export function buildCanvasGraph(
  script: ScriptDTO | undefined,
  shots: ShotDTO[] | undefined,
  characters: AssetDTO[] | undefined,
  projectName: string,
  aiStatus: 'idle' | 'running' | 'done' | 'error' = 'idle',
  onRunAi?: () => void,
  projectId?: string | null,
  candidateNodes?: { id: string; type: string; data: Record<string, unknown> }[],
): { nodes: Node[]; edges: Edge[] } {
  // ... existing code ...

  // Add candidate nodes at the end (before return)
  if (candidateNodes) {
    candidateNodes.forEach((cn) => {
      nodes.push({
        id: cn.id,
        type: cn.type,
        position: { x: 0, y: 0 }, // useCanvasLayout will position them
        data: { ...cn.data, nodeStatus: 'candidate' },
      });
    });
  }

  return { nodes, edges };
}
```

- [ ] **Step 2: Rewrite Canvas index.tsx to integrate agent**

Replace `src/pages/Canvas/index.tsx` with the new version that uses `AgentStateMachine`, the new `ChatPanel`, `useCanvasLayout`, and `useContextFocus`:

```tsx
// src/pages/Canvas/index.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, MiniMap, addEdge,
  useNodesState, useEdgesState,
  type Connection, type NodeChange, type Node,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ScriptNode } from './nodes/ScriptNode';
import { StoryboardNode } from './nodes/StoryboardNode';
import { AINode } from './nodes/AINode';
import { VideoNode } from './nodes/VideoNode';
import { CharacterNode } from './nodes/CharacterNode';
import { ChatPanel } from './chat/ChatPanel';
import { EmptyState } from './canvas/EmptyState';
import { useCanvasLayout } from './canvas/useCanvasLayout';
import { useContextFocus } from './canvas/useContextFocus';
import { AgentStateMachine } from './agent/AgentStateMachine';
import { AgentIntentRouter } from './agent/AgentIntentRouter';
import { getAgentMessage, makeUserMessage } from './agent/AgentMessages';
import type { ChatMessage } from './agent/types';
import { useStore } from '@/store';
import { useScript, useShots } from '@/hooks/useScriptApi';
import { useAssets } from '@/hooks/useAssetApi';
import { useProjects } from '@/hooks/useProjectApi';
import { buildCanvasGraph } from './buildGraph';

const nodeTypes = { script: ScriptNode, storyboard: StoryboardNode, ai: AINode, video: VideoNode, character: CharacterNode };

function CanvasInner() {
  const projectId = useStore((s) => s.projectId);
  const projectName = useStore((s) => s.projectName);
  const setProjectId = useStore((s) => s.setProjectId);
  const setProjectName = useStore((s) => s.setProjectName);
  const { data: projects } = useProjects({ pageSize: 10 });
  const { data: script } = useScript(projectId ?? undefined);
  const { data: shots } = useShots(projectId ?? undefined);
  const { data: characters } = useAssets({ type: 'character' });

  // Agent state machine
  const smRef = useRef(new AgentStateMachine());
  const routerRef = useRef(new AgentIntentRouter(smRef.current));
  const [agentState, setAgentState] = useState(smRef.current.state);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const syncState = useCallback(() => setAgentState({ ...smRef.current.state }), []);

  // Initialize: restore from data or greeting
  useEffect(() => {
    if (!projectId) return;
    const hasScript = !!script?.content;
    const hasShots = (shots?.length ?? 0) > 0;
    if (hasScript || hasShots) {
      smRef.current.restore({ hasScript, hasShots, hasVoice: false, hasVideo: false });
    }
    syncState();
    const msg = getAgentMessage(smRef.current.state, {
      projectName, scriptScenes: script?.content?.split(/^#{1,3}\s/m).length ?? 0, shotCount: shots?.length ?? 0,
    });
    setMessages([msg]);
  }, [projectId, script, shots, projectName, syncState]);

  // Handle option selection
  const handleSelectOption = useCallback((value: string) => {
    smRef.current.selectOption(value);
    syncState();
    setMessages((m) => [...m, makeUserMessage(value), getAgentMessage(smRef.current.state)]);
  }, [syncState]);

  // Handle card selection
  const handleSelectCard = useCallback((cardId: string) => {
    smRef.current.selectCard(cardId);
    syncState();
    setMessages((m) => [...m, getAgentMessage(smRef.current.state)]);
  }, [syncState]);

  // Handle free-form input
  const handleSendMessage = useCallback(async (text: string) => {
    setMessages((m) => [...m, makeUserMessage(text)]);
    setLoading(true);
    const result = await routerRef.current.processInput(text);
    syncState();
    if (result.handled) {
      setMessages((m) => [...m, getAgentMessage(smRef.current.state)]);
    } else if (result.fallbackMessage) {
      setMessages((m) => [...m, { id: `msg-fb-${Date.now()}`, role: 'ai', type: 'text', text: result.fallbackMessage!, timestamp: Date.now() }]);
    }
    setLoading(false);
  }, [syncState]);

  // Handle action (voice/video one-click)
  const handleAction = useCallback((action: string) => {
    // TODO: wire to actual API calls in Phase 2/3
  }, []);

  // Node click → B mode
  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    smRef.current.focusNode(node.id);
    syncState();
    setMessages((m) => [...m, getAgentMessage(smRef.current.state, { focusedNodeLabel: (node.data as { title?: string }).title ?? node.id })]);
  }, [syncState]);

  const handleExitContext = useCallback(() => {
    smRef.current.exitFocus();
    syncState();
    setMessages((m) => [...m, { id: `msg-exit-${Date.now()}`, role: 'system', type: 'context-switch', text: '↩ 返回主线', timestamp: Date.now() }]);
  }, [syncState]);

  // Build graph
  const graph = useMemo(
    () => buildCanvasGraph(script, shots, characters?.data, projectName, 'idle', undefined, projectId),
    [script, shots, characters?.data, projectName, projectId],
  );

  // Apply layout + focus
  const layoutNodes = useCanvasLayout(graph.nodes, agentState.stage);
  const displayNodes = useContextFocus(layoutNodes, agentState.focusedNodeId);

  const [nodes, setNodes, onNodesChange] = useNodesState(displayNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  useEffect(() => { setNodes(displayNodes); }, [displayNodes, setNodes]);
  useEffect(() => { setEdges(graph.edges); }, [graph.edges, setEdges]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, animated: true }, eds));
  }, [setEdges]);

  const isEmpty = agentState.stage === 'idea' && !script?.content;
  const contextIndicator = agentState.focusedNodeId
    ? `📍 正在编辑: ${agentState.focusedNodeId}`
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative">
          {isEmpty && <EmptyState projectName={projectName} />}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background gap={24} size={1} className="!bg-background" />
            <MiniMap pannable zoomable className="!bg-card !border-border !rounded-lg !shadow-lg" />
          </ReactFlow>
        </div>
        <ChatPanel
          messages={messages}
          onSendMessage={handleSendMessage}
          onSelectOption={handleSelectOption}
          onSelectCard={handleSelectCard}
          onAction={handleAction}
          loading={loading}
          contextIndicator={contextIndicator}
          onExitContext={handleExitContext}
        />
      </div>
    </div>
  );
}

export default function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `cd /Users/aox/manju && pnpm build`
Expected: No TypeScript errors, build succeeds

- [ ] **Step 4: Run all canvas tests**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Canvas/index.tsx src/pages/Canvas/buildGraph.ts
git commit -m "feat(canvas): wire agent state machine, chat panel, layout, and focus into main canvas"
```

---

### Task 10: Decision Persistence

**Files:**
- Modify: `src/pages/Canvas/persistence.ts`
- Test: `src/test/canvas-persistence.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/test/canvas-persistence.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { saveDecisions, loadDecisions, clearDecisions } from '@/pages/Canvas/persistence';
import type { Decision } from '@/pages/Canvas/agent/types';

describe('Decision persistence', () => {
  beforeEach(() => { localStorage.clear(); });

  it('saves and loads decisions', () => {
    const decisions: Decision[] = [
      { stage: 'idea', step: 'ask_type', chosen: '漫剧', alternatives: ['真人', '动画'], timestamp: 1 },
    ];
    saveDecisions('proj-1', decisions);
    const loaded = loadDecisions('proj-1');
    expect(loaded).toEqual(decisions);
  });

  it('returns empty array for unknown project', () => {
    expect(loadDecisions('unknown')).toEqual([]);
  });

  it('clears decisions', () => {
    saveDecisions('proj-1', [{ stage: 'idea', step: 'ask_type', chosen: 'x', alternatives: [], timestamp: 1 }]);
    clearDecisions('proj-1');
    expect(loadDecisions('proj-1')).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement decision persistence**

Add to `src/pages/Canvas/persistence.ts`:

```typescript
import type { Decision } from './agent/types';

const DECISIONS_KEY_PREFIX = 'canvas-decisions-';

export function saveDecisions(projectId: string, decisions: Decision[]): void {
  localStorage.setItem(`${DECISIONS_KEY_PREFIX}${projectId}`, JSON.stringify(decisions));
}

export function loadDecisions(projectId: string): Decision[] {
  const raw = localStorage.getItem(`${DECISIONS_KEY_PREFIX}${projectId}`);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function clearDecisions(projectId: string): void {
  localStorage.removeItem(`${DECISIONS_KEY_PREFIX}${projectId}`);
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd /Users/aox/manju && pnpm test -- src/test/canvas-persistence.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/Canvas/persistence.ts src/test/canvas-persistence.test.ts
git commit -m "feat(canvas): add decision persistence to localStorage"
```

---

## Summary

| Task | What it does | Depends on |
|------|-------------|-----------|
| 1 | Agent types + state machine | — |
| 2 | Message templates | Task 1 |
| 3 | Chat message components | Task 1 (types) |
| 4 | ChatPanel refactor | Task 3, Task 2 |
| 5 | Auto-layout hook | Task 1 (types) |
| 6 | Context focus hook (B mode) | — |
| 7 | Empty state component | — |
| 8 | Intent router + API | Task 1 |
| 9 | Wire everything together | Tasks 1-8 |
| 10 | Decision persistence | Task 1 (types) |

Parallelizable: Tasks 1-3 can run in parallel (1 is dependency-free, 3 only needs types from 1). Tasks 5, 6, 7 are independent of each other.

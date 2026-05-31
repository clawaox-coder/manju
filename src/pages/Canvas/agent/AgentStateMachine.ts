import type { AgentState, Stage, Step } from './types';

export interface ProjectData {
  hasScript: boolean;
  hasShots: boolean;
  hasVoice: boolean;
  hasVideo: boolean;
}

// 退化为「阶段追踪器」：只维护当前 stage/step 与由项目数据派生的进度，
// 不再生产任何 user-facing 文案，也不再有 idea 阶段的固定问答分支。
// 全程对话由前端统一的 chat() 路径驱动（见 index.tsx 的 runAgentTurn）。
export const INITIAL_STATE: AgentState = {
  stage: 'idea',
  step: 'chatting',
  ideaContext: {},
  focusedNodeId: null,
};

// 每个 stage 的"生成中/进行中"步骤——进度展示与去重用。
const STAGE_BUSY_STEP: Record<Stage, Step> = {
  idea: 'chatting',
  script: 'generating',
  storyboard: 'generating',
  voice: 'matching',
  video: 'rendering',
};

export class AgentStateMachine {
  state: AgentState;

  constructor(initial?: AgentState) {
    this.state = initial ? { ...initial } : { ...INITIAL_STATE };
  }

  /** 合并 LLM 抽取出的创意设定（idea 阶段累积）。 */
  mergeIdeaContext(extracted: Record<string, string>): void {
    const clean = Object.fromEntries(
      Object.entries(extracted).filter(([, v]) => typeof v === 'string' && v.trim()),
    );
    if (Object.keys(clean).length === 0) return;
    this.state = { ...this.state, ideaContext: { ...this.state.ideaContext, ...clean } };
  }

  /** 进入某个 stage 的"进行中"步骤（触发制作动作时调用）。 */
  enterBusy(stage: Stage): void {
    this.state = { ...this.state, stage, step: STAGE_BUSY_STEP[stage] };
  }

  /** 标记当前 stage 的产物已就绪，进入 ready 步骤（停在本阶段等待对话）。 */
  markReady(stage: Stage): void {
    this.state = { ...this.state, stage, step: 'ready' };
  }

  /** 点选画布节点 → 记录聚焦目标（聚焦讨论交由 chat() 处理，不再写死台词）。 */
  focusNode(nodeId: string | null): void {
    this.state = { ...this.state, focusedNodeId: nodeId };
  }

  /** 依据项目已有数据恢复到正确阶段。 */
  restore(data: ProjectData): void {
    if (data.hasVideo) {
      this.state = { ...this.state, stage: 'video', step: 'ready' };
    } else if (data.hasVoice) {
      this.state = { ...this.state, stage: 'video', step: 'chatting' };
    } else if (data.hasShots) {
      this.state = { ...this.state, stage: 'voice', step: 'chatting' };
    } else if (data.hasScript) {
      this.state = { ...this.state, stage: 'storyboard', step: 'chatting' };
    } else {
      this.state = { ...this.state, stage: 'idea', step: 'chatting' };
    }
  }
}

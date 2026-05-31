import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Tldraw, useEditor, createShapeId, useValue } from 'tldraw';
import 'tldraw/tldraw.css';
import { Sparkles, FolderOpen, ArrowLeft } from 'lucide-react';
import { ChatPanel } from './chat/ChatPanel';
import { CanvasToolbar } from './CanvasToolbar';
import { AssetLibraryPanel } from './AssetLibraryPanel';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { AgentStateMachine } from './agent/AgentStateMachine';
import { makeUserMessage, makeAiMessage, makeProgressMessage, makeErrorAction, makeSystemMessage } from './agent/AgentMessages';
import type { ChatMessage, Stage } from './agent/types';
import { useStore } from '@/store';
import { useEffectiveTheme } from '@/hooks/useTheme';
import { useScript, useShots, useUpdateScript } from '@/hooks/useScriptApi';
import { useAssets } from '@/hooks/useAssetApi';
import { useProjects, useUpdateProject } from '@/hooks/useProjectApi';
import { voiceMatch, streamScriptContinue, storyboardGenerate, getAiTask, chat, generateTitle, type ChatTrigger } from '@/lib/api/ai';
import { createRender, getRender } from '@/lib/api/render';
import { buildCanvasGraph } from './buildGraph';

const RENDER_TERMINAL = ['done', 'failed', 'cancelled'];
const RENDER_POLL_MS = 2000;
const RENDER_TIMEOUT_MS = 120000;

async function pollRender(jobId: string, onSlow: () => void): Promise<{ ok: boolean; url: string | null }> {
  const start = Date.now();
  let warnedSlow = false;
  for (;;) {
    if (Date.now() - start > RENDER_TIMEOUT_MS) return { ok: false, url: null };
    if (!warnedSlow && Date.now() - start > 30000) { warnedSlow = true; onSlow(); }
    const job = await getRender(jobId);
    if (RENDER_TERMINAL.includes(job.status)) {
      return { ok: job.status === 'done', url: job.result_url };
    }
    await new Promise((r) => setTimeout(r, RENDER_POLL_MS));
  }
}

const AI_TASK_TERMINAL = ['done', 'succeeded', 'failed', 'error'];
const AI_TASK_POLL_MS = 2000;
const AI_TASK_TIMEOUT_MS = 90000;

const STAGE_LABELS = {
  idea: '找方向',
  script: '写剧本',
  storyboard: '做分镜',
  voice: '配声音',
  video: '出成片',
} as const;

// 每个 stage 只允许它对应的那一个制作动作（与后端 CHAT_SYSTEM 的白名单一致）。
// video 阶段不允许任何 trigger。前端据此对 LLM 返回的 trigger 做越权校验。
const STAGE_ALLOWED_ACTION: Record<Stage, ChatTrigger['action'] | null> = {
  idea: 'generate_script',
  script: 'generate_storyboard',
  storyboard: 'match_voice',
  voice: 'render_video',
  video: null,
};

async function genOutline(projectId: string, instruction: string): Promise<string> {
  let full = '';
  for await (const evt of streamScriptContinue({ project_id: projectId, context: '', instruction })) {
    if (evt.event === 'delta') full += (evt.data as { text?: string }).text ?? '';
  }
  return full.trim();
}

async function pollAiTask(taskId: string): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > AI_TASK_TIMEOUT_MS) return false;
    const task = await getAiTask(taskId);
    if (AI_TASK_TERMINAL.includes(task.status)) {
      return task.status === 'done' || task.status === 'succeeded';
    }
    await new Promise((r) => setTimeout(r, AI_TASK_POLL_MS));
  }
}

interface CanvasGraphNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: {
    title?: string;
    content?: string;
    name?: string;
    description?: string;
    dialog?: string;
    style?: string;
    duration?: string;
    status?: string;
  };
}

function stripShapePrefix(shapeId: string): string {
  return shapeId.replace(/^shape:/, '');
}


// Sync graph nodes to tldraw shapes
function CanvasSync({
  graph,
  onNodeSelect,
}: {
  graph: { nodes: CanvasGraphNode[] };
  onNodeSelect?: (nodeId: string) => void;
}) {
  const editor = useEditor();
  const syncedRef = useRef(new Set<string>());
  const selectedShapeIds = useValue('selectedShapeIds', () => editor.getSelectedShapeIds().map((id) => String(id)), [editor]);
  const lastSelectedRef = useRef<string | null>(null);
  const effectiveTheme = useEffectiveTheme();

  // 把有效明暗主题同步给 Tldraw 自己的 colorScheme，否则画布区不跟随 .dark。
  // 系统偏好监听由 useEffectiveTheme 统一处理，此处只消费结果。
  useEffect(() => {
    if (!editor) return;
    editor.user.updateUserPreferences({ colorScheme: effectiveTheme });
  }, [editor, effectiveTheme]);

  useEffect(() => {
    if (!editor || !graph.nodes.length) return;
    const existing = syncedRef.current;
    const currentIds = new Set(graph.nodes.map(n => n.id));

    // Remove shapes that no longer exist
    const toRemove = [...existing].filter(id => !currentIds.has(id));
    if (toRemove.length) {
      editor.deleteShapes(toRemove.map(id => createShapeId(id)));
    }

    // Create/update shapes
    for (const node of graph.nodes) {
      const shapeId = createShapeId(node.id);
      const label = node.data?.title || node.id;
      const nextX = node.position?.x ?? Math.random() * 800;
      const nextY = node.position?.y ?? Math.random() * 600;
      if (!existing.has(node.id)) {
        editor.createShape({
          id: shapeId,
          type: 'note',
          x: nextX,
          y: nextY,
          props: { text: label, size: 'm' },
        } as unknown as Parameters<typeof editor.createShape>[0]);
      } else {
        const shape = editor.getShape(shapeId);
        const currentText = typeof shape?.props === 'object' && shape?.props && 'text' in shape.props
          ? String(shape.props.text ?? '')
          : '';
        const shapeX = typeof shape?.x === 'number' ? shape.x : undefined;
        const shapeY = typeof shape?.y === 'number' ? shape.y : undefined;
        if (currentText !== label || shapeX !== nextX || shapeY !== nextY) {
          editor.updateShape({
            id: shapeId,
            type: 'note',
            x: nextX,
            y: nextY,
            props: { text: label, size: 'm' },
          } as unknown as Parameters<typeof editor.updateShape>[0]);
        }
      }
    }
    syncedRef.current = currentIds;
  }, [editor, graph.nodes]);

  useEffect(() => {
    if (!selectedShapeIds.length || !onNodeSelect) return;
    const nodeId = stripShapePrefix(selectedShapeIds[0]);
    if (lastSelectedRef.current === nodeId) return;
    lastSelectedRef.current = nodeId;
    onNodeSelect(nodeId);
  }, [onNodeSelect, selectedShapeIds]);

  return null;
}

function CanvasInner() {
  const location = useLocation();
  const projectId = useStore((s) => s.projectId);
  const projectName = useStore((s) => s.projectName);
  const setProjectId = useStore((s) => s.setProjectId);
  const setProjectName = useStore((s) => s.setProjectName);
  const { data: projects } = useProjects({ pageSize: 10 });
  const { data: script } = useScript(projectId ?? undefined);
  const { data: shots, refetch: refetchShots } = useShots(projectId ?? undefined);
  const { data: characters } = useAssets({ type: 'character' });
  const updateScript = useUpdateScript(projectId ?? '');
  const updateProject = useUpdateProject();
  // 阶段追踪器（稳定单例）——只追踪 stage/step 与创意设定，不生产对话文案。
  const [sm] = useState(() => new AgentStateMachine());
  const [agentState, setAgentState] = useState(sm.state);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // 会话一旦开始（用户说话、或从 showcase 带入灵感），init effect 就不再重置问候，
  // 否则会在数据延迟加载时冲掉正在进行的对话。
  const conversationStartedRef = useRef(false);
  const ideaKickedRef = useRef(false);
  // 标题只在第一句用户消息后生成一次。
  const titleGenStartedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);
  // 防止同一制作动作并发触发（trigger 可能在连续两轮里重复出现）。
  const busyRef = useRef(false);
  const syncState = useCallback(() => setAgentState({ ...sm.state }), [sm]);
  // Auto-select first project
  useEffect(() => {
    if (!projectId && projects?.data?.length) {
      const first = projects.data[0];
      setProjectId(first.id);
      setProjectName(first.name);
    }
  }, [projectId, projects, setProjectId, setProjectName]);

  // 初始化：依据项目已有数据恢复阶段；首条问候交由 chat() 在 idea 阶段产生，
  // 这里只在「有产物」时落一条进度态恢复提示，空项目则发一条欢迎语 turn。
  useEffect(() => {
    if (!projectId) return;
    if (conversationStartedRef.current) return;
    conversationStartedRef.current = true;
    const hasScript = !!script?.content;
    const hasShots = (shots?.length ?? 0) > 0;
    sm.restore({ hasScript, hasShots, hasVoice: false, hasVideo: false });
    syncState();
    setMessages([
      makeAiMessage('嗨，我是你的创作搭档。想做个什么样的短片？随便聊聊就行——一句灵感、一个画面，都可以。'),
    ]);
  }, [projectId, script, shots, syncState, sm]);

  // ---- 制作动作：由对话 trigger 显式触发，不再由状态机 step 监听自动跑。 ----
  // 每个都自带忙碌守卫，跑完用 markReady 落进度态 + 一条结果消息。

  // 剧本：用累积的创意设定生成大纲并直接保存为剧本（统一对话版不再做画布三选一，
  // 候选改由对话卡片承载——见 P3；此处先生成一个方向并保存，进入分镜。
  const runScriptGen = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('script'); syncState();
    setMessages((m) => [...m, makeProgressMessage('正在构思剧本...', '生成剧本')]);
    try {
      const { type = '漫剧', style = '日系动漫', tone, duration = '1分钟', audience = '年轻人' } = sm.state.ideaContext;
      const base = `用${type}形式、${style}风格创作一个短剧大纲（约${duration}，受众${audience}${tone ? `，${tone}基调` : ''}）。直接给出分场景大纲。`;
      const outline = await genOutline(projectId, base);
      const content = outline || '（生成为空）';
      await updateScript.mutateAsync({ content, expected_version_no: script?.version_no ?? 0 });
      sm.markReady('script'); syncState();
      setMessages((m) => [...m, makeAiMessage('剧本初稿好了，已经放到画布上。想调哪段、或者直接进分镜，告诉我就行。')]);
    } catch {
      sm.markReady('idea'); syncState();
      setMessages((m) => [...m, makeErrorAction('生成剧本时出错了。', '重试生成', '点击重新生成剧本')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState, updateScript, script]);

  const runStoryboardGen = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('storyboard'); syncState();
    setMessages((m) => [...m, makeProgressMessage('🎨 正在生成分镜...', '生成分镜')]);
    try {
      const style = sm.state.ideaContext.style ?? 'default';
      const res = await storyboardGenerate({ project_id: projectId, style, regenerate_all: true });
      const ok = await pollAiTask(res.task_id);
      if (!ok) throw new Error('storyboard task failed');
      await refetchShots();
      sm.markReady('storyboard'); syncState();
      setMessages((m) => [...m, makeAiMessage('分镜出来了，画布右侧能看到每一镜。要改某一镜，或者去配音都行。')]);
    } catch {
      sm.markReady('script'); syncState();
      setMessages((m) => [...m, makeErrorAction('生成分镜时出错了。', '重试生成', '点击重新生成分镜')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState, refetchShots]);

  const runVoiceMatch = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('voice'); syncState();
    setMessages((m) => [...m, makeProgressMessage('🎙 正在为角色匹配配音...', '配音匹配')]);
    try {
      const res = await voiceMatch({ project_id: projectId, content: script?.content ?? '', auto_assign: true });
      const n = res.matches?.length ?? 0;
      sm.markReady('voice'); syncState();
      setMessages((m) => [...m, makeAiMessage(`已为 ${n} 个角色匹配了配音。想换某个角色的声音、还是直接出片？`)]);
    } catch {
      sm.markReady('storyboard'); syncState();
      setMessages((m) => [...m, makeErrorAction('配音匹配失败。', '重试配音', '点击重新匹配')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState, script]);

  const runRender = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('video'); syncState();
    setMessages((m) => [...m, makeProgressMessage('🎬 正在渲染视频...', '渲染中')]);
    try {
      const job = await createRender(
        { project_id: projectId, resolution: '1080p', format: 'mp4' },
        `render-${projectId}-${Date.now()}`,
      );
      const result = await pollRender(job.job_id, () => {
        setMessages((m) => [...m, makeAiMessage('比预期久一点，还在渲染中...')]);
      });
      if (!result.ok) throw new Error('render failed');
      sm.markReady('video'); syncState();
      setMessages((m) => [...m, makeAiMessage('🎉 视频出来了！右上角可以预览或下载。想调哪段，点画布节点告诉我。')]);
    } catch {
      sm.markReady('voice'); syncState();
      setMessages((m) => [...m, makeErrorAction('渲染遇到问题。', '重试渲染', '点击重新生成视频')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState]);

  // trigger 越权校验：只执行「当前 stage 允许的那一个 action」，非法忽略。
  const executeTrigger = useCallback((trigger: ChatTrigger | null) => {
    if (!trigger) return;
    const allowed = STAGE_ALLOWED_ACTION[sm.state.stage];
    if (trigger.action !== allowed) return; // 越权 / video 阶段 → 忽略
    switch (trigger.action) {
      case 'generate_script': void runScriptGen(); break;
      case 'generate_storyboard': void runStoryboardGen(); break;
      case 'match_voice': void runVoiceMatch(); break;
      case 'render_video': void runRender(); break;
    }
  }, [sm, runScriptGen, runStoryboardGen, runVoiceMatch, runRender]);

  // 统一的对话一轮：全程任意 stage 都走这条 chat() 路径。后端依 stage 给出
  // 自然回应 + 动态 options + 可能的 trigger；前端 merge 设定、落消息、校验 trigger。
  const runAgentTurn = useCallback(async (pendingUserText?: string) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const history = messagesRef.current
        .filter((m) => m.role === 'user' || m.role === 'ai')
        .map((m) => ({ role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.text }))
        .filter((t) => t.content.trim());
      // 刚发出的这轮还没进 messagesRef（ref 在渲染后才更新），显式补上保证历史完整。
      if (pendingUserText?.trim()) {
        history.push({ role: 'user', content: pendingUserText.trim() });
      }
      const res = await chat({
        project_id: projectId,
        stage: sm.state.stage,
        messages: history,
        context: {
          has_script: !!script?.content,
          has_shots: (shots?.length ?? 0) > 0,
          has_voice: false,
          has_video: false,
          idea: sm.state.ideaContext as Record<string, string>,
        },
      });
      sm.mergeIdeaContext(res.extracted);
      setMessages((m) => [...m, makeAiMessage(res.reply, { thinking: res.thinking, options: res.options })]);
      executeTrigger(res.trigger);
    } catch {
      setMessages((m) => [...m, makeAiMessage('网络出了点问题，请再试一次。')]);
    } finally {
      setLoading(false);
    }
  }, [projectId, script, shots, sm, executeTrigger]);

  // 用户第一句话后，调 LLM 生成一个简短标题并存为项目名。只跑一次。
  // 若用户已经手动改过名字（非空且非默认占位），不覆盖。
  const maybeGenerateTitle = useCallback(async (firstUserText: string) => {
    if (titleGenStartedRef.current || !projectId) return;
    titleGenStartedRef.current = true;
    const current = (projectName || '').trim();
    const looksAuto = !current || current === '未命名项目' || current === '新建项目';
    if (!looksAuto) return;
    try {
      const { title } = await generateTitle({ message: firstUserText, project_id: projectId });
      const clean = title.trim();
      if (!clean) return;
      setProjectName(clean);
      await updateProject.mutateAsync({ id: projectId, input: { name: clean } });
    } catch {
      // 标题生成失败不影响主流程，静默忽略，保留原名。
    }
  }, [projectId, projectName, setProjectName, updateProject]);

  // 用户手动修改标题：乐观更新 store + 持久化到项目名。
  // 锁住 titleGenStartedRef，避免之后自动生成再覆盖用户手填的名字。
  const handleTitleChange = useCallback((next: string) => {
    const clean = next.trim();
    if (!clean || !projectId || clean === projectName) return;
    titleGenStartedRef.current = true;
    setProjectName(clean);
    void updateProject.mutateAsync({ id: projectId, input: { name: clean } });
  }, [projectId, projectName, setProjectName, updateProject]);

  // 从 showcase 带入的灵感：作为第一句用户消息喂给 agent，而非通用问候。只跑一次。
  useEffect(() => {
    const idea = (location.state as { idea?: string } | null)?.idea?.trim();
    if (!idea || ideaKickedRef.current || !projectId) return;
    if (sm.state.stage !== 'idea') return;
    ideaKickedRef.current = true;
    conversationStartedRef.current = true;
    // 清掉 nav state，刷新不再重放灵感。
    window.history.replaceState({}, '');
    queueMicrotask(() => {
      setMessages([makeUserMessage(idea)]);
      void maybeGenerateTitle(idea);
      void runAgentTurn(idea);
    });
  }, [location.state, projectId, sm, runAgentTurn, maybeGenerateTitle]);

  // 快捷回复点选 = 一次用户 turn，喂回统一对话。
  const handleSelectOption = useCallback((value: string) => {
    setMessages((m) => [...m, makeUserMessage(value)]);
    void runAgentTurn(value);
  }, [runAgentTurn]);

  // 自由输入：全程统一走 runAgentTurn（idea 阶段顺带生成标题）。
  const handleSendMessage = useCallback(async (text: string) => {
    setMessages((m) => [...m, makeUserMessage(text)]);
    if (sm.state.stage === 'idea') {
      void maybeGenerateTitle(text); // 首句话后顺带生成标题（幂等）
    }
    await runAgentTurn(text);
  }, [sm, runAgentTurn, maybeGenerateTitle]);

  // 动作消息（目前只剩「重试」类）：按当前 stage 重新触发对应制作。
  const handleAction = useCallback(() => {
    if (!projectId || busyRef.current) return;
    switch (sm.state.stage) {
      case 'idea':
      case 'script': void runScriptGen(); break;
      case 'storyboard': void runStoryboardGen(); break;
      case 'voice': void runVoiceMatch(); break;
      case 'video': void runRender(); break;
    }
  }, [projectId, sm, runScriptGen, runStoryboardGen, runVoiceMatch, runRender]);

  // 点选画布节点 → 记录聚焦目标，并发起一轮带 focus 上下文的对话（不再写死台词）。
  const handleNodeClick = useCallback((nodeId: string) => {
    sm.focusNode(nodeId);
    syncState();
    setMessages((m) => [...m, makeSystemMessage(`📍 聚焦：${nodeId}`)]);
    void runAgentTurn(`我想聊聊画布上的「${nodeId}」这个节点。`);
  }, [sm, syncState, runAgentTurn]);

  // Pick an asset from the library → drop a note for it at the viewport center.
  const handleAssetPick = useCallback((assetId: string, name: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    editor.createShape({
      id: createShapeId(`asset-${assetId}-${Math.round(performance.now())}`),
      type: 'note',
      x: center.x - 100,
      y: center.y - 100,
      props: { text: name, size: 'm' },
    } as unknown as Parameters<typeof editor.createShape>[0]);
    setAssetPanelOpen(false);
  }, []);

  // Build graph
  const graph = useMemo(
    () => buildCanvasGraph(script, shots, characters?.data, projectName, 'idle', undefined, projectId, undefined),
    [script, shots, characters?.data, projectName, projectId],
  );
  const suggestedPrompts = useMemo(() => {
    switch (agentState.stage) {
      case 'idea':
        return ['做一个 60 秒都市修仙漫剧', '我想要强冲突反转', '受众是 18-30 岁年轻人'];
      case 'script':
        return ['把第二个方向写得更热血', '前三秒要更抓人', '对白更短更利落'];
      case 'storyboard':
        return ['把第三镜改成特写', '整体风格偏电影感', '每个镜头时长再紧凑一点'];
      case 'voice':
        return ['主角声音更冷一点', '旁白更有压迫感', '配音节奏更快'];
      case 'video':
        return ['生成 1080p 视频', '节奏再快 10%', '给结尾加更强的停顿'];
      default:
        return ['继续创作'];
    }
  }, [agentState.stage]);
  return (
    <div className="h-screen flex">
      <ChatPanel
        messages={messages}
        onSendMessage={handleSendMessage}
        onSelectOption={handleSelectOption}
        onAction={handleAction}
        loading={loading}
        stage={STAGE_LABELS[agentState.stage]}
        suggestedPrompts={suggestedPrompts}
        title={projectName}
        onTitleChange={handleTitleChange}
      />
      <div className="flex-1 relative">
        <div className="absolute top-4 left-4 z-[300] flex items-center gap-3">
          <Link
            to="/home"
            title="返回首页"
            className="group flex items-center gap-2 rounded-xl border border-border bg-background/80 backdrop-blur-sm px-3 py-2 shadow-sm hover:bg-accent transition"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">漫剧AI</span>
          </Link>
          <span className="rounded-full border border-border bg-background/80 backdrop-blur-sm px-2.5 py-1 text-[11px] text-muted-foreground">
            {projectName || '未命名项目'}
          </span>
        </div>
        <div className="absolute top-4 right-4 z-[300] flex items-center rounded-xl border border-border bg-background/80 backdrop-blur-sm px-1.5 py-1 shadow-sm">
          <AccountMenu />
        </div>
        <button
          type="button"
          onClick={() => setAssetPanelOpen(true)}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 rounded-xl border border-border bg-background/80 backdrop-blur-sm px-3 py-2 shadow-sm text-sm hover:bg-accent transition"
        >
          <FolderOpen className="w-4 h-4 text-primary" />
          资产库
        </button>
        <Tldraw hideUi onMount={(editor) => { editorRef.current = editor; }}>
          <CanvasSync graph={graph} onNodeSelect={handleNodeClick} />
          <CanvasToolbar />
        </Tldraw>
        <AssetLibraryPanel
          open={assetPanelOpen}
          onClose={() => setAssetPanelOpen(false)}
          onPick={handleAssetPick}
        />
      </div>
    </div>
  );
}

export default function CanvasPage() {
  return <CanvasInner />;
}

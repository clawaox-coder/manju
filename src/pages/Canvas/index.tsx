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
import { AgentIntentRouter } from './agent/AgentIntentRouter';
import { getAgentMessage, makeUserMessage } from './agent/AgentMessages';
import type { ChatMessage } from './agent/types';
import { useStore } from '@/store';
import { useEffectiveTheme } from '@/hooks/useTheme';
import { useScript, useShots, useUpdateScript } from '@/hooks/useScriptApi';
import { useAssets } from '@/hooks/useAssetApi';
import { useProjects, useUpdateProject } from '@/hooks/useProjectApi';
import { voiceMatch, streamScriptContinue, storyboardGenerate, getAiTask, chat, generateTitle } from '@/lib/api/ai';
import { createRender, getRender } from '@/lib/api/render';
import { buildCanvasGraph } from './buildGraph';

type Role = 'ai' | 'system';
function msg(role: Role, text: string): ChatMessage {
  return { id: `msg-${role}-${Date.now()}-${Math.round(Math.random() * 1e6)}`, role, type: 'text', text, timestamp: Date.now() };
}

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
  // Agent state machine (stable singleton instances)
  const [sm] = useState(() => new AgentStateMachine());
  const [router] = useState(() => new AgentIntentRouter(sm));
  const [agentState, setAgentState] = useState(sm.state);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // Once the conversation has started (user typed, picked an option, or an idea
  // was carried in from the showcase), the init effect must stop re-seeding the
  // greeting on late data loads — otherwise it wipes the live conversation.
  const conversationStartedRef = useRef(false);
  const ideaKickedRef = useRef(false);
  // 标题只在第一句用户消息后生成一次。
  const titleGenStartedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<{ selectedId: string } | null>(null);
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);
  const [scriptCandidates, setScriptCandidates] = useState<{ title: string; content: string }[]>([]);
  const [selectedScript, setSelectedScript] = useState<string>('');
  const syncState = useCallback(() => setAgentState({ ...sm.state }), [sm]);
  // Auto-select first project
  useEffect(() => {
    if (!projectId && projects?.data?.length) {
      const first = projects.data[0];
      setProjectId(first.id);
      setProjectName(first.name);
    }
  }, [projectId, projects, setProjectId, setProjectName]);

  // Initialize: restore from data or greeting
  useEffect(() => {
    if (!projectId) return;
    if (conversationStartedRef.current) return;
    const hasScript = !!script?.content;
    const hasShots = (shots?.length ?? 0) > 0;
    if (hasScript || hasShots) {
      sm.restore({ hasScript, hasShots, hasVoice: false, hasVideo: false });
    } else {
      sm.advance();
    }
    syncState();
    const initMsg = getAgentMessage(sm.state, {
      projectName,
      scriptScenes: script?.content?.split(/^#{1,3}\s/m).length ?? 0,
      shotCount: shots?.length ?? 0,
    });
    setMessages([initMsg]);
  }, [projectId, script, shots, projectName, syncState, sm]);

  // Auto-advance storyboard/complete → voice offer
  useEffect(() => {
    if (agentState.stage === 'storyboard' && agentState.step === 'complete') {
      sm.proceedToVoice();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      syncState();
      setMessages((m) => [...m, getAgentMessage(sm.state, { shotCount: shots?.length ?? 0 })]);
    }
  }, [agentState.stage, agentState.step, sm, syncState, shots]);

  // Generate 3 real script-outline candidates (parallel) from the idea context
  const scriptGenStartedRef = useRef(false);
  useEffect(() => {
    if (agentState.stage !== 'script' || agentState.step !== 'generate' || !projectId) return;
    if (scriptGenStartedRef.current) return;
    scriptGenStartedRef.current = true;
    let cancelled = false;
    (async () => {
      const { type = '漫剧', style = '日系动漫', tone, duration = '1分钟', audience = '年轻人' } = sm.state.ideaContext;
      const base = `用${type}形式、${style}风格创作一个短剧大纲（约${duration}，受众${audience}${tone ? `，${tone}基调` : ''}）。直接给出分场景大纲。`;
      const dirs = [
        { title: '强冲突反转', extra: '走强冲突、结尾反转路线。' },
        { title: '轻松日常', extra: '走轻松幽默的日常喜剧路线。' },
        { title: '细腻情感', extra: '走细腻情感、人物弧光路线。' },
      ];
      try {
        const outlines = await Promise.all(dirs.map((d) => genOutline(projectId, base + d.extra)));
        if (cancelled) return;
        setScriptCandidates(outlines.map((c, i) => ({ title: dirs[i].title, content: c || '（生成为空）' })));
        sm.showScriptOptions();
        syncState();
      } catch {
        if (cancelled) return;
        setMessages((m) => [...m, { id: `msg-sgerr-${Date.now()}`, role: 'ai' as const, type: 'action' as const, text: '生成剧本时出错了。', action: { label: '重试生成', description: '点击重新生成剧本方向', icon: '↻' }, timestamp: Date.now() }]);
      }
    })();
    return () => { cancelled = true; };
  }, [agentState.stage, agentState.step, projectId, sm, syncState]);

  useEffect(() => {
    if (!(agentState.stage === 'script' && agentState.step === 'generate')) {
      scriptGenStartedRef.current = false;
    }
  }, [agentState.stage, agentState.step]);

  // Run the real storyboard generation on entering storyboard
  const storyboardGenStartedRef = useRef(false);
  useEffect(() => {
    if (agentState.stage !== 'storyboard' || agentState.step !== 'generate_scene' || !projectId) return;
    if (storyboardGenStartedRef.current) return;
    storyboardGenStartedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const style = sm.state.ideaContext.style ?? 'default';
        const res = await storyboardGenerate({ project_id: projectId, style, regenerate_all: true });
        const ok = await pollAiTask(res.task_id);
        if (cancelled) return;
        if (!ok) throw new Error('storyboard task failed');
        await refetchShots();
        sm.completeStoryboard();
        syncState();
      } catch {
        if (cancelled) return;
        setMessages((m) => [...m, { id: `msg-sberr-${Date.now()}`, role: 'ai' as const, type: 'action' as const, text: '生成分镜时出错了。', action: { label: '重试生成', description: '点击重新生成分镜', icon: '↻' }, timestamp: Date.now() }]);
      }
    })();
    return () => { cancelled = true; };
  }, [agentState.stage, agentState.step, projectId, sm, syncState, refetchShots]);

  useEffect(() => {
    if (!(agentState.stage === 'storyboard' && agentState.step === 'generate_scene')) {
      storyboardGenStartedRef.current = false;
    }
  }, [agentState.stage, agentState.step]);

  // Run one agent turn for the free-form idea stage. The backend LLM agent
  // analyzes the conversation, returns a natural reply + dynamically-generated
  // quick-reply options, extracts idea settings, and may trigger script gen.
  const runIdeaAgentTurn = useCallback(async (pendingUserText?: string) => {
    setLoading(true);
    try {
      const history = messagesRef.current
        .filter((m) => m.role === 'user' || m.role === 'ai')
        .map((m) => ({ role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.text }))
        .filter((t) => t.content.trim());
      // The just-sent turn isn't in messagesRef yet (ref updates post-render),
      // so append it explicitly to keep the agent's history complete.
      if (pendingUserText?.trim()) {
        history.push({ role: 'user', content: pendingUserText.trim() });
      }
      const res = await chat({
        project_id: projectId,
        stage: 'idea',
        messages: history,
        context: {
          has_script: !!script?.content,
          has_shots: (shots?.length ?? 0) > 0,
          idea: sm.state.ideaContext as Record<string, string>,
        },
      });
      sm.mergeIdeaContext(res.extracted);
      setMessages((m) => [...m, {
        id: `msg-ai-${Date.now()}`,
        role: 'ai' as const,
        type: 'text' as const,
        text: res.reply,
        thinking: res.thinking || undefined,
        options: res.options?.length ? res.options : undefined,
        timestamp: Date.now(),
      }]);
      if (res.trigger?.action === 'generate_script') {
        sm.beginScriptGen();
        syncState();
      }
    } catch {
      setMessages((m) => [...m, { id: `msg-err-${Date.now()}`, role: 'ai' as const, type: 'text' as const, text: '网络出了点问题，请再试一次。', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [projectId, script, shots, sm, syncState]);

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

  // Idea carried in from the showcase: seed it as the first user turn and let
  // the agent respond, instead of showing the generic greeting. Runs once.
  useEffect(() => {
    const idea = (location.state as { idea?: string } | null)?.idea?.trim();
    if (!idea || ideaKickedRef.current || !projectId) return;
    if (sm.state.stage !== 'idea') return;
    ideaKickedRef.current = true;
    conversationStartedRef.current = true;
    // Clear the nav state so a refresh doesn't replay the idea.
    window.history.replaceState({}, '');
    // Defer state updates out of the effect's synchronous phase.
    queueMicrotask(() => {
      setMessages([makeUserMessage(idea)]);
      void maybeGenerateTitle(idea);
      void runIdeaAgentTurn(idea);
    });
  }, [location.state, projectId, sm, runIdeaAgentTurn, maybeGenerateTitle]);

  // Handle option selection
  const handleSelectOption = useCallback((value: string) => {
    if (sm.state.step === 'editing') {
      if (value === 'exit_focus') {
        sm.exitFocus();
        syncState();
        setMessages((m) => [...m, { id: `msg-exit-${Date.now()}`, role: 'system' as const, type: 'context-switch' as const, text: '↩ 返回主线', timestamp: Date.now() }]);
        return;
      }
      sm.applyEditAction(value as 'change_style' | 'edit_content' | 'regenerate');
      syncState();
      const ack: Record<string, string> = {
        change_style: '好，告诉我想要的新风格，我来重新生成。',
        edit_content: '好，说说要怎么改，我来调整。',
        regenerate: '正在重新生成这个节点...',
      };
      setMessages((m) => [...m, makeUserMessage(value), { id: `msg-edit-${Date.now()}`, role: 'ai' as const, type: 'text' as const, text: ack[value] ?? '好的。', timestamp: Date.now() }]);
      return;
    }
    // Idea stage: a quick-reply pick is just a user turn fed back to the agent.
    if (sm.state.stage === 'idea') {
      setMessages((m) => [...m, makeUserMessage(value)]);
      void runIdeaAgentTurn(value);
      return;
    }
    sm.selectOption(value);
    syncState();
    setMessages((m) => [...m, makeUserMessage(value), getAgentMessage(sm.state)]);
  }, [syncState, sm, runIdeaAgentTurn]);

  // Handle free-form input
  const handleSendMessage = useCallback(async (text: string) => {
    setMessages((m) => [...m, makeUserMessage(text)]);
    // Idea stage is fully agent-driven (natural conversation + dynamic options).
    if (sm.state.stage === 'idea') {
      // 首句话后顺带生成标题（幂等，内部自己守一次）。
      void maybeGenerateTitle(text);
      await runIdeaAgentTurn(text);
      return;
    }
    // Later stages: classify intent and route through the deterministic flow.
    setLoading(true);
    try {
      const result = await router.processInput(text);
      syncState();
      if (result.handled) {
        setMessages((m) => [...m, getAgentMessage(sm.state)]);
      } else if (result.fallbackMessage) {
        setMessages((m) => [...m, { id: `msg-fb-${Date.now()}`, role: 'ai' as const, type: 'text' as const, text: result.fallbackMessage!, timestamp: Date.now() }]);
      }
    } catch {
      setMessages((m) => [...m, { id: `msg-err-${Date.now()}`, role: 'ai' as const, type: 'text' as const, text: '网络出了点问题，请再试一次。', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [syncState, sm, router, runIdeaAgentTurn, maybeGenerateTitle]);

  // Handle action (script confirm / voice / video one-click)
  const handleAction = useCallback(async (action: string) => {
    if (!projectId || loading) return;

    if (sm.state.stage === 'script' && sm.state.step === 'expand') {
      setMessages((m) => [...m, makeUserMessage(action)]);
      setLoading(true);
      try {
        await updateScript.mutateAsync({ content: selectedScript, expected_version_no: script?.version_no ?? 0 });
        sm.confirm();
        syncState();
        setMessages((m) => [...m, msg('ai', '✅ 剧本已保存，开始生成分镜...'), getAgentMessage(sm.state)]);
      } catch {
        setMessages((m) => [...m, { id: `msg-saverr-${Date.now()}`, role: 'ai' as const, type: 'action' as const, text: '保存剧本失败。', action: { label: '重试保存', description: '点击重新保存', icon: '↻' }, timestamp: Date.now() }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (sm.state.stage === 'voice') {
      sm.startVoiceMatch();
      syncState();
      setMessages((m) => [...m, makeUserMessage(action), getAgentMessage(sm.state)]);
      setLoading(true);
      try {
        const res = await voiceMatch({ project_id: projectId, content: script?.content ?? '', auto_assign: true });
        sm.completeVoice();
        syncState();
        const n = res.matches?.length ?? 0;
        setMessages((m) => [...m, msg('ai', `✅ 已为 ${n} 个角色匹配配音。`), getAgentMessage(sm.state)]);
      } catch {
        setMessages((m) => [...m, { id: `msg-verr-${Date.now()}`, role: 'ai' as const, type: 'action' as const, text: '配音匹配失败。', action: { label: '重试配音', description: '点击重新匹配', icon: '↻' }, timestamp: Date.now() }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (sm.state.stage === 'video') {
      sm.startRender();
      syncState();
      setMessages((m) => [...m, makeUserMessage(action), getAgentMessage(sm.state)]);
      setLoading(true);
      try {
        const job = await createRender(
          { project_id: projectId, resolution: '1080p', format: 'mp4' },
          `render-${projectId}-${Date.now()}`,
        );
        const result = await pollRender(job.job_id, () => {
          setMessages((m) => [...m, msg('ai', '比预期久一点，还在渲染中...')]);
        });
        if (result.ok) {
          sm.completeRender();
          syncState();
          setMessages((m) => [...m, getAgentMessage(sm.state)]);
        } else {
          throw new Error('render failed');
        }
      } catch {
        setMessages((m) => [...m, { id: `msg-rerr-${Date.now()}`, role: 'ai' as const, type: 'action' as const, text: '渲染遇到问题。', action: { label: '重试渲染', description: '点击重新生成视频', icon: '↻' }, timestamp: Date.now() }]);
      } finally {
        setLoading(false);
      }
      return;
    }
  }, [projectId, loading, script, sm, syncState, updateScript, selectedScript]);

  // Handle node click (simplified for tldraw - used for script candidate selection)
  const handleNodeClick = useCallback((nodeId: string) => {
    const isCandidate = nodeId.startsWith('candidate-');
    const inSelectionStep = sm.state.stage === 'script' && sm.state.step === 'show_options';

    if (isCandidate) {
      if (!inSelectionStep || selection) return;
      const idx = parseInt(nodeId.match(/(\d+)$/)?.[1] ?? '0', 10);
      const chosen = scriptCandidates[idx]?.content ?? '';
      setSelection({ selectedId: nodeId });
      window.setTimeout(() => {
        setSelectedScript(chosen);
        sm.selectCard(nodeId);
        syncState();
        setSelection(null);
        setMessages((m) => [...m, getAgentMessage(sm.state, { scriptPreview: chosen })]);
      }, 500);
      return;
    }

    sm.focusNode(nodeId);
    syncState();
    setMessages((m) => [...m, getAgentMessage(sm.state, { focusedNodeLabel: nodeId })]);
  }, [sm, syncState, selection, scriptCandidates]);

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

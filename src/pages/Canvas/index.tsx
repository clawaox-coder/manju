import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ScriptNode } from './ScriptNode';
import { StoryboardNode } from './StoryboardNode';
import { AINode } from './AINode';
import { VideoNode } from './VideoNode';
import { CharacterNode } from './CharacterNode';
import { ChatPanel } from './chat/ChatPanel';
import { EmptyState } from './canvas/EmptyState';
import { useCanvasLayout } from './canvas/useCanvasLayout';
import { useContextFocus } from './canvas/useContextFocus';
import { EXIT_DURATION_S } from './canvas/nodeMotion';
import { AgentStateMachine } from './agent/AgentStateMachine';
import { AgentIntentRouter } from './agent/AgentIntentRouter';
import { getAgentMessage, makeUserMessage } from './agent/AgentMessages';
import type { ChatMessage } from './agent/types';
import { useStore } from '@/store';
import { useScript, useShots, useUpdateScript } from '@/hooks/useScriptApi';
import { useAssets } from '@/hooks/useAssetApi';
import { useProjects } from '@/hooks/useProjectApi';
import { voiceMatch, streamScriptContinue, storyboardGenerate, getAiTask } from '@/lib/api/ai';
import { createRender, getRender } from '@/lib/api/render';
import { buildCanvasGraph } from './buildGraph';

const nodeTypes = {
  script: ScriptNode,
  storyboard: StoryboardNode,
  ai: AINode,
  video: VideoNode,
  character: CharacterNode,
};

type Role = 'ai' | 'system';
function msg(role: Role, text: string): ChatMessage {
  return { id: `msg-${role}-${Date.now()}-${Math.round(Math.random() * 1e6)}`, role, type: 'text', text, timestamp: Date.now() };
}

const RENDER_TERMINAL = ['done', 'failed', 'cancelled'];
const RENDER_POLL_MS = 2000;
const RENDER_TIMEOUT_MS = 120000;

// Poll render job until terminal or timeout. onSlow fires once if it exceeds 30s.
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

// Consume an SSE script-continue stream into its full text.
async function genOutline(projectId: string, instruction: string): Promise<string> {
  let full = '';
  for await (const evt of streamScriptContinue({ project_id: projectId, context: '', instruction })) {
    if (evt.event === 'delta') full += (evt.data as { text?: string }).text ?? '';
  }
  return full.trim();
}

// Poll an async AI task (e.g. storyboard.generate) until terminal or timeout.
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

function CanvasInner() {
  const projectId = useStore((s) => s.projectId);
  const projectName = useStore((s) => s.projectName);
  const setProjectId = useStore((s) => s.setProjectId);
  const setProjectName = useStore((s) => s.setProjectName);
  const { data: projects } = useProjects({ pageSize: 10 });
  const { data: script } = useScript(projectId ?? undefined);
  const { data: shots, refetch: refetchShots } = useShots(projectId ?? undefined);
  const { data: characters } = useAssets({ type: 'character' });
  const updateScript = useUpdateScript(projectId ?? '');

  // Agent state machine (stable singleton instances)
  const [sm] = useState(() => new AgentStateMachine());
  const [router] = useState(() => new AgentIntentRouter(sm));
  const [agentState, setAgentState] = useState(sm.state);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  // Holds the chosen candidate id during the exit-animation window so unchosen
  // candidates can fade out before the state machine advances and removes them.
  const [selection, setSelection] = useState<{ selectedId: string } | null>(null);
  // Real AI-generated script outline candidates + the chosen one (for expand/save).
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
    const hasScript = !!script?.content;
    const hasShots = (shots?.length ?? 0) > 0;
    if (hasScript || hasShots) {
      sm.restore({ hasScript, hasShots, hasVoice: false, hasVideo: false });
    } else {
      sm.advance();
    }
    syncState(); // eslint-disable-line react-hooks/set-state-in-effect
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
      syncState(); // eslint-disable-line react-hooks/set-state-in-effect
      setMessages((m) => [...m, getAgentMessage(sm.state, { shotCount: shots?.length ?? 0 })]);
    }
  }, [agentState.stage, agentState.step, sm, syncState, shots]);

  // Generate 3 real script-outline candidates (parallel) from the idea context,
  // then reveal them on the canvas for selection.
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

  // Reset the script-generation guard when leaving the generate step.
  useEffect(() => {
    if (!(agentState.stage === 'script' && agentState.step === 'generate')) {
      scriptGenStartedRef.current = false;
    }
  }, [agentState.stage, agentState.step]);

  // Run the real storyboard generation (single style) on entering storyboard.
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

  // Handle option selection
  const handleSelectOption = useCallback((value: string) => {
    // B-mode editing options route differently
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
    sm.selectOption(value);
    syncState();
    setMessages((m) => [...m, makeUserMessage(value), getAgentMessage(sm.state)]);
  }, [syncState, sm]);

  // Handle card selection
  const handleSelectCard = useCallback((cardId: string) => {
    sm.selectCard(cardId);
    syncState();
    setMessages((m) => [...m, getAgentMessage(sm.state)]);
  }, [syncState, sm]);

  // Handle free-form input
  const handleSendMessage = useCallback(async (text: string) => {
    setMessages((m) => [...m, makeUserMessage(text)]);
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
  }, [syncState, sm, router]);

  // Handle action (script confirm / voice / video one-click)
  const handleAction = useCallback(async (action: string) => {
    if (!projectId || loading) return;

    if (sm.state.stage === 'script' && sm.state.step === 'expand') {
      setMessages((m) => [...m, makeUserMessage(action)]);
      setLoading(true);
      try {
        await updateScript.mutateAsync({ content: selectedScript, expected_version_no: script?.version_no ?? 0 });
        sm.confirm(); // expand → storyboard/generate_scene
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

  // Node click → either script candidate selection (with fade-out) or B-mode focus
  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    const isCandidate = node.id.startsWith('candidate-');
    const inSelectionStep = sm.state.stage === 'script' && sm.state.step === 'show_options';

    if (isCandidate) {
      if (!inSelectionStep || selection) return; // ignore stray clicks / mid-animation
      const idx = parseInt(node.id.match(/(\d+)$/)?.[1] ?? '0', 10);
      const chosen = scriptCandidates[idx]?.content ?? '';
      setSelection({ selectedId: node.id });
      window.setTimeout(() => {
        setSelectedScript(chosen);
        sm.selectCard(node.id);
        syncState();
        setSelection(null);
        setMessages((m) => [...m, getAgentMessage(sm.state, { scriptPreview: chosen })]);
      }, EXIT_DURATION_S * 1000 + 60);
      return;
    }

    sm.focusNode(node.id);
    syncState();
    setMessages((m) => [...m, getAgentMessage(sm.state, { focusedNodeLabel: (node.data as { title?: string }).title ?? node.id })]);
  }, [sm, syncState, selection, scriptCandidates]);

  const handleExitContext = useCallback(() => {
    sm.exitFocus();
    syncState();
    setMessages((m) => [...m, { id: `msg-exit-${Date.now()}`, role: 'system' as const, type: 'context-switch' as const, text: '↩ 返回主线', timestamp: Date.now() }]);
  }, [syncState, sm]);

  // Compute candidate nodes for the script selection step. During the exit
  // window (selection set), the chosen node becomes 'selected', rest 'leaving'.
  const candidateNodes = useMemo(() => {
    if (agentState.stage !== 'script' || agentState.step !== 'show_options') return undefined;
    const statusFor = (cid: string): 'candidate' | 'selected' | 'leaving' => {
      if (!selection) return 'candidate';
      return cid === selection.selectedId ? 'selected' : 'leaving';
    };
    return scriptCandidates.map((c, i) => {
      const cid = `candidate-script-${i}`;
      return { id: cid, type: 'script', data: { sceneNumber: i + 1, title: c.title, content: c.content, nodeStatus: statusFor(cid) } };
    });
  }, [agentState.stage, agentState.step, selection, scriptCandidates]);

  // Build graph
  const graph = useMemo(
    () => buildCanvasGraph(script, shots, characters?.data, projectName, 'idle', undefined, projectId, candidateNodes),
    [script, shots, characters?.data, projectName, projectId, candidateNodes],
  );

  // Apply layout + focus
  const layoutNodes = useCanvasLayout(graph.nodes);
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
            fitViewOptions={{ maxZoom: 1, padding: 0.25 }}
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
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useScript, useShots } from '@/hooks/useScriptApi';
import { useAssets } from '@/hooks/useAssetApi';
import { useProjects } from '@/hooks/useProjectApi';
import { voiceMatch } from '@/lib/api/ai';
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

function CanvasInner() {
  const projectId = useStore((s) => s.projectId);
  const projectName = useStore((s) => s.projectName);
  const setProjectId = useStore((s) => s.setProjectId);
  const setProjectName = useStore((s) => s.setProjectName);
  const { data: projects } = useProjects({ pageSize: 10 });
  const { data: script } = useScript(projectId ?? undefined);
  const { data: shots } = useShots(projectId ?? undefined);
  const { data: characters } = useAssets({ type: 'character' });

  // Agent state machine (stable singleton instances)
  const [sm] = useState(() => new AgentStateMachine());
  const [router] = useState(() => new AgentIntentRouter(sm));
  const [agentState, setAgentState] = useState(sm.state);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  // Holds the chosen candidate id during the exit-animation window so unchosen
  // candidates can fade out before the state machine advances and removes them.
  const [selection, setSelection] = useState<{ selectedId: string } | null>(null);

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

  // Reveal script option candidates after "generation".
  // (Placeholder timing stands in for the AI options call; candidates carry
  // placeholder content until that API is wired.)
  useEffect(() => {
    if (agentState.stage !== 'script' || agentState.step !== 'generate') return;
    const t = window.setTimeout(() => {
      sm.showScriptOptions();
      syncState();
    }, 900);
    return () => window.clearTimeout(t);
  }, [agentState.stage, agentState.step, sm, syncState]);

  // Reveal storyboard scene candidates after "generation", looping per scene.
  useEffect(() => {
    if (agentState.stage !== 'storyboard' || agentState.step !== 'generate_scene') return;
    if (agentState.totalScenes === 0) {
      const count = Math.max(1, script?.content?.match(/^#{1,3}\s/gm)?.length ?? 3);
      sm.setTotalScenes(count);
      syncState(); // eslint-disable-line react-hooks/set-state-in-effect
    }
    const t = window.setTimeout(() => {
      sm.showSceneOptions();
      syncState();
    }, 900);
    return () => window.clearTimeout(t);
  }, [agentState.stage, agentState.step, agentState.totalScenes, sm, syncState, script]);

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

  // Handle action (voice/video one-click)
  const handleAction = useCallback(async (action: string) => {
    if (!projectId || loading) return;

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
  }, [projectId, loading, script, sm, syncState]);

  // Node click → either candidate selection (with fade-out) or B-mode focus
  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    const isCandidate = node.id.startsWith('candidate-');
    const inSelectionStep =
      (sm.state.stage === 'script' && sm.state.step === 'show_options') ||
      (sm.state.stage === 'storyboard' && sm.state.step === 'show_scene_options');

    if (isCandidate) {
      if (!inSelectionStep || selection) return; // ignore stray clicks / mid-animation
      setSelection({ selectedId: node.id });
      window.setTimeout(() => {
        sm.selectCard(node.id);
        syncState();
        setSelection(null);
        setMessages((m) => [...m, getAgentMessage(sm.state)]);
      }, EXIT_DURATION_S * 1000 + 60);
      return;
    }

    sm.focusNode(node.id);
    syncState();
    setMessages((m) => [...m, getAgentMessage(sm.state, { focusedNodeLabel: (node.data as { title?: string }).title ?? node.id })]);
  }, [sm, syncState, selection]);

  const handleExitContext = useCallback(() => {
    sm.exitFocus();
    syncState();
    setMessages((m) => [...m, { id: `msg-exit-${Date.now()}`, role: 'system' as const, type: 'context-switch' as const, text: '↩ 返回主线', timestamp: Date.now() }]);
  }, [syncState, sm]);

  // Compute candidate nodes for selection steps. During the exit window
  // (selection set), the chosen node becomes 'selected' and the rest 'leaving'.
  const candidateNodes = useMemo(() => {
    const statusFor = (cid: string): 'candidate' | 'selected' | 'leaving' => {
      if (!selection) return 'candidate';
      return cid === selection.selectedId ? 'selected' : 'leaving';
    };
    if (agentState.stage === 'script' && agentState.step === 'show_options') {
      return [0, 1, 2].map((i) => {
        const cid = `candidate-script-${i}`;
        return { id: cid, type: 'script', data: { sceneNumber: i + 1, title: `方案 ${i + 1}`, content: '', nodeStatus: statusFor(cid) } };
      });
    }
    if (agentState.stage === 'storyboard' && agentState.step === 'show_scene_options') {
      return [0, 1, 2].map((i) => {
        const cid = `candidate-shot-${agentState.sceneIndex}-${i}`;
        return { id: cid, type: 'storyboard', data: { shotNumber: agentState.sceneIndex + 1, title: `镜头 ${agentState.sceneIndex + 1}`, dialog: '', style: ['日系动漫', '美漫', '水墨'][i], nodeStatus: statusFor(cid) } };
      });
    }
    return undefined;
  }, [agentState.stage, agentState.step, agentState.sceneIndex, selection]);

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
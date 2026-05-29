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
import { AgentStateMachine } from './agent/AgentStateMachine';
import { AgentIntentRouter } from './agent/AgentIntentRouter';
import { getAgentMessage, makeUserMessage } from './agent/AgentMessages';
import type { ChatMessage } from './agent/types';
import { useStore } from '@/store';
import { useScript, useShots } from '@/hooks/useScriptApi';
import { useAssets } from '@/hooks/useAssetApi';
import { useProjects } from '@/hooks/useProjectApi';
import { buildCanvasGraph } from './buildGraph';

const nodeTypes = {
  script: ScriptNode,
  storyboard: StoryboardNode,
  ai: AINode,
  video: VideoNode,
  character: CharacterNode,
};

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
    const msg = getAgentMessage(sm.state, {
      projectName,
      scriptScenes: script?.content?.split(/^#{1,3}\s/m).length ?? 0,
      shotCount: shots?.length ?? 0,
    });
    setMessages([msg]);
  }, [projectId, script, shots, projectName, syncState, sm]);

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
  const handleAction = useCallback((action: string) => {
    // Phase 3 wires the actual voice.match / render API calls.
    setMessages((m) => [...m, {
      id: `msg-act-${Date.now()}`,
      role: 'ai' as const,
      type: 'text' as const,
      text: `已触发「${action}」，正在处理...`,
      timestamp: Date.now(),
    }]);
  }, []);

  // Node click → B mode
  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    sm.focusNode(node.id);
    syncState();
    setMessages((m) => [...m, getAgentMessage(sm.state, { focusedNodeLabel: (node.data as { title?: string }).title ?? node.id })]);
  }, [syncState, sm]);

  const handleExitContext = useCallback(() => {
    sm.exitFocus();
    syncState();
    setMessages((m) => [...m, { id: `msg-exit-${Date.now()}`, role: 'system' as const, type: 'context-switch' as const, text: '↩ 返回主线', timestamp: Date.now() }]);
  }, [syncState, sm]);

  // Compute candidate nodes for selection steps
  const candidateNodes = useMemo(() => {
    if (agentState.stage === 'script' && agentState.step === 'show_options') {
      return [0, 1, 2].map((i) => ({
        id: `candidate-script-${i}`,
        type: 'script',
        data: { sceneNumber: i + 1, title: `方案 ${i + 1}`, content: '' },
      }));
    }
    if (agentState.stage === 'storyboard' && agentState.step === 'show_scene_options') {
      return [0, 1, 2].map((i) => ({
        id: `candidate-shot-${agentState.sceneIndex}-${i}`,
        type: 'storyboard',
        data: { shotNumber: agentState.sceneIndex + 1, title: `镜头 ${agentState.sceneIndex + 1}`, dialog: '', style: ['日系动漫', '美漫', '水墨'][i] },
      }));
    }
    return undefined;
  }, [agentState.stage, agentState.step, agentState.sceneIndex]);

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
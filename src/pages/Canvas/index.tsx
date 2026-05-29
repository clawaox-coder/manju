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

  // Agent state machine
  const smRef = useRef(new AgentStateMachine());
  const routerRef = useRef(new AgentIntentRouter(smRef.current));
  const [agentState, setAgentState] = useState(smRef.current.state);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const syncState = useCallback(() => setAgentState({ ...smRef.current.state }), []);

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
      smRef.current.restore({ hasScript, hasShots, hasVoice: false, hasVideo: false });
    } else {
      smRef.current.advance();
    }
    syncState();
    const msg = getAgentMessage(smRef.current.state, {
      projectName,
      scriptScenes: script?.content?.split(/^#{1,3}\s/m).length ?? 0,
      shotCount: shots?.length ?? 0,
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
    try {
      const result = await routerRef.current.processInput(text);
      syncState();
      if (result.handled) {
        setMessages((m) => [...m, getAgentMessage(smRef.current.state)]);
      } else if (result.fallbackMessage) {
        setMessages((m) => [...m, { id: `msg-fb-${Date.now()}`, role: 'ai' as const, type: 'text' as const, text: result.fallbackMessage!, timestamp: Date.now() }]);
      }
    } catch {
      setMessages((m) => [...m, { id: `msg-err-${Date.now()}`, role: 'ai' as const, type: 'text' as const, text: '网络出了点问题，请再试一次。', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [syncState]);

  // Handle action (voice/video one-click)
  const handleAction = useCallback((_action: string) => {
    // Phase 3: wire to actual voice.match / render API calls
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
    setMessages((m) => [...m, { id: `msg-exit-${Date.now()}`, role: 'system' as const, type: 'context-switch' as const, text: '↩ 返回主线', timestamp: Date.now() }]);
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
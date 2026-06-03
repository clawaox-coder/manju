import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Tldraw, useEditor, createShapeId, useValue, getArrowBindings } from 'tldraw';
import 'tldraw/tldraw.css';
import { ChatPanel } from './chat/ChatPanel';
import { CanvasToolbar } from './CanvasToolbar';
import { AssetLibraryPanel } from './AssetLibraryPanel';
import { UploadDialog } from '@/components/domain/UploadDialog';
import { linkProjectAsset, type AssetDTO } from '@/lib/api/assets';
import { AgentStateMachine } from './agent/AgentStateMachine';
import { makeUserMessage, makeAiMessage, makeProgressMessage, makeErrorAction, makeSystemMessage, makeCardGroupMessage, makeMilestoneMessage } from './agent/AgentMessages';
import type { ChatMessage, Stage } from './agent/types';
import { useStore } from '@/store';
import { useEffectiveTheme } from '@/hooks/useTheme';
import { useScript, useShots, useUpdateScript } from '@/hooks/useScriptApi';
import { useAssets } from '@/hooks/useAssetApi';
import { useProjects, useUpdateProject } from '@/hooks/useProjectApi';
import { voiceMatch, streamScriptContinue, storyboardGenerate, getAiTask, chat, generateTitle, type ChatTrigger } from '@/lib/api/ai';
import { createRender, getRender } from '@/lib/api/render';
import { buildCanvasGraph } from './buildGraph';
import { ManjuNodeUtil, MANJU_NODE_SIZE, type ManjuNodeType, type ManjuNodeProps } from './canvas/ManjuNodeUtil';
import { getSystemArrowShape } from './canvas/arrowStyle';
import { getConversationResetMessage } from './chat/sessionReset';
import { WorkspaceRail } from './WorkspaceRail';
import { NodeOptimizePanel } from './NodeOptimizePanel';
import {
  loadUserArrows,
  saveCanvasPositions,
  saveUserArrows,
  USER_ARROW_META_KEY,
  type PositionRecord,
  type UserArrowRecord,
} from './persistence';

const MANJU_SHAPE_UTILS = [ManjuNodeUtil];

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
    else if (evt.event === 'error') {
      // 后端以 error 事件（而非 HTTP 错误）上报失败，需主动抛出，否则会静默返回空串。
      throw new Error((evt.data as { message?: string }).message || 'AI 生成失败');
    }
  }
  const text = full.trim();
  if (!text) throw new Error('AI 未返回内容'); // 空结果按失败处理，触发重试而非渲染空卡
  return text;
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
  // canvas-node-edit-layout:用户已 saved 的尺寸(persistence),优先于 MANJU_NODE_SIZE 默认。
  size?: { w: number; h: number };
  data?: {
    title?: string;
    content?: string;
    name?: string;
    description?: string;
    dialog?: string;
    style?: string;
    duration?: string;
    status?: string;
    label?: string;
    model?: string;
    avatar?: string;
    sceneNumber?: number;
    shotNumber?: number;
    imageUrl?: string;
  };
}

interface CanvasGraphEdge {
  id: string;
  source: string;
  target: string;
}

// 把 buildGraph 的 node.data 按 type 映射成 manjuNode 的扁平 props。
// 尺寸:用户已 saved(node.size)优先,否则用 MANJU_NODE_SIZE[type] 默认。
function toManjuProps(node: CanvasGraphNode): ManjuNodeProps {
  const d = node.data ?? {};
  const nodeType = (['script', 'storyboard', 'character', 'ai', 'video'].includes(node.type ?? '')
    ? node.type : 'script') as ManjuNodeType;
  const size = node.size ?? MANJU_NODE_SIZE[nodeType];
  const base = { ...size, nodeType, title: d.title ?? node.id, body: '', badge: '', imageUrl: '', status: '' };
  switch (nodeType) {
    case 'script':
      return { ...base, badge: d.sceneNumber ? String(d.sceneNumber) : '', body: d.content ?? '' };
    case 'storyboard':
      return { ...base, badge: d.style ?? '', body: d.dialog ?? '', imageUrl: d.imageUrl ?? '' };
    case 'character':
      return { ...base, title: d.name ?? d.title ?? '角色', body: d.description ?? '', imageUrl: d.avatar ?? '' };
    case 'ai':
      return { ...base, title: d.label ?? d.title ?? 'AI', badge: d.model ?? '', status: d.status ?? 'idle' };
    case 'video':
      return { ...base, badge: d.duration ?? '', body: '等待素材', status: d.status ?? 'waiting' };
    default:
      return base;
  }
}

function stripShapePrefix(shapeId: string): string {
  return shapeId.replace(/^shape:/, '');
}

type ArrowShapeView = {
  id: string;
  type: string;
  isLocked?: boolean;
  meta?: Record<string, unknown>;
};

type ManjuShapeView = {
  id: string;
  type: string;
  x: number;
  y: number;
  props: { w?: number; h?: number };
};

function isUserArrowShape(shape: ArrowShapeView | undefined): boolean {
  if (!shape || shape.type !== 'arrow' || shape.isLocked) return false;
  return shape.meta?.[USER_ARROW_META_KEY] === true;
}

function getUserArrowRecord(editor: ReturnType<typeof useEditor>, shapeId: string): UserArrowRecord | null {
  const arrow = editor.getShape(createShapeId(shapeId)) as unknown as ArrowShapeView | undefined;
  if (!isUserArrowShape(arrow)) return null;
  const bindings = getArrowBindings(editor, arrow as never);
  const fromId = bindings.start?.toId ? stripShapePrefix(String(bindings.start.toId)) : null;
  const toId = bindings.end?.toId ? stripShapePrefix(String(bindings.end.toId)) : null;
  if (!fromId || !toId || fromId === toId) return null;
  const fromShape = editor.getShape(bindings.start!.toId) as unknown as ArrowShapeView | undefined;
  const toShape = editor.getShape(bindings.end!.toId) as unknown as ArrowShapeView | undefined;
  if (fromShape?.type !== 'manjuNode' || toShape?.type !== 'manjuNode') return null;
  return { id: shapeId, from: fromId, to: toId };
}


// 把 graph 同步成 tldraw 自定义 manjuNode + bound arrow 连线。
// canvas-node-edit-layout:节点可由用户拖动 / 缩放,持久化经 store.listen + debounce 落 localStorage。
function CanvasSync({
  graph,
  projectId,
  onNodeSelect,
}: {
  graph: { nodes: CanvasGraphNode[]; edges: CanvasGraphEdge[] };
  projectId: string | null;
  onNodeSelect?: (nodeId: string) => void;
}) {
  const editor = useEditor();
  const syncedRef = useRef(new Set<string>());
  const syncedEdgesRef = useRef(new Set<string>());
  const selectedShapeIds = useValue('selectedShapeIds', () => editor.getSelectedShapeIds().map((id) => String(id)), [editor]);
  const lastSelectedRef = useRef<string | null>(null);
  const effectiveTheme = useEffectiveTheme();
  const restoredUserArrowsForProjectRef = useRef<string | null>(null);

  // 把有效明暗主题同步给 Tldraw 自己的 colorScheme，否则画布区不跟随 .dark。
  // 系统偏好监听由 useEffectiveTheme 统一处理，此处只消费结果。
  useEffect(() => {
    if (!editor) return;
    editor.user.updateUserPreferences({ colorScheme: effectiveTheme });
  }, [editor, effectiveTheme]);

  useEffect(() => {
    if (!editor || !graph.nodes.length) return;
    const existing = syncedRef.current;
    const currentIds = new Set(graph.nodes.map((n) => n.id));

    // 所有写操作包在 editor.run 里聚成一个 history 步骤(撤销/重做语义清晰)。
    // canvas-node-edit-layout:节点已可由用户拖动,不再 isLocked,也不需要 ignoreShapeLock。
    // arrow 连线仍 isLocked(用户不该拖/删 arrow,那是后续 change)。
    // StrictMode 双调时已存在的节点走 update 分支,幂等。
    editor.run(() => {
      // 删掉不再存在的节点（其相连 arrow 由 tldraw 随绑定一并清理）。
      const toRemove = [...existing].filter((id) => !currentIds.has(id));
      if (toRemove.length) {
        editor.deleteShapes(toRemove.map((id) => createShapeId(id)));
      }

      for (const node of graph.nodes) {
        const shapeId = createShapeId(node.id);
        const props = toManjuProps(node);
        const x = node.position?.x ?? 0;
        const y = node.position?.y ?? 0;
        if (!existing.has(node.id)) {
          editor.createShape({
            id: shapeId, type: 'manjuNode', x, y, props,
          } as unknown as Parameters<typeof editor.createShape>[0]);
        } else {
          editor.updateShape({
            id: shapeId, type: 'manjuNode', x, y, props,
          } as unknown as Parameters<typeof editor.updateShape>[0]);
        }
      }

    // 连线：为每条 edge 建一条两端 bound 到源/目标节点的 arrow（只建一次）。
      for (const edge of graph.edges) {
        if (syncedEdgesRef.current.has(edge.id)) continue;
        if (!currentIds.has(edge.source) || !currentIds.has(edge.target)) continue;
        const arrowId = createShapeId(`arrow-${edge.id}`);
        editor.createShape({ id: arrowId, type: 'arrow', x: 0, y: 0 } as unknown as Parameters<typeof editor.createShape>[0]);
        editor.createBindings([
          { fromId: arrowId, toId: createShapeId(edge.source), type: 'arrow',
            props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } },
          { fromId: arrowId, toId: createShapeId(edge.target), type: 'arrow',
            props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } },
        ] as unknown as Parameters<typeof editor.createBindings>[0]);
        editor.updateShape({
          id: arrowId,
          type: 'arrow',
          ...getSystemArrowShape(edge),
        } as unknown as Parameters<typeof editor.updateShape>[0]);
        syncedEdgesRef.current.add(edge.id);
      }

      if (projectId && restoredUserArrowsForProjectRef.current !== projectId) {
        const savedUserArrows = loadUserArrows(projectId);
        for (const userArrow of savedUserArrows) {
          if (!currentIds.has(userArrow.from) || !currentIds.has(userArrow.to) || userArrow.from === userArrow.to) continue;
          const arrowId = createShapeId(userArrow.id);
          if (editor.getShape(arrowId)) continue;
          editor.createShape({
            id: arrowId,
            type: 'arrow',
            x: 0,
            y: 0,
            meta: { [USER_ARROW_META_KEY]: true },
          } as unknown as Parameters<typeof editor.createShape>[0]);
          editor.createBindings([
            { fromId: arrowId, toId: createShapeId(userArrow.from), type: 'arrow',
              props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } },
            { fromId: arrowId, toId: createShapeId(userArrow.to), type: 'arrow',
              props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } },
          ] as unknown as Parameters<typeof editor.createBindings>[0]);
        }
        restoredUserArrowsForProjectRef.current = projectId;
      }
    });

    syncedRef.current = currentIds;
  }, [editor, graph.nodes, graph.edges, projectId]);

  // canvas-node-edit-layout:监听用户拖动 / 缩放节点,debounce 300ms 落 localStorage。
  // source: 'user' 过滤:只听用户操作,程序化 createShape/updateShape(本组件自己)不触发。
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!editor || !projectId) return;
    const flush = () => {
      saveTimerRef.current = null;
      const map = new Map<string, PositionRecord>();
      for (const id of editor.getCurrentPageShapeIds()) {
        const shape = editor.getShape(id) as unknown as ManjuShapeView | undefined;
        if (!shape || shape.type !== 'manjuNode') continue;
        const nodeId = stripShapePrefix(String(id));
        map.set(nodeId, { x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h });
      }
      if (map.size > 0) saveCanvasPositions(projectId, map);
    };
    const unsubscribe = editor.store.listen(
      (entry) => {
        const updated = entry.changes.updated as Record<string, [unknown, unknown]>;
        const hasManju = Object.values(updated).some((pair) => {
          const after = pair[1] as { typeName?: string; type?: string };
          return after?.typeName === 'shape' && after?.type === 'manjuNode';
        });
        if (!hasManju) return;
        if (saveTimerRef.current != null) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(flush, 300);
      },
      { source: 'user', scope: 'document' },
    );
    return () => {
      if (saveTimerRef.current != null) clearTimeout(saveTimerRef.current);
      unsubscribe();
    };
  }, [editor, projectId]);

  const saveUserArrowsTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!editor || !projectId) return;
    const flush = () => {
      saveUserArrowsTimerRef.current = null;
      const rows: UserArrowRecord[] = [];
      for (const id of editor.getCurrentPageShapeIds()) {
        const shape = editor.getShape(id) as unknown as ArrowShapeView | undefined;
        if (!shape || shape.type !== 'arrow' || shape.isLocked) continue;
        const shapeId = stripShapePrefix(String(id));
        const nextMeta = { ...(shape.meta ?? {}), [USER_ARROW_META_KEY]: true };
        if (shape.meta?.[USER_ARROW_META_KEY] !== true) {
          editor.updateShape({
            id,
            type: 'arrow',
            meta: nextMeta,
          } as unknown as Parameters<typeof editor.updateShape>[0]);
        }
        const record = getUserArrowRecord(editor, shapeId);
        if (!record) {
          const bindings = getArrowBindings(editor, shape as never);
          const fromId = bindings.start?.toId ? stripShapePrefix(String(bindings.start.toId)) : null;
          const toId = bindings.end?.toId ? stripShapePrefix(String(bindings.end.toId)) : null;
          if (fromId && toId && fromId === toId) {
            editor.deleteShape(id);
          }
          continue;
        }
        rows.push(record);
      }
      saveUserArrows(projectId, rows);
    };
    const unsubscribe = editor.store.listen(
      (entry) => {
        const added = Object.values(entry.changes.added as Record<string, unknown>).some((item) => {
          const shape = item as { typeName?: string; type?: string; isLocked?: boolean };
          return shape?.typeName === 'shape' && shape?.type === 'arrow' && !shape?.isLocked;
        });
        const updated = Object.values(entry.changes.updated as Record<string, [unknown, unknown]>).some((pair) => {
          const before = pair[0] as { typeName?: string; type?: string; isLocked?: boolean };
          const after = pair[1] as { typeName?: string; type?: string; isLocked?: boolean };
          return (before?.typeName === 'shape' && before?.type === 'arrow' && !before?.isLocked)
            || (after?.typeName === 'shape' && after?.type === 'arrow' && !after?.isLocked);
        });
        const removed = Object.values(entry.changes.removed as Record<string, unknown>).some((item) => {
          const shape = item as { typeName?: string; type?: string; isLocked?: boolean; meta?: Record<string, unknown> };
          return shape?.typeName === 'shape'
            && shape?.type === 'arrow'
            && (!shape?.isLocked || shape?.meta?.[USER_ARROW_META_KEY] === true);
        });
        if (!added && !updated && !removed) return;
        if (saveUserArrowsTimerRef.current != null) clearTimeout(saveUserArrowsTimerRef.current);
        saveUserArrowsTimerRef.current = window.setTimeout(flush, 300);
      },
      { source: 'user', scope: 'document' },
    );
    return () => {
      if (saveUserArrowsTimerRef.current != null) clearTimeout(saveUserArrowsTimerRef.current);
      unsubscribe();
    };
  }, [editor, projectId]);

  useEffect(() => {
    if (!selectedShapeIds.length || !onNodeSelect) return;
    const nodeId = stripShapePrefix(selectedShapeIds[0]);
    // 只对 manjuNode 节点触发聚焦（忽略 arrow 等）。
    if (nodeId.startsWith('arrow-')) return;
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
  // 被点中的节点 → 渲染单节点优化面板。P5 完成后会取代 handleNodeClick 里的全局对话注入;
  // P2 阶段并存:点节点同时设此 state(开面板)和走原 focus turn(保留全局对话),降合并风险。
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // 从聊天框拖拽/粘贴/选择的参考图：暂存待上传，打开上传弹窗。
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);
  // 防止同一制作动作并发触发（trigger 可能在连续两轮里重复出现）。
  const busyRef = useRef(false);
  // 剧本候选内容缓存：cardId → 大纲全文（点选卡片后据此保存所选方向）。
  const scriptCandidatesRef = useRef<Map<string, string>>(new Map());
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
      makeAiMessage('嗨，我是你的创作搭档。想做个什么样的短片？随便聊聊就行——一句灵感、一个画面，都可以。', { stage: 'idea' }),
    ]);
  }, [projectId, script, shots, syncState, sm]);

  // ---- 制作动作：由对话 trigger 显式触发，不再由状态机 step 监听自动跑。 ----
  // 每个都自带忙碌守卫，跑完用 markReady 落进度态 + 一条结果消息。

  // 剧本：用累积的创意设定并行生成 3 个方向的候选，以「对话内卡片组」呈现，
  // 等用户点选某个方向（handleSelectCard）再保存进剧本、推进到分镜。
  const runScriptGen = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('script'); syncState();
    setMessages((m) => [...m, makeProgressMessage('正在构思 3 个剧本方向...', '生成剧本', 'script')]);
    try {
      const { type = '漫剧', style = '日系动漫', tone, duration = '1分钟', audience = '年轻人' } = sm.state.ideaContext;
      const base = `用${type}形式、${style}风格创作一个短剧大纲（约${duration}，受众${audience}${tone ? `，${tone}基调` : ''}）。直接给出分场景大纲。`;
      const dirs = [
        { emoji: '⚡', title: '强冲突反转', extra: '走强冲突、结尾反转路线。' },
        { emoji: '☀️', title: '轻松日常', extra: '走轻松幽默的日常喜剧路线。' },
        { emoji: '🌙', title: '细腻情感', extra: '走细腻情感、人物弧光路线。' },
      ];
      const outlines = await Promise.all(dirs.map((d) => genOutline(projectId, base + d.extra)));
      const cards = dirs.map((d, i) => ({
        id: `script-cand-${i}`,
        emoji: d.emoji,
        title: d.title,
        description: outlines[i] || '（生成为空）',
      }));
      // 缓存内容供点选时取用。
      scriptCandidatesRef.current = new Map(cards.map((c) => [c.id, c.description]));
      sm.markReady('script'); syncState();
      setMessages((m) => [...m, makeCardGroupMessage('给你三个方向，点一个我就照着展开成完整剧本：', cards, 'script')]);
    } catch {
      sm.markReady('idea'); syncState();
      setMessages((m) => [...m, makeErrorAction('生成剧本时出错了。', '重试生成', '点击重新生成剧本', 'idea')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState]);

  const runStoryboardGen = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('storyboard'); syncState();
    setMessages((m) => [...m, makeProgressMessage('🎨 正在生成分镜...', '生成分镜', 'storyboard')]);
    try {
      const style = sm.state.ideaContext.style ?? 'default';
      const res = await storyboardGenerate({ project_id: projectId, style, regenerate_all: true });
      const ok = await pollAiTask(res.task_id);
      if (!ok) throw new Error('storyboard task failed');
      await refetchShots();
      sm.markReady('storyboard'); syncState();
      setMessages((m) => [...m, makeMilestoneMessage('分镜已生成', 'storyboard'), makeAiMessage('每一镜都在画布右侧了，要改某一镜，或者直接去配音。', { stage: 'storyboard' })]);
    } catch {
      sm.markReady('script'); syncState();
      setMessages((m) => [...m, makeErrorAction('生成分镜时出错了。', '重试生成', '点击重新生成分镜', 'script')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState, refetchShots]);

  const runVoiceMatch = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('voice'); syncState();
    setMessages((m) => [...m, makeProgressMessage('🎙 正在为角色匹配配音...', '配音匹配', 'voice')]);
    try {
      const res = await voiceMatch({ project_id: projectId, content: script?.content ?? '', auto_assign: true });
      const n = res.matches?.length ?? 0;
      sm.markReady('voice'); syncState();
      setMessages((m) => [...m, makeMilestoneMessage(`配音完成 · ${n} 个角色`, 'voice'), makeAiMessage('想换某个角色的声音，还是直接出片？', { stage: 'voice' })]);
    } catch {
      sm.markReady('storyboard'); syncState();
      setMessages((m) => [...m, makeErrorAction('配音匹配失败。', '重试配音', '点击重新匹配', 'storyboard')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState, script]);

  const runRender = useCallback(async () => {
    if (!projectId || busyRef.current) return;
    busyRef.current = true;
    sm.enterBusy('video'); syncState();
    setMessages((m) => [...m, makeProgressMessage('🎬 正在渲染视频...', '渲染中', 'video')]);
    try {
      const job = await createRender(
        { project_id: projectId, resolution: '1080p', format: 'mp4' },
        `render-${projectId}-${Date.now()}`,
      );
      const result = await pollRender(job.job_id, () => {
        setMessages((m) => [...m, makeAiMessage('比预期久一点，还在渲染中...', { stage: 'video' })]);
      });
      if (!result.ok) throw new Error('render failed');
      sm.markReady('video'); syncState();
      setMessages((m) => [...m, makeMilestoneMessage('视频已出片', 'video'), makeAiMessage('右上角可以预览或下载。想调哪段，点画布节点告诉我。', { stage: 'video' })]);
    } catch {
      sm.markReady('voice'); syncState();
      setMessages((m) => [...m, makeErrorAction('渲染遇到问题。', '重试渲染', '点击重新生成视频', 'voice')]);
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
      setMessages((m) => [...m, makeAiMessage(res.reply, { thinking: res.thinking, options: res.options, stage: sm.state.stage })]);
      executeTrigger(res.trigger);
    } catch {
      setMessages((m) => [...m, makeAiMessage('网络出了点问题，请再试一次。', { stage: sm.state.stage })]);
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

  // 点选剧本候选卡：取出该方向全文 → 保存进剧本 → 停在 script/ready，
  // 引导用户继续聊改或进分镜（进分镜由对话 trigger 触发）。
  const handleSelectCard = useCallback(async (cardId: string) => {
    if (!projectId || busyRef.current) return;
    const content = scriptCandidatesRef.current.get(cardId);
    if (!content) return;
    busyRef.current = true;
    setMessages((m) => [...m, makeUserMessage('就用这个方向')]);
    try {
      await updateScript.mutateAsync({ content, expected_version_no: script?.version_no ?? 0 });
      scriptCandidatesRef.current.clear();
      sm.markReady('script'); syncState();
      setMessages((m) => [...m, makeMilestoneMessage('剧本已定', 'script'), makeAiMessage('画布上能看到完整剧本了。想再调哪段，或者直接说"开始分镜"。', { stage: 'script' })]);
    } catch {
      setMessages((m) => [...m, makeErrorAction('保存剧本失败。', '重试保存', '点击重新保存所选方向', 'script')]);
    } finally {
      busyRef.current = false;
    }
  }, [projectId, sm, syncState, updateScript, script]);

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

  // 点选画布节点 → 开单节点优化面板（canvas-node-optimize-panel）。
  // 原本同时注入全局对话 focus turn，本次 P5 已移除——节点优化与全局对话彻底隔离。
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  // 聊天框拖拽/粘贴/选择参考图 → 暂存并打开上传弹窗（角色资产，自动落画布）。
  const handleAttachImage = useCallback((file: File) => {
    setPendingImage(file);
  }, []);

  const handleNewConversation = useCallback(() => {
    scriptCandidatesRef.current.clear();
    busyRef.current = false;
    setLoading(false);
    setSelectedNodeId(null);
    setPendingImage(null);
    setAssetPanelOpen(false);

    const hasScript = !!script?.content;
    const hasShots = (shots?.length ?? 0) > 0;
    sm.restore({ hasScript, hasShots, hasVoice: false, hasVideo: false });
    syncState();

    const next = getConversationResetMessage({ hasScript, hasShots });
    setMessages([makeAiMessage(next.text, { stage: next.stage })]);
  }, [script, shots, sm, syncState]);

  // 参考图上传成功 → 资产已创建，再把它以 character_ref 关联到当前项目
  // （这样生成时后端能按 project 拉到它喂模型）。react-query 失效 ['assets']
  // 自动刷新角色节点落画布；关联失败不阻断，仅提示。
  const handleImageUploaded = useCallback((asset: AssetDTO) => {
    setPendingImage(null);
    if (projectId) {
      void linkProjectAsset(projectId, asset.id, 'character_ref')
        .then(() => setMessages((m) => [...m, makeSystemMessage(`🖼 参考图「${asset.name}」已加入，画布上能看到了`)]))
        .catch(() => setMessages((m) => [...m, makeSystemMessage(`🖼 参考图「${asset.name}」已上传，但关联到项目失败，生成时可能用不上`)]));
    } else {
      setMessages((m) => [...m, makeSystemMessage(`🖼 参考图「${asset.name}」已上传`)]);
    }
  }, [projectId]);

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
    () => buildCanvasGraph(script, shots, characters?.data, projectName, 'idle', undefined, projectId),
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
    <div className="h-screen flex bg-background">
      <WorkspaceRail
        onNewConversation={handleNewConversation}
        onOpenAssets={() => setAssetPanelOpen(true)}
      />
      <ChatPanel
        messages={messages}
        onSendMessage={handleSendMessage}
        onSelectOption={handleSelectOption}
        onSelectCard={handleSelectCard}
        onAction={handleAction}
        loading={loading}
        stage={STAGE_LABELS[agentState.stage]}
        suggestedPrompts={suggestedPrompts}
        title={projectName}
        onTitleChange={handleTitleChange}
        onAttachImage={handleAttachImage}
      />
      <div className="flex-1 relative">
        <Tldraw hideUi shapeUtils={MANJU_SHAPE_UTILS} onMount={(editor) => { editorRef.current = editor; }}>
          <CanvasSync graph={graph} projectId={projectId} onNodeSelect={handleNodeClick} />
          <CanvasToolbar />
          {selectedNodeId && (
            <NodeOptimizePanel
              key={selectedNodeId}
              nodeId={selectedNodeId}
              projectId={projectId}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </Tldraw>
        <AssetLibraryPanel
          open={assetPanelOpen}
          onClose={() => setAssetPanelOpen(false)}
          onPick={handleAssetPick}
        />
        <UploadDialog
          key={pendingImage ? `${pendingImage.name}-${pendingImage.size}` : 'none'}
          open={pendingImage !== null}
          onOpenChange={(next) => { if (!next) setPendingImage(null); }}
          assetType="character"
          accept="image/*"
          title="添加参考图（角色）"
          initialFile={pendingImage}
          onUploaded={handleImageUploaded}
        />
      </div>
    </div>
  );
}

export default function CanvasPage() {
  return <CanvasInner />;
}

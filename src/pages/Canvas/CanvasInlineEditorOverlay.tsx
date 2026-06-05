import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { CanvasNode } from './buildGraph';
import { getCanvasObjectTitle } from './CanvasObjectWorkbench';
import { getNodeFocusTypeLabel, getNodeStatus } from './focusContext';
import { resolveNodeEntity } from './nodeEntity';
import type { ChatMessage } from './agent/types';
import { ChatPanel } from './chat/ChatPanel';
import { ScriptSceneEditor } from './workbench/editors/ScriptSceneEditor';
import { StoryboardCardEditor } from './workbench/editors/StoryboardCardEditor';
import { CharacterProfileEditor } from './workbench/editors/CharacterProfileEditor';
import { StoryboardHubEditor } from './workbench/editors/StoryboardHubEditor';
import { OutputVersionEditor } from './workbench/editors/OutputVersionEditor';
import { WorkbenchPlaceholder } from './workbench/WorkbenchPlaceholder';
import { getObjectWorkbenchLayoutPrefs } from './objectWorkbenchLayout';
import { isDemoCanvasProjectId } from './demoCanvasData';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  candidate: '候选',
  selected: '当前焦点',
  locked: '已锁定',
  generating: '生成中',
  ready: '就绪',
  stale: '待刷新',
  warning: '需确认',
  archived: '已归档',
  idle: '待命',
  waiting: '等待',
  done: '完成',
  running: '生成中',
  rendering: '渲染中',
  error: '异常',
};

function MetaCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] bg-background/28 px-3 py-2 ring-1 ring-border/24">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[13px] leading-6 text-foreground">{value}</div>
    </div>
  );
}

function UtilityMetaItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[14px] bg-background/42 px-3 py-2 ring-1 ring-border/30">
      <span className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">{label}</span>
      <span className="max-w-[11rem] text-right text-[12px] leading-5 text-foreground/85">{value}</span>
    </div>
  );
}

function buildInlineMeta(node: CanvasNode, status: string) {
  const data = node.data ?? {};
  switch (node.type) {
    case 'script':
      return {
        kicker: '剧本卡已展开',
        kickerClassName: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
        summary: '先在这里把这一场改顺，再决定是否继续推进到分镜。',
        cards: [
          { label: '当前状态', value: status },
          { label: '场次编号', value: String(data.sceneNumber ?? '未标记') },
          { label: '场次摘要', value: String(data.content ?? '等待补充内容') },
        ],
      };
    case 'storyboard':
      return {
        kicker: '分镜卡已展开',
        kickerClassName: 'bg-teal-500/10 text-teal-500',
        summary: '这里会直接围绕这一镜继续调整，不用切去别的地方。',
        cards: [
          { label: '当前状态', value: status },
          { label: '画面风格', value: String(data.style ?? '未设风格') },
          { label: '当前对白', value: String(data.dialog ?? '暂无对白') },
        ],
      };
    case 'character':
      return {
        kicker: '角色卡已展开',
        kickerClassName: 'bg-primary/10 text-primary',
        summary: '在这里集中改角色设定、头像和名称，再判断是否会影响镜头与配音。',
        cards: [
          { label: '当前状态', value: status },
          { label: '角色名称', value: String(data.name ?? data.title ?? '未命名角色') },
          { label: '角色描述', value: String(data.description ?? '暂无描述') },
        ],
      };
    case 'ai':
      return {
        kicker: '生成对象已展开',
        kickerClassName: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
        summary: '这是整体生成对象，适合先理解影响范围，再决定是否执行生成动作。',
        cards: [
          { label: '当前状态', value: status },
          { label: '当前模型', value: String(data.model ?? '默认模型') },
          { label: '当前对象', value: String(data.label ?? data.title ?? '整体分镜生成') },
        ],
      };
    case 'video':
      return {
        kicker: '输出对象已展开',
        kickerClassName: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
        summary: '这里处理整片输出与渲染，可以直接完成判断和出片动作。',
        cards: [
          { label: '当前状态', value: status },
          { label: '预计时长', value: String(data.duration ?? '未估算') },
          { label: '输出标题', value: String(data.title ?? '视频输出') },
        ],
      };
    case 'decision':
      return {
        kicker: '待拍板对象已展开',
        kickerClassName: 'bg-orange-500/10 text-orange-600 dark:text-orange-300',
        summary: '这是待拍板对象。先围绕它判断，再在这里确认推进。',
        cards: [
          { label: '当前状态', value: status },
          { label: '决策类型', value: String(data.kind ?? '未分类') },
          { label: '影响范围', value: String(data.badge ?? '主线推进') },
        ],
      };
    case 'risk':
      return {
        kicker: '风险对象已展开',
        kickerClassName: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
        summary: '这是风险对象。先评估影响，再决定是刷新还是继续。',
        cards: [
          { label: '当前状态', value: status },
          { label: '风险类型', value: String(data.kind ?? '未分类') },
          { label: '影响范围', value: String(data.badge ?? '待确认') },
        ],
      };
    default:
      return {
        kicker: '对象已展开',
        kickerClassName: 'bg-primary/10 text-primary',
        summary: '当前对象的操作能力已经直接展开在画布里。',
        cards: [{ label: '当前状态', value: status }],
      };
  }
}

function renderInlineEditor(node: CanvasNode, projectId: string | null, onClose: () => void) {
  const tone = node.type === 'ai' || node.type === 'video' || node.type === 'decision' || node.type === 'risk'
    ? 'utility'
    : 'default';
  const entity = resolveNodeEntity(node.id);
  switch (entity.kind) {
    case 'script-scene':
      if (!projectId) return <WorkbenchPlaceholder text="当前还没有绑定项目，打开一个项目后，这里会直接进入剧本操作。" tone={tone} />;
      return <ScriptSceneEditor sceneIndex={entity.sceneIndex} projectId={projectId} onDone={onClose} />;
    case 'shot':
      if (!projectId) return <WorkbenchPlaceholder text="当前还没有绑定项目，打开一个项目后，这里会直接进入分镜操作。" tone={tone} />;
      return <StoryboardCardEditor shotId={entity.shotId} projectId={projectId} />;
    case 'character':
      if (!projectId) return <WorkbenchPlaceholder text="当前还没有绑定项目，打开一个项目后，这里会直接进入角色操作。" tone={tone} />;
      return <CharacterProfileEditor assetId={entity.assetId} projectId={projectId} />;
    case 'hub-ai':
      if (!projectId) return <WorkbenchPlaceholder text="当前还没有绑定项目，打开一个项目后，这里会直接进入整体生成操作。" tone={tone} />;
      return <StoryboardHubEditor projectId={projectId} />;
    case 'hub-video':
      if (!projectId) return <WorkbenchPlaceholder text="当前还没有绑定项目，打开一个项目后，这里会直接进入出片操作。" tone={tone} />;
      return <OutputVersionEditor projectId={projectId} />;
    case 'decision':
      return <WorkbenchPlaceholder text="这个对象主要用于拍板推进，先围绕它判断，再决定下一步动作。" tone="utility" />;
    case 'risk':
      return <WorkbenchPlaceholder text="这个对象主要用于风险评估，先明确影响，再决定是否继续推进。" tone="utility" />;
    default:
      return <WorkbenchPlaceholder text="这个对象暂时还没有直接操作能力。" tone={tone} />;
  }
}

type OverlayAnchor = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  compact: boolean;
};

export function CanvasInlineEditorOverlay({
  node,
  projectId,
  anchor,
  onClose,
  messages,
  onSendMessage,
  onSelectOption,
  onSelectCard,
  onAction,
  loading,
  stage,
  suggestedPrompts,
  title,
  onTitleChange,
  onAttachImage,
  focusLabel,
  focusTypeLabel,
  focusTask,
}: {
  node: CanvasNode;
  projectId: string | null;
  anchor?: OverlayAnchor | null;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSelectOption: (value: string) => void;
  onSelectCard: (cardId: string) => void;
  onAction: (action: string) => void;
  loading: boolean;
  stage: string;
  suggestedPrompts: string[];
  title: string;
  onTitleChange: (title: string) => void;
  onAttachImage?: (file: File) => void;
  focusLabel?: string | null;
  focusTypeLabel?: string | null;
  focusTask?: string | null;
}) {
  const status = STATUS_LABELS[getNodeStatus(node)] ?? getNodeStatus(node);
  const objectTypeLabel = getNodeFocusTypeLabel(node);
  const meta = buildInlineMeta(node, status);
  const objectTitle = getCanvasObjectTitle(node);
  const secondaryTitle = String(node.data?.title ?? node.data?.name ?? node.id);
  const isStoryboardNode = node.type === 'storyboard';
  const isScriptLikeNode = node.type === 'script' || node.type === 'character';
  const isSystemObjectNode = node.type === 'ai' || node.type === 'video' || node.type === 'decision' || node.type === 'risk';
  const isDemoContentWorkbench = isDemoCanvasProjectId(projectId) && (isStoryboardNode || isScriptLikeNode);
  const isDemoStoryboardWorkbench = isDemoCanvasProjectId(projectId) && isStoryboardNode;
  const isDemoScriptLikeWorkbench = isDemoCanvasProjectId(projectId) && isScriptLikeNode;
  const showHeaderChips = !isDemoContentWorkbench;
  const prefersSpecificUtilityTitle = isSystemObjectNode && secondaryTitle.trim() && secondaryTitle !== objectTitle;
  const displayTitle = prefersSpecificUtilityTitle ? secondaryTitle : objectTitle;
  const showSecondaryTitle = !prefersSpecificUtilityTitle && secondaryTitle.trim() && secondaryTitle !== objectTitle;
  const compact = anchor?.compact ?? false;
  const layoutPrefs = getObjectWorkbenchLayoutPrefs(node.type, compact ? 1100 : 1600, compact ? 900 : 1000);
  const [entered, setEntered] = useState(false);
  const panelStyle = anchor
    ? {
        left: anchor.left,
        top: anchor.top,
        width: anchor.width,
        maxHeight: anchor.maxHeight,
      }
    : undefined;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [node.id]);

  return (
    <div className="absolute inset-0 z-[360]">
      <button
        type="button"
        className={cn(
          'absolute inset-0 transition-opacity duration-200 ease-out',
          entered && isDemoContentWorkbench ? 'bg-black/[0.008] opacity-100' : entered ? 'bg-black/[0.015] opacity-100' : 'bg-black/0 opacity-0',
        )}
        aria-label="点击空白收起当前对象"
        title="点击空白收起当前对象"
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute overflow-hidden transition-[transform,opacity,box-shadow] duration-220 ease-out',
          isDemoContentWorkbench
            ? 'border border-border/24 bg-background/64 backdrop-blur-sm'
            : 'border border-border/45 bg-background/78 backdrop-blur-md',
          layoutPrefs.shellPosture === 'panoramic' && 'rounded-[30px]',
          layoutPrefs.shellPosture === 'card' && 'rounded-[26px]',
          layoutPrefs.shellPosture === 'utility' && 'rounded-[24px]',
          layoutPrefs.entryMotion === 'spread' && 'origin-left',
          layoutPrefs.entryMotion === 'lift' && 'origin-top',
          layoutPrefs.entryMotion === 'pop' && 'origin-top-right',
          entered && layoutPrefs.shellPosture === 'panoramic' && 'shadow-[0_22px_54px_rgba(15,23,42,0.18)] opacity-100 scale-100',
          !entered && layoutPrefs.shellPosture === 'panoramic' && 'shadow-[0_8px_22px_rgba(15,23,42,0.10)] opacity-0 scale-[0.985]',
          entered && anchor && layoutPrefs.shellPosture === 'panoramic' && 'translate-x-0',
          !entered && anchor && layoutPrefs.shellPosture === 'panoramic' && 'translate-x-2',
          entered && layoutPrefs.shellPosture === 'card' && 'shadow-[0_18px_42px_rgba(15,23,42,0.16)] opacity-100 scale-100',
          !entered && layoutPrefs.shellPosture === 'card' && 'shadow-[0_10px_24px_rgba(15,23,42,0.10)] opacity-0 scale-[0.985]',
          entered && anchor && layoutPrefs.shellPosture === 'card' && 'translate-y-0',
          !entered && anchor && layoutPrefs.shellPosture === 'card' && 'translate-y-2',
          entered && layoutPrefs.shellPosture === 'utility' && 'shadow-[0_14px_32px_rgba(15,23,42,0.14)] opacity-100 scale-100',
          !entered && layoutPrefs.shellPosture === 'utility' && 'shadow-[0_6px_16px_rgba(15,23,42,0.08)] opacity-0 scale-[0.975]',
          entered && anchor && layoutPrefs.shellPosture === 'utility' && 'translate-y-0',
          !entered && anchor && layoutPrefs.shellPosture === 'utility' && '-translate-y-1',
          !anchor && 'left-1/2 top-1/2 h-[min(50rem,calc(100vh-4rem))] w-[min(64rem,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2',
        )}
        style={panelStyle}
        data-testid="canvas-object-studio-surface"
        data-demo-content-workbench={isDemoContentWorkbench ? 'true' : 'false'}
      >
        <div className="relative flex h-full flex-col">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'absolute z-[2] text-muted-foreground/72 transition hover:text-foreground',
              isDemoContentWorkbench && '!right-2 !top-2 rounded-full !p-1 text-muted-foreground/52',
              layoutPrefs.shellPosture === 'panoramic' && 'right-3.5 top-3.5 rounded-full bg-background/44 p-1.5 backdrop-blur-sm',
              layoutPrefs.shellPosture === 'card' && 'right-3 top-3 rounded-full bg-background/38 p-1.5 backdrop-blur-sm',
              layoutPrefs.shellPosture === 'utility' && 'right-2.5 top-2.5 rounded-full bg-background/34 p-1.25 backdrop-blur-sm',
              isDemoContentWorkbench && '!bg-transparent !backdrop-blur-0',
            )}
            aria-label="收起当前对象"
            title="收起当前对象"
            data-testid={isDemoContentWorkbench ? 'demo-content-workbench-close' : undefined}
          >
            <X className={cn(
              'h-4 w-4',
              layoutPrefs.shellPosture === 'utility' && 'h-3.5 w-3.5',
            )} />
          </button>
          <div
            className={cn(
              'relative min-h-0 flex-1',
              compact ? 'flex flex-col' : isDemoStoryboardWorkbench
                ? 'grid grid-cols-[minmax(0,1.62fr)_minmax(12.75rem,0.38fr)]'
                : isStoryboardNode
                  ? 'grid grid-cols-[minmax(0,1.34fr)_minmax(15.25rem,0.66fr)]'
                  : isDemoScriptLikeWorkbench
                    ? 'grid grid-cols-[minmax(0,1.46fr)_minmax(13rem,0.42fr)]'
                    : isScriptLikeNode
                      ? 'grid grid-cols-[minmax(0,1.18fr)_minmax(15.75rem,0.68fr)]'
                      : isSystemObjectNode
                        ? 'grid grid-cols-[minmax(0,1.04fr)_minmax(16rem,0.8fr)]'
                        : 'grid grid-cols-[minmax(0,1.1fr)_minmax(16.5rem,0.76fr)]',
            )}
          >
            <section
              className={cn(
                'min-h-0 overflow-y-auto',
                layoutPrefs.shellPosture === 'panoramic' && 'px-5 py-4.5',
                layoutPrefs.shellPosture === 'card' && 'px-[18px] py-4',
                layoutPrefs.shellPosture === 'utility' && 'px-4 py-3.5',
              )}
              data-testid="canvas-object-studio-editor"
            >
              {!isDemoContentWorkbench && (
                <div
                  className={cn(
                    'mb-3',
                    layoutPrefs.shellPosture === 'panoramic' && 'pr-12',
                    layoutPrefs.shellPosture === 'card' && 'pr-10',
                    layoutPrefs.shellPosture === 'utility' && 'rounded-[14px] bg-card/10 px-3 py-2.5 pr-10',
                  )}
                >
                  {showHeaderChips ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {objectTypeLabel && (
                        <span className="rounded-full border border-primary/12 bg-primary/[0.04] px-2 py-0.5 text-[10px] font-medium text-primary/88">
                          {objectTypeLabel}
                        </span>
                      )}
                      <span className="rounded-full border border-border/70 bg-background/44 px-2 py-0.5 text-[10px] font-medium text-foreground/68">
                        {status}
                      </span>
                    </div>
                  ) : null}
                  <h2
                    className={cn(
                      'truncate font-semibold text-foreground',
                      showHeaderChips && 'mt-2.5',
                      layoutPrefs.shellPosture === 'panoramic' && 'text-[15px]',
                      layoutPrefs.shellPosture === 'card' && 'text-[14px]',
                      layoutPrefs.shellPosture === 'utility' && 'text-[13px]',
                    )}
                  >
                    {displayTitle}
                  </h2>
                  {showSecondaryTitle && (
                    <p
                      className={cn(
                        'mt-0.5 truncate text-muted-foreground/78',
                        layoutPrefs.shellPosture === 'panoramic' && 'text-[12px]',
                        layoutPrefs.shellPosture === 'card' && 'text-[12px]',
                        layoutPrefs.shellPosture === 'utility' && 'text-[11px]',
                      )}
                    >
                      {secondaryTitle}
                    </p>
                  )}
                </div>
              )}

              {isDemoContentWorkbench ? (
                renderInlineEditor(node, projectId, onClose)
              ) : isStoryboardNode ? (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold bg-teal-500/10 text-teal-500">
                      <Sparkles className="h-3 w-3" />
                      {meta.kicker}
                    </span>
                  </div>
                  {renderInlineEditor(node, projectId, onClose)}
                </>
              ) : isSystemObjectNode ? (
                <>
                  <div className="rounded-[16px] bg-card/14 px-3 py-3">
                    <div className="flex items-center gap-2 text-[12px] font-medium text-foreground/85">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold',
                        meta.kickerClassName,
                      )}>
                        <Sparkles className="h-3 w-3" />
                        {meta.kicker}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] leading-6 text-muted-foreground">
                      {meta.summary}
                    </p>
                    <div className="mt-3 space-y-2">
                      {meta.cards.map((card) => (
                        <UtilityMetaItem key={card.label} label={card.label} value={card.value} />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    {renderInlineEditor(node, projectId, onClose)}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="flex items-center gap-2 text-[12px] font-medium text-foreground/85">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold',
                        meta.kickerClassName,
                      )}>
                        <Sparkles className="h-3 w-3" />
                        {meta.kicker}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {meta.summary}
                    </p>
                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      {meta.cards.map((card) => (
                        <MetaCard key={card.label} label={card.label} value={card.value} />
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    {renderInlineEditor(node, projectId, onClose)}
                  </div>
                </>
              )}
            </section>

            <aside
              className={cn(
                'relative min-h-0 overflow-hidden',
                layoutPrefs.shellPosture === 'panoramic' && 'px-3.5 py-3.5',
                layoutPrefs.shellPosture === 'card' && 'px-3.5 py-3.5',
                layoutPrefs.shellPosture === 'utility' && 'px-3 py-3',
                isDemoContentWorkbench && 'flex flex-col items-end justify-start pl-2.5 pr-1 pt-2.5 pb-1.5',
                !compact && layoutPrefs.shellPosture === 'panoramic' && 'bg-gradient-to-l from-card/18 via-card/10 to-transparent',
                !compact && layoutPrefs.shellPosture === 'card' && 'bg-gradient-to-l from-card/14 via-card/8 to-transparent',
                !compact && layoutPrefs.shellPosture === 'utility' && 'bg-gradient-to-l from-card/10 via-card/6 to-transparent',
                !compact && isDemoContentWorkbench && 'bg-transparent',
                compact && 'border-t border-border/50 pt-4',
              )}
              data-testid="canvas-object-studio-chat"
              data-demo-content-lane={isDemoContentWorkbench ? 'true' : 'false'}
              data-demo-content-lane-style={isDemoContentWorkbench ? 'rail' : undefined}
              data-demo-content-lane-height={isDemoContentWorkbench ? 'compact' : undefined}
              data-demo-content-lane-position={isDemoContentWorkbench ? 'inset' : undefined}
              data-demo-content-lane-anchor={isDemoContentWorkbench ? 'cap' : undefined}
              data-demo-content-lane-connector={isDemoContentWorkbench ? 'arm' : undefined}
              data-demo-content-lane-transition={isDemoContentWorkbench ? 'shoulder' : undefined}
              data-demo-content-lane-foundation={isDemoContentWorkbench ? 'cradle' : undefined}
              data-demo-content-lane-body={isDemoContentWorkbench ? 'veil' : undefined}
              data-demo-content-lane-edge={isDemoContentWorkbench ? 'ridge' : undefined}
              data-demo-content-lane-slot={isDemoContentWorkbench ? 'groove' : undefined}
            >
              <div
                data-testid={isDemoContentWorkbench ? 'demo-content-lane-shell' : undefined}
                data-demo-content-lane-shell={isDemoContentWorkbench ? 'anchored' : undefined}
                className={cn(
                  'h-full',
                  isDemoContentWorkbench && 'relative flex w-full max-w-[15.5rem] justify-end pl-3 pt-1.5',
                )}
              >
                {isDemoContentWorkbench ? (
                  <>
                    <div
                      aria-hidden="true"
                      data-testid="demo-content-lane-guide"
                      className="pointer-events-none absolute inset-y-3 left-0 w-px rounded-full bg-gradient-to-b from-border/0 via-border/34 to-border/0"
                    />
                    <div
                      aria-hidden="true"
                      data-testid="demo-content-lane-cap"
                      className="pointer-events-none absolute left-0 top-0 flex h-6 w-6 -translate-x-[11px] items-center justify-center rounded-full"
                    >
                      <span className="h-2 w-2 rounded-full border border-border/42 bg-background/88 shadow-[0_0_0_3px_rgba(255,255,255,0.22)] dark:shadow-[0_0_0_3px_rgba(15,23,42,0.18)]" />
                    </div>
                    <div
                      aria-hidden="true"
                      data-testid="demo-content-lane-arm"
                      className="pointer-events-none absolute left-[10px] top-[11px] h-px w-[18px] bg-gradient-to-r from-border/34 via-border/24 to-border/0"
                    />
                    <div
                      aria-hidden="true"
                      data-testid="demo-content-lane-shoulder"
                      className="pointer-events-none absolute left-[18px] top-[14px] h-11 w-9 rounded-l-[18px] bg-gradient-to-r from-border/14 via-card/12 to-transparent"
                    />
                    <div
                      aria-hidden="true"
                      data-testid="demo-content-lane-cradle"
                      className="pointer-events-none absolute bottom-3 right-0 top-8 w-[15rem] rounded-l-[22px] bg-gradient-to-r from-card/[0.12] via-card/[0.08] to-transparent"
                    />
                  </>
                ) : null}
                <div
                  data-testid={isDemoContentWorkbench ? 'demo-content-lane-slot' : undefined}
                  data-demo-content-lane-slot={isDemoContentWorkbench ? 'groove' : undefined}
                  className={cn(
                    'relative z-[1] h-full',
                    isDemoContentWorkbench && 'mt-1.5 flex h-[min(24rem,100%)] w-full max-w-[14.95rem] self-end max-h-full items-stretch overflow-hidden rounded-l-[20px] border-l border-border/18 bg-gradient-to-r from-background/[0.14] via-card/[0.05] to-transparent pl-1.5 shadow-[inset_1px_0_0_rgba(148,163,184,0.16)] backdrop-blur-[2px]',
                  )}
                >
                  <div
                    data-testid={isDemoContentWorkbench ? 'demo-content-lane-body' : undefined}
                    data-demo-content-lane-fit={isDemoContentWorkbench ? 'nested' : undefined}
                    className={cn(
                      'flex-1',
                      isDemoContentWorkbench && 'flex h-full items-stretch rounded-l-[18px] bg-gradient-to-r from-background/[0.22] via-card/[0.1] to-transparent py-1.5 pr-0.75 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[1.5px] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
                    )}
                  >
                    <ChatPanel
                      messages={messages}
                      onSendMessage={onSendMessage}
                      onSelectOption={onSelectOption}
                      onSelectCard={onSelectCard}
                      onAction={onAction}
                      loading={loading}
                      stage={stage}
                      suggestedPrompts={suggestedPrompts}
                      title={title}
                      onTitleChange={onTitleChange}
                      onAttachImage={onAttachImage}
                      focusLabel={focusLabel}
                      focusTypeLabel={focusTypeLabel}
                      focusTask={focusTask}
                      headerMode="embedded"
                      embeddedTone={layoutPrefs.shellPosture === 'panoramic' || isDemoContentWorkbench ? 'ambient' : 'default'}
                      embeddedHeaderMode={isDemoContentWorkbench ? 'minimal' : 'default'}
                      embeddedComposerMode={isDemoContentWorkbench ? 'minimal' : 'default'}
                      embeddedSurfaceMode={isDemoContentWorkbench ? 'bare' : 'default'}
                      className={cn(
                        'h-full border-border/50 shadow-none',
                        layoutPrefs.shellPosture === 'panoramic' && 'rounded-[22px] bg-background/26',
                        layoutPrefs.shellPosture === 'card' && 'rounded-[22px] bg-background/34',
                        layoutPrefs.shellPosture === 'utility' && 'rounded-[20px] bg-background/30',
                        isDemoContentWorkbench && 'h-full w-full self-stretch rounded-[18px] border-transparent bg-transparent',
                      )}
                    />
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

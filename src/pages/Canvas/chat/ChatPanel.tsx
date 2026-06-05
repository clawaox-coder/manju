import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ArrowUp, Pencil, CheckCircle2, ImagePlus, Sparkles } from 'lucide-react';
import type { ChatMessage } from '../agent/types';
import { MessageThinking } from './MessageThinking';
import { MessageProgress } from './MessageProgress';
import { MessageAction } from './MessageAction';
import { AgentAvatar, AGENT_META, LEAD_AGENT_NAME } from './AgentAvatar';
import { cn } from '@/lib/utils';

interface ChatPanelProps {
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
  /** 用户从聊天框拖拽/粘贴/选择的图片 → 上层打开上传弹窗并落画布。 */
  onAttachImage?: (file: File) => void;
  focusLabel?: string | null;
  focusTypeLabel?: string | null;
  focusTask?: string | null;
  className?: string;
  headerMode?: 'full' | 'embedded' | 'floating';
  embeddedTone?: 'default' | 'ambient';
  embeddedHeaderMode?: 'default' | 'minimal';
  embeddedComposerMode?: 'default' | 'minimal';
  embeddedSurfaceMode?: 'default' | 'bare';
}

// 把 AI 文本渲染成分层结构：以 - / • 开头的行聚成 bullet 列表，其余按段落，
// 比一整段纯文字更有层次（参考图那种条理感）。
function renderRichText(text: string): ReactNode {
  const lines = text.split('\n');
  if (!lines.some((l) => /^\s*[-•]\s+/.test(l))) {
    return <p className="whitespace-pre-wrap">{text}</p>;
  }
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (k: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={k} className="list-disc pl-4 space-y-1 marker:text-primary/50">
        {bullets.map((b, i) => <li key={i}>{b}</li>)}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((ln, i) => {
    const mm = ln.match(/^\s*[-•]\s+(.*)/);
    if (mm) { bullets.push(mm[1]); return; }
    flush('u' + i);
    if (ln.trim()) blocks.push(<p key={'p' + i} className="whitespace-pre-wrap">{ln}</p>);
  });
  flush('uend');
  return <div className="space-y-1.5">{blocks}</div>;
}

export function ChatPanel({
  messages, onSendMessage, onSelectOption, onSelectCard, onAction, loading,
  stage, suggestedPrompts, title, onTitleChange, onAttachImage, focusLabel, focusTypeLabel, focusTask, className, headerMode = 'full', embeddedTone = 'default', embeddedHeaderMode = 'default', embeddedComposerMode = 'default', embeddedSurfaceMode = 'default',
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [dropActive, setDropActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // 标题内联编辑：editingTitle 非 null 时进入编辑态。
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle !== null) titleInputRef.current?.select();
  }, [editingTitle]);

  const commitTitle = () => {
    if (editingTitle === null) return;
    const next = editingTitle.trim();
    if (next && next !== title) onTitleChange(next);
    setEditingTitle(null);
  };

  useEffect(() => {
    if (scrollRef.current && typeof scrollRef.current.scrollTo === 'function') {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  // Only the latest AI message shows its quick-reply options (avoid stale pills).
  const lastAiId = [...messages].reverse().find((m) => m.role === 'ai')?.id;

  // Greeting-only / empty → render a centered hero instead of a top-anchored bubble.
  // 显式判断「对话尚未开始」：没有任何用户消息，且不存在可交互内容（options/cards/action）。
  // 比脆弱的 messages.length === 1 稳健。
  const hasUserMessage = messages.some((m) => m.role === 'user');
  const hasInteractive = messages.some(
    (m) => (m.options?.length ?? 0) > 0 || (m.cards?.length ?? 0) > 0 || m.type === 'action',
  );
  const firstAiText = messages.find((m) => m.role === 'ai' && m.type === 'text')?.text;
  const showHero = !hasUserMessage && !hasInteractive;
  const embedded = headerMode === 'embedded';
  const floating = headerMode === 'floating';
  const ambientEmbedded = embedded && embeddedTone === 'ambient';
  const minimalEmbeddedHeader = embedded && embeddedHeaderMode === 'minimal';
  const minimalEmbeddedComposer = embedded && embeddedComposerMode === 'minimal';
  const bareEmbeddedSurface = embedded && embeddedSurfaceMode === 'bare';
  const annotationEmbeddedLane = bareEmbeddedSurface && minimalEmbeddedHeader && minimalEmbeddedComposer;
  const headerOwnsFocusTask = (embedded || floating) && !!focusTask;
  const showAnnotationHero = annotationEmbeddedLane && showHero && suggestedPrompts.length > 0 && !headerOwnsFocusTask;
  const showBodyHero = (showHero && !ambientEmbedded && !headerOwnsFocusTask) || showAnnotationHero;
  const heroText = embedded
    ? (focusTask ?? (focusLabel ? `围绕 ${focusLabel} 继续判断与推进。` : '围绕当前对象继续判断与推进。'))
    : floating
      ? (focusTask ?? firstAiText ?? '可以从一个方向、一个镜头，或者眼下最卡的一步开始。')
      : (firstAiText ?? '嗨，我是你的创作搭档。想做个什么样的短片？一句灵感、一个画面，随便聊聊都行。');
  const inputPlaceholder = embedded
    ? (focusLabel ? `围绕 ${focusLabel} 继续判断、改写或推进…` : '围绕当前对象继续判断与推进…')
    : floating
      ? (focusLabel ? `围绕 ${focusLabel} 继续判断、改写或推进…` : '继续聊项目方向、镜头或当前卡点…')
      : (dropActive ? '松手添加参考图…' : '说说你想做的短片，比如：60 秒都市修仙…');
  const showStageChip = !ambientEmbedded && !floating;

  return (
    <div className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-border/80 bg-background/88 backdrop-blur-xl',
      embedded && 'rounded-[22px] border-border/60 bg-background/58 backdrop-blur-lg',
      floating && 'rounded-[24px] border-border/55 bg-background/74 backdrop-blur-lg',
      ambientEmbedded && 'border-border/40 bg-background/42',
      bareEmbeddedSurface && 'border-transparent bg-transparent backdrop-blur-0',
      className,
    )} data-testid={bareEmbeddedSurface ? 'bare-embedded-surface' : undefined} data-embedded-surface-mode={bareEmbeddedSurface ? 'bare' : 'default'}>
      <div
        data-testid={annotationEmbeddedLane ? 'annotation-embedded-header' : undefined}
        className={cn(
        'flex items-center justify-between gap-3 border-b border-border/80 bg-card/55',
        embedded ? 'px-3.5 py-2 bg-card/24 border-border/45' : floating ? 'px-3.5 py-2.5 bg-card/22 border-border/40' : 'px-4 py-3.5',
        ambientEmbedded && 'px-3 py-1.5 bg-card/16 border-border/35',
        minimalEmbeddedHeader && 'px-2.5 py-1 border-transparent bg-transparent',
        annotationEmbeddedLane && 'items-start gap-1 px-1.5 py-0.5',
      )}>
        <div className="min-w-0 flex-1">
          {embedded ? (
            <div>
              {!minimalEmbeddedHeader ? (
                <div className={cn('text-[12px] font-semibold text-foreground/85', ambientEmbedded && 'text-[11px] text-foreground/78')}>
                  导演协作
                </div>
              ) : null}
              {focusTask ? (
                <p className={cn(
                  'line-clamp-2 text-[10px] leading-4.5 text-muted-foreground/72',
                  !minimalEmbeddedHeader && 'mt-1',
                  ambientEmbedded && 'text-[9px] leading-4 text-muted-foreground/65',
                  ambientEmbedded && !minimalEmbeddedHeader && 'mt-0.5',
                  minimalEmbeddedHeader && 'text-[9px] leading-4 text-muted-foreground/62',
                  annotationEmbeddedLane && 'line-clamp-none text-[9px] leading-3.5 text-muted-foreground/56',
                )}>
                  {focusTask}
                </p>
              ) : (
                <p className={cn(
                  'text-[10px] leading-4.5 text-muted-foreground/72',
                  !minimalEmbeddedHeader && 'mt-1',
                  ambientEmbedded && 'text-[9px] leading-4 text-muted-foreground/65',
                  ambientEmbedded && !minimalEmbeddedHeader && 'mt-0.5',
                  minimalEmbeddedHeader && 'text-[9px] leading-4 text-muted-foreground/62',
                  annotationEmbeddedLane && 'text-[9px] leading-3.5 text-muted-foreground/56',
                )}>
                  围绕当前对象做判断与推进。
                </p>
              )}
            </div>
          ) : floating ? (
            <div>
              <div className="text-[12px] font-semibold text-foreground/84 truncate">
                {title || '未命名项目'}
              </div>
              {focusTask ? (
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-4.5 text-muted-foreground/68">
                  {focusTask}
                </p>
              ) : (
                <p className="mt-0.5 text-[10px] leading-4.5 text-muted-foreground/68">
                  围绕当前阶段继续推进。
                </p>
              )}
            </div>
          ) : editingTitle !== null ? (
            <input
              ref={titleInputRef}
              className="min-w-0 w-full bg-transparent text-sm font-semibold outline-none border-b border-brand/50 pb-0.5"
              value={editingTitle}
              maxLength={16}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                else if (e.key === 'Escape') { e.preventDefault(); setEditingTitle(null); }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(title)}
              title="点击修改标题"
              className="group flex items-center gap-1.5 min-w-0 text-left"
            >
              <span className="text-sm font-semibold truncate">
                {title || '未命名项目'}
              </span>
              <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 shrink-0 transition" />
            </button>
          )}
          {!minimalEmbeddedHeader ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {showStageChip && (
                <span className={cn(
                  'flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground shrink-0',
                  embedded && 'rounded-full border-border/45 bg-background/42 px-1.5 py-0.5 text-[9px]',
                  floating && 'rounded-full border-border/40 bg-background/34 px-1.5 py-0.5 text-[9px]',
                )}>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                  {stage}
                </span>
              )}
              {focusLabel && (
                <span className={cn(
                  'max-w-full truncate rounded-md border border-brand/20 bg-brand/5 px-2 py-1 text-[11px] font-medium text-foreground/85',
                  embedded && 'max-w-[13rem] rounded-full border-brand/15 bg-brand/[0.04] px-1.5 py-0.5 text-[9px] text-foreground/72',
                  floating && 'max-w-[14rem] rounded-full border-brand/12 bg-brand/[0.03] px-1.5 py-0.5 text-[9px] text-foreground/68',
                  ambientEmbedded && 'max-w-[11.5rem] border-brand/10 bg-transparent px-0 py-0 text-[9px] text-foreground/62',
                )}>
                  {focusTypeLabel ? `${focusTypeLabel} · ` : ''}{focusLabel}
                </span>
              )}
            </div>
          ) : null}
          {focusTask && !embedded && !floating && (
            <p className={cn(
              'mt-2 text-xs leading-5 text-muted-foreground',
              embedded && 'text-[11px] leading-5 text-muted-foreground/80',
            )}>
              当前任务: {focusTask}
            </p>
          )}
        </div>
      </div>

      {showBodyHero ? (
        <div className={cn(
          'flex flex-1 flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-card/30 to-transparent px-6 text-center',
          embedded && 'items-start justify-start from-transparent to-transparent px-3.5 pb-3 pt-3 text-left',
          floating && 'items-start justify-start from-transparent to-transparent px-4 pb-4 pt-4 text-left',
          ambientEmbedded && 'px-3 pb-2 pt-2',
          bareEmbeddedSurface && 'px-1.5 pb-1.5 pt-1 text-left',
        )}>
          {!embedded && !floating && (
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand/20 bg-brand/10 text-brand shadow-[0_16px_40px_rgba(37,99,235,0.16)]">
              <Sparkles className="h-7 w-7" />
            </div>
          )}
          <p className={cn(
            'text-[15px] leading-relaxed text-foreground/90 max-w-[320px] mb-6 whitespace-pre-wrap',
            embedded && 'mb-3 max-w-[260px] text-[12px] leading-5 text-foreground/76',
            floating && 'mb-4 max-w-[280px] text-[13px] leading-5 text-foreground/78',
            ambientEmbedded && 'mb-2 max-w-[220px] text-[11px] leading-4.5 text-foreground/68',
            bareEmbeddedSurface && 'mb-1.5 max-w-[210px] text-[10.5px] leading-4 text-foreground/64',
          )}>
            {heroText}
          </p>
          {suggestedPrompts.length > 0 && (
            <div
              data-testid={annotationEmbeddedLane ? 'annotation-hero-prompts' : undefined}
              data-annotation-action-list={annotationEmbeddedLane ? 'true' : undefined}
              className={cn(
                'w-full max-w-[340px] space-y-2',
                embedded && 'max-w-[260px] space-y-1.5',
                floating && 'max-w-[300px] space-y-1.5',
                bareEmbeddedSurface && 'max-w-[220px] space-y-1',
                annotationEmbeddedLane && 'max-w-[210px] space-y-0.5',
              )}
            >
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className={cn(
                    'group w-full flex items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 py-3 text-left text-[13px] text-foreground/80 shadow-sm hover:border-brand/40 hover:bg-brand/5 hover:text-foreground transition',
                    embedded && 'rounded-[14px] border-border/45 bg-card/38 px-2.5 py-2 text-[11px] shadow-none',
                    floating && 'rounded-[16px] border-border/45 bg-card/36 px-3 py-2.5 text-[12px] shadow-none',
                    ambientEmbedded && 'rounded-[12px] border-border/35 bg-card/26 px-2 py-1.5 text-[10px]',
                    bareEmbeddedSurface && 'gap-2 rounded-[10px] border-transparent bg-transparent px-1.5 py-1 text-[10px] text-foreground/68 hover:bg-card/[0.08]',
                    annotationEmbeddedLane && 'gap-1.5 rounded-none border-l border-border/16 bg-transparent pl-2 pr-0 py-0.75 text-[9.5px] text-foreground/64 hover:border-foreground/18 hover:bg-transparent hover:text-foreground/82',
                  )}
                  onClick={() => onSendMessage(prompt)}
                >
                  <Sparkles className={cn('w-3.5 h-3.5 text-brand/70 group-hover:text-brand shrink-0', annotationEmbeddedLane && 'h-3 w-3 text-brand/50 group-hover:text-brand/78')} />
                  <span className="flex-1">{prompt}</span>
                  <ArrowUp className={cn('w-3.5 h-3.5 text-muted-foreground/40 rotate-45 group-hover:text-brand transition', annotationEmbeddedLane && 'h-3 w-3 text-muted-foreground/30 group-hover:text-brand/70')} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
      <div ref={scrollRef} data-testid={bareEmbeddedSurface ? 'bare-embedded-message-stream' : undefined} className={cn(
          'flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-background/20 to-card/25 px-4 py-4',
          embedded && 'space-y-2.5 from-transparent to-transparent px-3.5 py-3',
          floating && 'space-y-2.5 from-transparent to-transparent px-3.5 py-3',
          ambientEmbedded && 'space-y-1.5 from-transparent to-transparent px-2.5 py-2',
          bareEmbeddedSurface && 'space-y-1 from-transparent to-transparent px-1.5 py-1',
          annotationEmbeddedLane && 'space-y-0.75 px-1 py-0.75',
        )}>
          {messages.map((m) => (
            <div key={m.id}>
              {/* AI 身份徽章：前台始终是同一个主创搭档，同时明确标出当前实际协作的专业 agent。 */}
              {m.role === 'ai' && m.type !== 'milestone' && !embedded && !floating && (
                <div className="inline-flex items-center gap-1.5 mb-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full bg-card border border-border shadow-sm">
                  <div className="w-7 h-7 rounded-full bg-background flex items-center justify-center overflow-hidden shrink-0">
                    <AgentAvatar role={m.agentRole ?? 'idea'} size={26} busy={loading && m.id === lastAiId} />
                  </div>
                  <div className="min-w-0 leading-tight">
                    <div className="text-[11px] font-semibold text-foreground/85">{LEAD_AGENT_NAME}</div>
                    <div className="text-[10px] text-muted-foreground">
                      当前协作: {AGENT_META[m.agentRole ?? 'idea'].specialist}
                    </div>
                  </div>
                </div>
              )}
              {m.type === 'milestone' ? (
                <div
                  data-testid={annotationEmbeddedLane ? `annotation-milestone-${m.id}` : undefined}
                  className={cn(
                  'flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/[0.06] px-3.5 py-2.5 shadow-sm',
                  embedded && 'rounded-xl px-3 py-2 text-[12px] shadow-none',
                  annotationEmbeddedLane && 'items-start gap-1.5 rounded-none border-transparent bg-transparent px-0 py-0.5 shadow-none',
                )}>
                  <CheckCircle2 className={cn('w-4 h-4 text-brand shrink-0', annotationEmbeddedLane && 'mt-0.5 h-3 w-3 text-brand/60')} />
                  <span className={cn('text-[12.5px] font-medium text-foreground/90', annotationEmbeddedLane && 'text-[10px] font-medium text-foreground/70')}>
                    {m.text}
                  </span>
                </div>
              ) : (
                <div
                  data-testid={annotationEmbeddedLane ? `annotation-message-${m.role}-${m.id}` : undefined}
                  data-annotation-message-role={annotationEmbeddedLane ? m.role : undefined}
                  className={cn(
                    'flex',
                    annotationEmbeddedLane
                      ? 'justify-start'
                      : m.role === 'user'
                        ? 'justify-end'
                        : 'justify-start',
                    annotationEmbeddedLane && m.role === 'user' && 'pl-2.5',
                    annotationEmbeddedLane && m.role === 'system' && 'pl-1',
                  )}
                >
                  <div className={cn(
                    'max-w-[85%] rounded-lg px-3.5 py-2.5 shadow-sm',
                    m.role === 'user' ? 'bg-foreground text-background'
                      : m.role === 'system' ? 'bg-transparent text-muted-foreground text-[11px] italic'
                      : 'bg-card border border-border/70'
                    ,
                    embedded && m.role === 'user' && 'rounded-2xl px-3 py-2 text-[12px] shadow-none',
                    embedded && m.role === 'ai' && 'rounded-2xl border-border/55 bg-card/55 px-3 py-2 text-[12px] shadow-none',
                    embedded && m.role === 'system' && 'text-[10px]',
                    floating && m.role === 'user' && 'rounded-[18px] px-3 py-2 text-[12px] shadow-none',
                    floating && m.role === 'ai' && 'rounded-[18px] border-border/45 bg-card/42 px-3 py-2 text-[12px] shadow-none',
                    ambientEmbedded && m.role === 'user' && 'rounded-[16px] border border-foreground/6 bg-foreground/[0.08] px-2.5 py-1.5 text-[11px] text-foreground/86',
                    ambientEmbedded && m.role === 'ai' && 'rounded-[16px] border border-transparent bg-transparent px-1.5 py-1 text-[10.5px] text-foreground/72',
                    ambientEmbedded && m.role === 'system' && 'text-[10px] text-muted-foreground/60',
                    bareEmbeddedSurface && m.role === 'user' && 'rounded-[14px] border border-transparent bg-foreground/[0.06] px-2 py-1 text-[10.5px] text-foreground/82',
                    bareEmbeddedSurface && m.role === 'ai' && 'rounded-[14px] border border-transparent bg-transparent px-0.5 py-0.5 text-[10px] text-foreground/66',
                    bareEmbeddedSurface && m.role === 'system' && 'text-[9.5px] text-muted-foreground/58',
                    annotationEmbeddedLane && 'max-w-full rounded-none border-transparent bg-transparent px-0 py-0 shadow-none',
                    annotationEmbeddedLane && m.role === 'user' && 'border-l border-border/24 pl-2 pr-0 text-foreground/76',
                    annotationEmbeddedLane && m.role === 'ai' && 'text-foreground/66',
                    annotationEmbeddedLane && m.role === 'system' && 'text-muted-foreground/56',
                  )}>
                    {m.thinking && (
                      <div data-testid={annotationEmbeddedLane ? `annotation-thinking-${m.id}` : undefined}>
                        <MessageThinking
                          text={m.thinking}
                          collapsed={!expandedThinking.has(m.id)}
                          variant={annotationEmbeddedLane ? 'annotation' : 'default'}
                          onToggle={() => setExpandedThinking((s) => {
                            const n = new Set(s);
                            if (n.has(m.id)) n.delete(m.id); else n.add(m.id);
                            return n;
                          })}
                        />
                      </div>
                    )}
                    {m.text && (
                      <div className={cn(
                        'text-[13px] leading-relaxed',
                        ambientEmbedded && 'text-[11.5px] leading-5',
                        bareEmbeddedSurface && 'text-[10.5px] leading-4.5',
                        annotationEmbeddedLane && 'text-[10px] leading-4',
                      )}>
                        {renderRichText(m.text)}
                      </div>
                    )}
                    {m.type === 'progress' && m.progress && (
                      <div
                        data-testid={annotationEmbeddedLane ? `annotation-progress-${m.id}` : undefined}
                        className={cn('mt-2', annotationEmbeddedLane && 'mt-1 opacity-80')}
                      >
                        <MessageProgress
                          current={m.progress.current}
                          total={m.progress.total}
                          label={m.progress.label}
                          variant={annotationEmbeddedLane ? 'annotation' : 'default'}
                        />
                      </div>
                    )}
                    {m.type === 'action' && m.action && (
                      <div
                        data-testid={annotationEmbeddedLane ? `annotation-action-${m.id}` : undefined}
                        className={cn('mt-2', annotationEmbeddedLane && 'mt-1 opacity-85')}
                      >
                        <MessageAction
                          label={m.action.label}
                          description={m.action.description}
                          icon={m.action.icon}
                          variant={annotationEmbeddedLane ? 'annotation' : 'default'}
                          onClick={() => onAction(m.action!.label)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* 剧本候选卡片组 —— 候选作为「对话内的决策」呈现，可点选 */}
              {m.role === 'ai' && m.type === 'card-group' && m.cards && m.cards.length > 0 && (
                <div
                  data-testid={annotationEmbeddedLane ? `annotation-card-group-${m.id}` : undefined}
                  data-annotation-action-list={annotationEmbeddedLane ? 'true' : undefined}
                  className={cn('mt-2 space-y-2', annotationEmbeddedLane && 'mt-1 space-y-0.5')}
                >
                  {m.cards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      disabled={loading}
                      className={cn(
                        'group w-full text-left rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm hover:border-brand/40 hover:bg-brand/5 transition disabled:opacity-50 disabled:cursor-not-allowed',
                        embedded && 'rounded-xl border-border/55 bg-card/55 px-3 py-2.5 shadow-none',
                        floating && 'rounded-[16px] border-border/45 bg-card/42 px-3 py-2.5 shadow-none',
                        bareEmbeddedSurface && 'rounded-[12px] border-transparent bg-transparent px-1.5 py-1.5 hover:bg-card/[0.08]',
                        annotationEmbeddedLane && 'rounded-[10px] px-1 py-1 hover:bg-card/[0.06]',
                        annotationEmbeddedLane && 'rounded-none border-l border-border/16 bg-transparent pl-2 pr-0 py-1 hover:border-foreground/18 hover:bg-transparent hover:text-foreground/82',
                      )}
                      onClick={() => onSelectCard(card.id)}
                    >
                      <div className={cn('flex items-center gap-2 mb-1', annotationEmbeddedLane && 'mb-0.5 gap-1.5')}>
                        {card.emoji && <span className={cn('text-sm', annotationEmbeddedLane && 'text-[10px]')}>{card.emoji}</span>}
                        <span className={cn('text-[13px] font-medium text-foreground group-hover:text-brand transition-colors', annotationEmbeddedLane && 'text-[10px] font-medium text-foreground/72 group-hover:text-foreground/84')}>{card.title}</span>
                      </div>
                      <p className={cn('text-[12px] leading-relaxed text-muted-foreground line-clamp-3 whitespace-pre-wrap', annotationEmbeddedLane && 'text-[9.5px] leading-4 text-muted-foreground/60')}>{card.description}</p>
                    </button>
                  ))}
                </div>
              )}
              {/* 快捷回复：全宽大按钮（参考图样式），仅最新 AI 轮显示 */}
              {m.role === 'ai' && m.id === lastAiId && m.options && m.options.length > 0 && !loading && (
                <div
                  data-testid={annotationEmbeddedLane ? 'annotation-quick-replies' : undefined}
                  data-annotation-action-list={annotationEmbeddedLane ? 'true' : undefined}
                  className={cn('flex flex-col gap-2 mt-2.5', annotationEmbeddedLane && 'mt-1.5 gap-0.5')}
                >
                  {m.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={cn(
                        'group w-full flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-left text-[13px] text-foreground/85 shadow-sm hover:border-brand/40 hover:bg-brand/5 hover:text-foreground transition',
                        embedded && 'rounded-xl border-border/55 bg-card/55 px-3 py-2 text-[12px] shadow-none',
                        floating && 'rounded-[16px] border-border/45 bg-card/42 px-3 py-2 text-[12px] shadow-none',
                        bareEmbeddedSurface && 'rounded-[12px] border-transparent bg-transparent px-1.5 py-1.5 text-[10.5px] text-foreground/72 hover:bg-card/[0.08]',
                        annotationEmbeddedLane && 'gap-1.5 rounded-[10px] px-1 py-1 text-[10px] text-foreground/68 hover:bg-card/[0.06]',
                        annotationEmbeddedLane && 'rounded-none border-l border-border/16 bg-transparent pl-2 pr-0 py-0.75 text-[9.5px] text-foreground/64 hover:border-foreground/18 hover:bg-transparent hover:text-foreground/82',
                      )}
                      onClick={() => onSelectOption(opt.value)}
                    >
                      <Sparkles className={cn('w-3.5 h-3.5 text-brand/70 group-hover:text-brand shrink-0', annotationEmbeddedLane && 'h-3 w-3 text-brand/50 group-hover:text-brand/78')} />
                      <span className="flex-1">{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div
              data-testid={annotationEmbeddedLane ? 'annotation-loading-line' : undefined}
              className={cn('flex justify-start', annotationEmbeddedLane && 'pl-0.5')}
            >
              <div className={cn(
                'bg-card border border-border/70 rounded-lg px-3.5 py-2.5 shadow-sm',
                embedded && 'rounded-xl border-border/55 bg-card/55 px-3 py-2 shadow-none',
                floating && 'rounded-[16px] border-border/45 bg-card/42 px-3 py-2 shadow-none',
                bareEmbeddedSurface && 'rounded-[12px] border-transparent bg-transparent px-1 py-0.5',
                annotationEmbeddedLane && 'flex items-center gap-1.5 rounded-none border-transparent bg-transparent px-0 py-0.5 shadow-none',
              )}>
                <div className="flex gap-1">
                  <span className={cn('w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce', annotationEmbeddedLane && 'h-1 w-1 bg-muted-foreground/40')} />
                  <span className={cn('w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.1s]', annotationEmbeddedLane && 'h-1 w-1 bg-muted-foreground/40')} />
                  <span className={cn('w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.2s]', annotationEmbeddedLane && 'h-1 w-1 bg-muted-foreground/40')} />
                </div>
                {annotationEmbeddedLane ? (
                  <span className="text-[9.5px] text-muted-foreground/56">继续整理中…</span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      <div className={cn(
        'border-t border-border/80 bg-card/55 px-4 py-3',
        embedded && 'border-border/40 bg-card/18 px-3 py-2',
        floating && 'border-border/35 bg-card/16 px-3 py-2',
        ambientEmbedded && 'border-transparent bg-transparent px-2.5 py-1',
        minimalEmbeddedComposer && 'border-transparent bg-transparent px-2 py-0.5',
        bareEmbeddedSurface && 'px-1.5 py-0.5',
        annotationEmbeddedLane && 'px-1 py-0.25',
      )}>
        <div
          data-testid={annotationEmbeddedLane ? 'annotation-composer' : minimalEmbeddedComposer ? 'minimal-embedded-composer' : undefined}
          data-annotation-composer-style={annotationEmbeddedLane ? 'inline' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5 shadow-sm transition',
            embedded && 'rounded-[18px] border-border/40 bg-background/46 px-2.5 py-1.5 shadow-none',
            floating && 'rounded-[18px] border-border/35 bg-background/42 px-2.5 py-1.5 shadow-none',
            ambientEmbedded && 'rounded-[15px] border-border/20 bg-background/28 px-2 py-1',
            minimalEmbeddedComposer && 'rounded-[13px] border-transparent bg-background/18 px-1.5 py-0.5',
            bareEmbeddedSurface && 'rounded-[12px] border-transparent bg-background/12 px-1.5 py-0.5',
            annotationEmbeddedLane && 'gap-1 rounded-none border-x-0 border-t-0 border-b border-border/18 bg-transparent px-0 py-0.25 shadow-none focus-within:border-foreground/18 focus-within:ring-0',
            annotationEmbeddedLane
              ? (dropActive ? 'border-brand/40 border-dashed bg-brand/[0.03]' : '')
              : (dropActive ? 'border-brand border-dashed bg-brand/5' : 'border-border focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/10'),
          )}
          onDragOver={onAttachImage ? (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropActive(true); } } : undefined}
          onDragLeave={onAttachImage ? () => setDropActive(false) : undefined}
          onDrop={onAttachImage ? (e) => {
            const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/'));
            if (f) { e.preventDefault(); setDropActive(false); onAttachImage(f); }
          } : undefined}
        >
          {onAttachImage && (
            <>
              <button
                type="button"
                title="添加角色/风格参考图"
                aria-label="添加参考图"
                data-testid={annotationEmbeddedLane ? 'annotation-attach-action' : undefined}
                className={cn(
                  'text-muted-foreground hover:text-brand transition shrink-0',
                  ambientEmbedded && 'scale-90',
                  minimalEmbeddedComposer && 'scale-[0.82]',
                  annotationEmbeddedLane && 'scale-[0.74] text-muted-foreground/34 hover:text-foreground/62',
                )}
                onClick={() => imageInputRef.current?.click()}
                disabled={loading}
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onAttachImage(f); e.target.value = ''; }}
              />
            </>
          )}
          <input
            aria-label="创作输入"
            className={cn(
              'flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground',
              embedded && 'text-[12px]',
              floating && 'text-[12px]',
              ambientEmbedded && 'text-[11px]',
              minimalEmbeddedComposer && 'text-[10.5px]',
              annotationEmbeddedLane && 'text-[10px] text-foreground/70 placeholder:text-muted-foreground/44',
            )}
            placeholder={dropActive ? '松手添加参考图…' : inputPlaceholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            onPaste={onAttachImage ? (e) => {
              const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith('image/'));
              if (f) { e.preventDefault(); onAttachImage(f); }
            } : undefined}
            disabled={loading}
          />
          <button
            type="button"
            aria-label="发送消息"
            data-testid={annotationEmbeddedLane ? 'annotation-send-action' : undefined}
            className={cn(
              'w-8 h-8 rounded-lg bg-foreground flex items-center justify-center text-background disabled:opacity-40 transition shrink-0',
              embedded && 'h-7 w-7 rounded-full bg-foreground/92',
              floating && 'h-7 w-7 rounded-full bg-foreground/90',
              ambientEmbedded && 'h-6 w-6 bg-foreground/88',
              minimalEmbeddedComposer && 'h-5.5 w-5.5 bg-foreground/78',
              annotationEmbeddedLane && 'h-4.5 w-4.5 rounded-none bg-transparent text-foreground/46 hover:text-foreground/72',
            )}
            onClick={handleSend}
            disabled={!input.trim() || loading}
          >
            <ArrowUp className={cn('w-3.5 h-3.5', embedded && 'h-3 w-3', ambientEmbedded && 'h-2.5 w-2.5', minimalEmbeddedComposer && 'h-2.5 w-2.5', annotationEmbeddedLane && 'h-2.5 w-2.5')} />
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ArrowUp, Sparkles, Pencil, CheckCircle2 } from 'lucide-react';
import type { ChatMessage } from '../agent/types';
import { MessageThinking } from './MessageThinking';
import { MessageProgress } from './MessageProgress';
import { MessageAction } from './MessageAction';
import { AgentAvatar, AGENT_META } from './AgentAvatar';
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
  stage, suggestedPrompts, title, onTitleChange,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
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
  const heroText = firstAiText
    ?? '嗨，我是你的创作搭档。想做个什么样的短片？一句灵感、一个画面，随便聊聊都行。';

  return (
    <div className="w-[420px] max-w-[45vw] flex flex-col h-full border-r border-border bg-background/95 backdrop-blur-xl">
      {/* 顶栏：头像 + 可编辑项目名（左），当前状态（右） */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-xl gradient-brand flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          {editingTitle !== null ? (
            <input
              ref={titleInputRef}
              className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none border-b border-primary/50 pb-0.5"
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
              <span className="text-sm font-medium truncate">
                {title || '未命名项目'}
              </span>
              <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 shrink-0 transition" />
            </button>
          )}
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
          {stage}
        </span>
      </div>

      {showHero ? (
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 text-center">
          <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center shadow-lg shadow-primary/20 mb-5">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <p className="text-[15px] leading-relaxed text-foreground/90 max-w-[320px] mb-6 whitespace-pre-wrap">
            {heroText}
          </p>
          {suggestedPrompts.length > 0 && (
            <div className="w-full max-w-[340px] space-y-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="group w-full flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-left text-[13px] text-foreground/80 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground transition"
                  onClick={() => onSendMessage(prompt)}
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary/60 group-hover:text-primary shrink-0" />
                  <span className="flex-1">{prompt}</span>
                  <ArrowUp className="w-3.5 h-3.5 text-muted-foreground/40 rotate-45 group-hover:text-primary transition" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m) => (
            <div key={m.id}>
              {/* AI 身份徽章：按阶段换角色（创意总监🦊/编剧🦉/导演🐯/声优🐱/剪辑🦫） */}
              {m.role === 'ai' && m.type !== 'milestone' && (
                <div className="inline-flex items-center gap-1.5 mb-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/20">
                  <div className="w-7 h-7 rounded-full bg-background/80 flex items-center justify-center overflow-hidden shrink-0">
                    <AgentAvatar role={m.agentRole ?? 'idea'} size={26} busy={loading && m.id === lastAiId} />
                  </div>
                  <span className="text-[11px] font-semibold text-foreground/80">{AGENT_META[m.agentRole ?? 'idea'].name}</span>
                </div>
              )}
              {m.type === 'milestone' ? (
                <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3.5 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-[12.5px] font-medium text-foreground/90">{m.text}</span>
                </div>
              ) : (
                <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5',
                    m.role === 'user' ? 'bg-primary text-primary-foreground'
                      : m.role === 'system' ? 'bg-transparent text-muted-foreground text-[11px] italic'
                      : 'bg-muted/60'
                  )}>
                    {m.thinking && (
                      <MessageThinking
                        text={m.thinking}
                        collapsed={!expandedThinking.has(m.id)}
                        onToggle={() => setExpandedThinking((s) => {
                          const n = new Set(s);
                          if (n.has(m.id)) n.delete(m.id); else n.add(m.id);
                          return n;
                        })}
                      />
                    )}
                    {m.text && <div className="text-[13px] leading-relaxed">{renderRichText(m.text)}</div>}
                    {m.type === 'progress' && m.progress && (
                      <div className="mt-2"><MessageProgress current={m.progress.current} total={m.progress.total} label={m.progress.label} /></div>
                    )}
                    {m.type === 'action' && m.action && (
                      <div className="mt-2"><MessageAction label={m.action.label} description={m.action.description} icon={m.action.icon} onClick={() => onAction(m.action!.label)} /></div>
                    )}
                  </div>
                </div>
              )}
              {/* 剧本候选卡片组 —— 候选作为「对话内的决策」呈现，可点选 */}
              {m.role === 'ai' && m.type === 'card-group' && m.cards && m.cards.length > 0 && (
                <div className="mt-2 space-y-2">
                  {m.cards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      disabled={loading}
                      className="group w-full text-left rounded-xl border border-border bg-card px-3.5 py-3 hover:border-primary/40 hover:bg-primary/5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => onSelectCard(card.id)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {card.emoji && <span className="text-sm">{card.emoji}</span>}
                        <span className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors">{card.title}</span>
                      </div>
                      <p className="text-[12px] leading-relaxed text-muted-foreground line-clamp-3 whitespace-pre-wrap">{card.description}</p>
                    </button>
                  ))}
                </div>
              )}
              {/* 快捷回复：全宽大按钮（参考图样式），仅最新 AI 轮显示 */}
              {m.role === 'ai' && m.id === lastAiId && m.options && m.options.length > 0 && !loading && (
                <div className="flex flex-col gap-2 mt-2.5">
                  {m.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className="group w-full flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-[13px] text-foreground/85 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground transition"
                      onClick={() => onSelectOption(opt.value)}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-primary/60 group-hover:text-primary shrink-0" />
                      <span className="flex-1">{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted/60 rounded-2xl px-3.5 py-2.5">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.1s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.2s]" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 focus-within:border-primary/40 transition">
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="说说你想做的短片，比如：60 秒都市修仙…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={loading}
          />
          <button
            type="button"
            className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 transition"
            onClick={handleSend}
            disabled={!input.trim() || loading}
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

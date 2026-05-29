import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../agent/types';
import { MessageThinking } from './MessageThinking';
import { MessageCardGroup } from './MessageCardGroup';
import { MessageProgress } from './MessageProgress';
import { MessageAction } from './MessageAction';
import { OptionPill } from './OptionPill';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSelectOption: (value: string) => void;
  onSelectCard: (cardId: string) => void;
  onAction: (action: string) => void;
  loading: boolean;
  contextIndicator: string | null;
  onExitContext: () => void;
}

export function ChatPanel({
  messages, onSendMessage, onSelectOption, onSelectCard, onAction, loading, contextIndicator, onExitContext,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [collapsedThinking, setCollapsedThinking] = useState<Set<string>>(new Set());
  const [online, setOnline] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="w-[340px] border-l border-border flex flex-col bg-card/50 backdrop-blur">
      {!online && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-center">
          <span className="text-xs text-amber-700 dark:text-amber-400">网络已断开，恢复后将自动重连</span>
        </div>
      )}
      {contextIndicator && (
        <div className="px-4 py-2 bg-primary/5 border-b border-primary/20 flex items-center justify-between">
          <span className="text-xs text-primary">{contextIndicator}</span>
          <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={onExitContext}>
            返回主线
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'} rounded-2xl px-3.5 py-2.5`}>
              {msg.thinking && (
                <MessageThinking
                  text={msg.thinking}
                  collapsed={collapsedThinking.has(msg.id)}
                  onToggle={() => setCollapsedThinking((s) => {
                    const n = new Set(s);
                    if (n.has(msg.id)) n.delete(msg.id); else n.add(msg.id);
                    return n;
                  })}
                />
              )}
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              {msg.type === 'options' && msg.options && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {msg.options.map((opt) => (
                    <OptionPill key={opt.value} label={opt.label} value={opt.value} onClick={onSelectOption} />
                  ))}
                </div>
              )}
              {msg.type === 'card-group' && msg.cards && (
                <div className="mt-2.5">
                  <MessageCardGroup cards={msg.cards} onSelect={onSelectCard} selectedId={msg.selectedCard} />
                </div>
              )}
              {msg.type === 'progress' && msg.progress && (
                <div className="mt-2">
                  <MessageProgress current={msg.progress.current} total={msg.progress.total} label={msg.progress.label} />
                </div>
              )}
              {msg.type === 'action' && msg.action && (
                <div className="mt-2.5">
                  <MessageAction label={msg.action.label} description={msg.action.description} icon={msg.action.icon} onClick={() => onAction(msg.action!.label)} />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl px-3.5 py-2.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.1s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={online ? '说点什么...' : '网络已断开...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={loading || !online}
          />
          <button className="text-xs text-primary font-medium disabled:opacity-40" onClick={handleSend} disabled={!input.trim() || loading || !online}>
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
interface MessageThinkingProps {
  text: string;
  collapsed: boolean;
  onToggle: () => void;
  variant?: 'default' | 'annotation';
}

export function MessageThinking({ text, collapsed, onToggle, variant = 'default' }: MessageThinkingProps) {
  const annotation = variant === 'annotation';

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className={annotation
          ? 'inline-flex items-center gap-1 text-[9.5px] text-muted-foreground/56 hover:text-foreground/74 transition'
          : 'text-[11px] text-muted-foreground hover:text-foreground transition'}
      >
        <span aria-hidden="true">{annotation ? '··' : '💭'}</span>
        <span>{annotation ? '展开判断脉络' : '思考了几个方向...'}</span>
      </button>
    );
  }

  return (
    <div
      className={annotation
        ? 'mb-1 cursor-pointer border-l border-border/26 pl-2 pr-0 py-0.5 hover:border-border/42 transition'
        : 'border border-dashed border-border/60 rounded-lg px-3 py-2 mb-2 cursor-pointer hover:border-border transition'}
      onClick={onToggle}
    >
      <p className={annotation
        ? 'text-[9.5px] text-muted-foreground/62 leading-4 whitespace-pre-wrap'
        : 'text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-wrap'}>
        {text}
      </p>
    </div>
  );
}

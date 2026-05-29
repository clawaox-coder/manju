interface MessageThinkingProps {
  text: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function MessageThinking({ text, collapsed, onToggle }: MessageThinkingProps) {
  if (collapsed) {
    return (
      <button onClick={onToggle} className="text-[11px] text-muted-foreground hover:text-foreground transition">
        💭 思考了几个方向...
      </button>
    );
  }

  return (
    <div
      className="border border-dashed border-border/60 rounded-lg px-3 py-2 mb-2 cursor-pointer hover:border-border transition"
      onClick={onToggle}
    >
      <p className="text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}

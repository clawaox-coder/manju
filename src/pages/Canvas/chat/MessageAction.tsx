interface MessageActionProps {
  label: string;
  description: string;
  icon: string;
  onClick: () => void;
  variant?: 'default' | 'annotation';
}

export function MessageAction({ label, description, icon, onClick, variant = 'default' }: MessageActionProps) {
  const annotation = variant === 'annotation';

  return (
    <button
      className={annotation
        ? 'w-full text-left border-l border-primary/18 pl-2 pr-0 py-0.5 hover:border-primary/28 transition-colors'
        : 'w-full bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-4 text-left hover:from-primary/15 hover:to-primary/10 transition-all duration-200 active:scale-[0.98]'}
      onClick={onClick}
    >
      <div className={annotation ? 'flex items-start gap-1.5' : 'flex items-center gap-3'}>
        <span className={annotation ? 'text-[11px] leading-4 text-primary/60' : 'text-2xl'}>{icon}</span>
        <div>
          <div className={annotation ? 'text-[10px] font-medium text-foreground/72' : 'text-sm font-semibold'}>
            {label}
          </div>
          <div className={annotation ? 'text-[9.5px] leading-4 text-muted-foreground/58' : 'text-[11px] text-muted-foreground'}>
            {description}
          </div>
        </div>
      </div>
    </button>
  );
}

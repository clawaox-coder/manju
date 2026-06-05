interface MessageProgressProps {
  current: number;
  total: number;
  label: string;
  variant?: 'default' | 'annotation';
}

export function MessageProgress({ current, total, label, variant = 'default' }: MessageProgressProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const annotation = variant === 'annotation';

  return (
    <div className={annotation ? 'space-y-1' : 'space-y-1.5'}>
      <p className={annotation ? 'text-[9.5px] text-muted-foreground/58' : 'text-[12px] text-muted-foreground'}>
        {annotation ? `${label} · ${current}/${total}` : label}
      </p>
      <div className={annotation ? 'h-1 bg-muted/55 rounded-full overflow-hidden' : 'h-1.5 bg-muted rounded-full overflow-hidden'}>
        <div
          className={annotation
            ? 'h-full bg-primary/55 rounded-full transition-all duration-500 ease-out'
            : 'h-full bg-primary/70 rounded-full transition-all duration-500 ease-out'}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!annotation ? <p className="text-[10px] text-muted-foreground/70 text-right">{current}/{total}</p> : null}
    </div>
  );
}

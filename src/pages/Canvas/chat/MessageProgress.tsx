interface MessageProgressProps {
  current: number;
  total: number;
  label: string;
}

export function MessageProgress({ current, total, label }: MessageProgressProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/70 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/70 text-right">{current}/{total}</p>
    </div>
  );
}

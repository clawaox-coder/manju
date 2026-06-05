import { cn } from '@/lib/utils';

interface DemoWorkbenchNoticeProps {
  workflow: string;
  note?: string;
  className?: string;
  surface?: 'card' | 'embedded';
}

export function DemoWorkbenchNotice({
  workflow,
  note,
  className,
  surface = 'card',
}: DemoWorkbenchNoticeProps) {
  const summary = surface === 'embedded'
    ? `真实项目里，这里会直接进入${workflow}。`
    : `当前是本地演示模式。打开真实项目后，这里会直接进入${workflow}。`;

  return (
    <div
      data-testid="demo-workbench-notice"
      data-surface={surface}
      className={cn(
        surface === 'card' && 'rounded-[16px] bg-card/12 px-4 py-3.5 ring-1 ring-border/24',
        surface === 'embedded' && 'px-0 py-0',
        className,
      )}
    >
      {surface === 'card' ? (
        <div className="mb-2 text-[11px] font-medium text-muted-foreground">演示工作态</div>
      ) : null}
      <p className="text-[12px] leading-6 text-muted-foreground">{summary}</p>
      {note ? (
        <p className="mt-2 text-[11px] leading-6 text-muted-foreground/90">{note}</p>
      ) : null}
    </div>
  );
}

import { cn } from '@/lib/utils';

export function WorkbenchPlaceholder({
  text,
  tone = 'default',
}: {
  text: string;
  tone?: 'default' | 'utility';
}) {
  return (
    <div
      className={cn(
        'px-3.5 py-4',
        tone === 'utility' && 'rounded-[16px] bg-card/14 ring-1 ring-border/35',
      )}
    >
      <p
        className={cn(
          'text-[12px] leading-relaxed text-muted-foreground',
          tone === 'utility' && 'text-[11px] leading-6',
        )}
      >
        {text}
      </p>
    </div>
  );
}

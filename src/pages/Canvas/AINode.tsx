import { memo } from 'react';

interface NodeProps {
  data: unknown;
}

export interface AINodeData {
  label: string;
  type: 'generate' | 'consistency' | 'tts' | 'edit';
  status: 'idle' | 'running' | 'done' | 'error';
  model?: string;
  onRun?: () => void;
}

const STATUS_DOT: Record<string, string> = {
  idle: 'bg-muted-foreground/30',
  running: 'bg-amber-500 animate-pulse',
  done: 'bg-green-500',
  error: 'bg-red-500',
};

const STATUS_TEXT: Record<string, string> = {
  idle: 'AI 节点',
  running: '生成中',
  done: '已完成',
  error: '失败',
};

export const AINode = memo(({ data }: NodeProps) => {
  const { label, status, model, onRun } = data as unknown as AINodeData;
  const clickable = !!onRun && (status === 'idle' || status === 'done' || status === 'error');

  return (
    <div
      className={`bg-gradient-to-br from-primary/10 to-primary/[0.03] border border-primary/20 rounded-xl shadow-sm w-[156px] overflow-hidden transition-all ${clickable ? 'cursor-pointer hover:shadow-md hover:border-primary/40' : ''}`}
      onClick={() => clickable && onRun?.()}
    >
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center text-sm shrink-0">✨</div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold leading-tight truncate">{label}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] ?? STATUS_DOT.idle}`} />
            <span className="text-[10px] text-muted-foreground truncate">{model ?? STATUS_TEXT[status] ?? 'AI'}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

AINode.displayName = 'AINode';

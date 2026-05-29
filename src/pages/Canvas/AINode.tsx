import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface AINodeData {
  label: string;
  type: 'generate' | 'consistency' | 'tts' | 'edit';
  status: 'idle' | 'running' | 'done' | 'error';
  model?: string;
  onRun?: () => void;
}

const STATUS_COLORS = {
  idle: 'bg-muted text-muted-foreground',
  running: 'bg-amber-500/20 text-amber-700 animate-pulse',
  done: 'bg-green-500/20 text-green-700',
  error: 'bg-red-500/20 text-red-700',
};

const STATUS_LABELS = {
  idle: '点击执行',
  running: '生成中...',
  done: '已完成',
  error: '失败 · 点击重试',
};

export const AINode = memo(({ data }: NodeProps) => {
  const { label, status, model, onRun } = data as unknown as AINodeData;
  const clickable = status === 'idle' || status === 'done' || status === 'error';

  return (
    <div
      className={`bg-card border-2 border-dashed border-amber-400/60 rounded-xl shadow-lg w-[180px] overflow-hidden transition-transform ${clickable ? 'cursor-pointer hover:scale-105 hover:border-amber-400' : ''}`}
      onClick={() => clickable && onRun?.()}
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-500 !w-2.5 !h-2.5" />
      <div className="px-3 py-2.5 text-center">
        <div className="text-lg mb-1">{status === 'running' ? '⏳' : '🤖'}</div>
        <div className="text-xs font-semibold">{label}</div>
        {model && <div className="text-[9px] text-muted-foreground mt-0.5">{model}</div>}
        <div className={`text-[10px] mt-2 px-2 py-0.5 rounded-full inline-block ${STATUS_COLORS[status]}`}>
          {STATUS_LABELS[status]}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-amber-500 !w-2.5 !h-2.5" />
    </div>
  );
});

AINode.displayName = 'AINode';

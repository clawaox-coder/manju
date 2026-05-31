import { memo } from 'react';

interface NodeProps {
  data: unknown;
}

export interface VideoNodeData {
  title: string;
  duration: string;
  status: 'waiting' | 'rendering' | 'done';
}

const STATUS_MAP = {
  waiting: { color: 'bg-muted text-muted-foreground', label: '等待素材' },
  rendering: { color: 'bg-amber-500/20 text-amber-700 animate-pulse', label: '渲染中...' },
  done: { color: 'bg-green-500/20 text-green-700', label: '已完成' },
};

export const VideoNode = memo(({ data }: NodeProps) => {
  const { title, duration, status } = data as unknown as VideoNodeData;
  const st = STATUS_MAP[status];
  return (
    <div className="bg-card border-2 border-green-400/40 rounded-xl shadow-lg w-[200px] overflow-hidden">
      <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 px-3 py-2 border-b border-border">
        <div className="text-xs font-medium">🎬 {title}</div>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>时长</span><span>{duration}</span>
        </div>
        <div className={`text-[10px] text-center px-2 py-0.5 rounded-full ${st.color}`}>
          {st.label}
        </div>
      </div>
    </div>
  );
});

VideoNode.displayName = 'VideoNode';

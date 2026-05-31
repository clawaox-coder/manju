import { memo } from 'react';
import { motion } from 'framer-motion';
import { nodeMotionProps } from './canvas/nodeMotion';

interface NodeProps {
  id: string;
  data: unknown;
  selected?: boolean;
}

export interface StoryboardNodeData {
  shotNumber: number;
  title: string;
  dialog: string;
  style: string;
  imageUrl?: string;
  nodeStatus?: 'candidate' | 'selected' | 'active' | 'settled' | 'leaving';
}

const STATUS_STYLES: Record<string, string> = {
  candidate: 'border-dashed',
  leaving: 'border-dashed',
  selected: 'border-primary ring-2 ring-primary/20',
  active: 'border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/10',
  settled: '',
};

export const StoryboardNode = memo(({ id, data, selected }: NodeProps) => {
  const { shotNumber, title, dialog, style, imageUrl, nodeStatus } = data as unknown as StoryboardNodeData;
  const statusClass = STATUS_STYLES[nodeStatus ?? ''] ?? '';
  const baseSelected = selected && !nodeStatus ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-border';
  const pending = nodeStatus === 'candidate' || nodeStatus === 'leaving';

  return (
    <motion.div
      {...nodeMotionProps(nodeStatus, id)}
      className={`bg-card border rounded-xl shadow-md w-[180px] overflow-hidden transition-colors duration-300 ${baseSelected} ${statusClass} group`}
    >
      <div className="aspect-[4/3] bg-gradient-to-br from-slate-800 to-slate-900 relative">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        ) : pending ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/30 text-[10px]">
            等待生成
          </div>
        )}
        <span className="absolute top-1 left-1 text-[9px] bg-black/60 text-white/80 px-1 py-0.5 rounded">
          {shotNumber}
        </span>
        <span className="absolute top-1 right-1 text-[9px] bg-blue-500/70 text-white px-1 py-0.5 rounded">
          {style}
        </span>
        {!pending && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            <button className="text-white text-[10px] bg-white/20 rounded px-2 py-1 hover:bg-white/30">重新生成</button>
          </div>
        )}
      </div>
      <div className="px-2 py-1.5">
        <div className="text-[11px] font-medium truncate">{title}</div>
        <div className="text-[10px] text-muted-foreground truncate">{dialog || '无对白'}</div>
      </div>
    </motion.div>
  );
});

StoryboardNode.displayName = 'StoryboardNode';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { nodeMotionProps } from './canvas/nodeMotion';

export interface ScriptNodeData {
  title: string;
  content: string;
  sceneNumber: number;
  nodeStatus?: 'candidate' | 'selected' | 'active' | 'settled';
}

const STATUS_STYLES: Record<string, string> = {
  candidate: 'border-dashed',
  leaving: 'border-dashed',
  selected: 'border-primary ring-2 ring-primary/20',
  active: 'border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/10',
  settled: '',
};

export const ScriptNode = memo(({ id, data, selected }: NodeProps) => {
  const { title, content, sceneNumber, nodeStatus } = data as unknown as ScriptNodeData;
  const statusClass = STATUS_STYLES[nodeStatus ?? ''] ?? '';
  const baseSelected = selected && !nodeStatus ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-border';
  const pending = nodeStatus === 'candidate' || nodeStatus === 'leaving';

  return (
    <motion.div
      {...nodeMotionProps(nodeStatus, id)}
      className={`bg-card border rounded-xl shadow-md w-[260px] overflow-hidden transition-colors duration-300 ${baseSelected} ${statusClass} group`}
    >
      <div className="bg-gradient-to-r from-purple-500/8 to-pink-500/8 px-3 py-2 border-b border-border flex items-center gap-2">
        <span className="text-[10px] font-mono bg-purple-500/15 text-purple-600 px-1.5 py-0.5 rounded">
          {sceneNumber}
        </span>
        <span className="text-xs font-medium truncate">{title}</span>
      </div>
      {pending ? (
        <div className="px-3 py-2.5 space-y-1.5">
          <div className="h-2.5 bg-muted-foreground/10 rounded w-full animate-pulse" />
          <div className="h-2.5 bg-muted-foreground/10 rounded w-4/5 animate-pulse" />
          <div className="h-2.5 bg-muted-foreground/10 rounded w-3/5 animate-pulse" />
        </div>
      ) : (
        <div className="px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap">
          {content || '等待生成...'}
        </div>
      )}
      {!pending && (
        <div className="opacity-0 group-hover:opacity-100 transition border-t border-border flex divide-x divide-border text-[10px] text-muted-foreground">
          <button className="flex-1 py-1.5 hover:bg-muted hover:text-foreground transition">AI 重写</button>
          <button className="flex-1 py-1.5 hover:bg-muted hover:text-foreground transition">变体</button>
          <button className="flex-1 py-1.5 hover:bg-muted hover:text-foreground transition">续写</button>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-purple-500 !w-2 !h-2" />
    </motion.div>
  );
});

ScriptNode.displayName = 'ScriptNode';

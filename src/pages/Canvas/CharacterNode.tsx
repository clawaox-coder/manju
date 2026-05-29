import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface CharacterNodeData {
  name: string;
  description: string;
  avatar?: string;
  tags: string[];
}

export const CharacterNode = memo(({ data }: NodeProps) => {
  const { name, description, avatar, tags } = data as unknown as CharacterNodeData;
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg w-[160px] overflow-hidden">
      <div className="p-3 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-lg font-bold mb-2">
          {avatar ? <img src={avatar} className="w-full h-full rounded-full object-cover" /> : name[0]}
        </div>
        <div className="text-xs font-semibold">{name}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{description}</div>
        <div className="flex flex-wrap justify-center gap-1 mt-1.5">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[9px] bg-muted px-1.5 py-0.5 rounded">{t}</span>
          ))}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-pink-500 !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Left} className="!bg-pink-500 !w-2.5 !h-2.5" />
    </div>
  );
});

CharacterNode.displayName = 'CharacterNode';

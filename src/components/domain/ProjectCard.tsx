import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, FileEdit, MoreVertical } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

interface Props {
  project: Project;
  onClick?: () => void;
  onAction?: (action: 'open' | 'rename' | 'duplicate' | 'delete' | 'export') => void;
  compact?: boolean;
}

export function ProjectCard({ project: p, onClick, onAction, compact }: Props) {
  const bg = p.bgStyle || 'bg-muted';
  const timeLabel = formatRelative(p.updatedAt);

  const statusBadge = {
    rendering: (
      <Badge variant="warning" className="absolute top-2 left-2 backdrop-blur bg-black/40 text-white">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        渲染中 {p.progress}%
      </Badge>
    ),
    done: (
      <Badge variant="success" className="absolute top-2 left-2 bg-green-500 text-white">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        已完成
      </Badge>
    ),
    draft: (
      <Badge className="absolute top-2 left-2 bg-yellow-500 text-white">
        <FileEdit className="w-3 h-3 mr-1" />
        草稿
      </Badge>
    ),
    archived: (
      <Badge className="absolute top-2 left-2 bg-gray-500 text-white">
        已归档
      </Badge>
    ),
  }[p.status];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="cursor-pointer group"
          onClick={onClick}
        >
          <div className={cn('rounded-xl overflow-hidden mb-2 relative', bg, compact ? 'aspect-video' : 'aspect-video')}>
            {statusBadge}
            {p.status === 'rendering' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                <div className="h-full gradient-brand" style={{ width: `${p.progress}%` }} />
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1.5 right-1.5 size-7 bg-black/40 backdrop-blur text-white hover:bg-black/60 opacity-0 group-hover:opacity-100 transition"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onAction?.('open')}>打开</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction?.('rename')}>重命名</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction?.('duplicate')}>复制</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction?.('export')}>导出视频</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => onAction?.('delete')}>
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-sm font-semibold truncate">{p.name}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <span>{timeLabel}</span>
            <span>·</span>
            <span>{p.version}</span>
            {!compact && p.genre && (
              <>
                <span>·</span>
                <span>{p.genre}</span>
              </>
            )}
          </div>
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onAction?.('open')}>打开</ContextMenuItem>
        <ContextMenuItem onClick={() => onAction?.('rename')}>重命名</ContextMenuItem>
        <ContextMenuItem onClick={() => onAction?.('duplicate')}>复制</ContextMenuItem>
        <ContextMenuItem onClick={() => onAction?.('export')}>导出视频</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => onAction?.('delete')}>
          删除
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

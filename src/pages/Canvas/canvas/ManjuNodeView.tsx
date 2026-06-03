// 画布节点的纯展示层：按 nodeType 渲染语义内容。不依赖 tldraw（便于单测，
// 也避免把 tldraw 的环境检测拖进 jsdom）。ManjuNodeUtil 在 component() 里包一层
// HTMLContainer 调用这里。

import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Clock3,
  FileText,
  Film,
  EllipsisVertical,
  ImageIcon,
  LoaderCircle,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

export type ManjuNodeType = 'script' | 'storyboard' | 'character' | 'ai' | 'video';

export interface ManjuNodeProps {
  w: number;
  h: number;
  nodeType: ManjuNodeType;
  title: string;
  body: string;       // 剧本内容 / 角色描述 / 对白等
  badge: string;      // 编号 / 风格标签 / 时长
  imageUrl: string;   // 分镜缩略图 / 角色头像（空串表示无）
  status: string;     // ai/video 节点状态
}

// 各 type 的固定尺寸（与 buildGraph 的列布局协调）。
export const MANJU_NODE_SIZE: Record<ManjuNodeType, { w: number; h: number }> = {
  script: { w: 260, h: 132 },
  storyboard: { w: 200, h: 184 },
  character: { w: 160, h: 150 },
  ai: { w: 168, h: 64 },
  video: { w: 200, h: 96 },
};

const STATUS_DOT: Record<string, string> = {
  idle: 'bg-muted-foreground/30',
  running: 'bg-amber-500 animate-pulse',
  rendering: 'bg-amber-500 animate-pulse',
  waiting: 'bg-muted-foreground/30',
  done: 'bg-green-500',
  error: 'bg-red-500',
};

const STATUS_LABEL: Record<string, string> = {
  idle: '待命',
  running: '生成中',
  rendering: '渲染中',
  waiting: '等待',
  done: '完成',
  error: '异常',
};

interface NodeTheme {
  label: string;
  icon: LucideIcon;
  accent: string;
  soft: string;
  border: string;
}

const NODE_THEME: Record<ManjuNodeType, NodeTheme> = {
  script: {
    label: '剧本',
    icon: FileText,
    accent: 'text-sky-600 dark:text-sky-300',
    soft: 'bg-sky-500/10',
    border: 'border-sky-500/25',
  },
  storyboard: {
    label: '分镜',
    icon: Clapperboard,
    accent: 'text-teal-600 dark:text-teal-300',
    soft: 'bg-teal-500/10',
    border: 'border-teal-500/25',
  },
  character: {
    label: '角色',
    icon: UserRound,
    accent: 'text-amber-600 dark:text-amber-300',
    soft: 'bg-amber-500/10',
    border: 'border-amber-500/25',
  },
  ai: {
    label: 'AI',
    icon: Sparkles,
    accent: 'text-violet-600 dark:text-violet-300',
    soft: 'bg-violet-500/10',
    border: 'border-violet-500/25',
  },
  video: {
    label: '输出',
    icon: Film,
    accent: 'text-emerald-600 dark:text-emerald-300',
    soft: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
  },
};

function NodeFrame({ nodeType, children }: { nodeType: ManjuNodeType; children: ReactNode }) {
  const theme = NODE_THEME[nodeType];
  return (
    <div className={`relative w-full h-full overflow-hidden rounded-lg border bg-card shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_28px_rgba(0,0,0,0.32)] ${theme.border}`}>
      {children}
    </div>
  );
}

function TypeBadge({ nodeType, badge }: { nodeType: ManjuNodeType; badge?: string }) {
  const theme = NODE_THEME[nodeType];
  const Icon = theme.icon;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${theme.soft} ${theme.accent}`}>
        <Icon className="w-2.5 h-2.5" />
        {theme.label}
      </span>
      {badge && (
        <span className="min-w-0 truncate rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
          {badge}
        </span>
      )}
    </div>
  );
}

function NodeAction() {
  return (
    <span
      aria-label="节点操作"
      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/70"
    >
      <EllipsisVertical className="w-3.5 h-3.5" />
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const Icon = status === 'done' ? CheckCircle2 : status === 'error' ? AlertTriangle : status === 'running' || status === 'rendering' ? LoaderCircle : Clock3;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] ?? STATUS_DOT.idle}`} />
      <Icon className={`w-2.5 h-2.5 ${status === 'running' || status === 'rendering' ? 'animate-spin' : ''}`} />
      {STATUS_LABEL[status] ?? STATUS_LABEL.idle}
    </span>
  );
}

// 按 nodeType 渲染节点主体（纯展示，不依赖 tldraw context，便于单测）。
export function renderByType(p: ManjuNodeProps) {
  switch (p.nodeType) {
    case 'storyboard':
      return (
        <NodeFrame nodeType="storyboard">
          <div className="relative h-[112px] bg-gradient-to-br from-slate-700 via-slate-900 to-teal-950">
            {p.imageUrl
              ? <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
              : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/45">
                  <ImageIcon className="w-5 h-5" />
                  <span className="text-[10px]">等待生成</span>
                </div>
              )}
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2">
              <TypeBadge nodeType="storyboard" badge={p.badge} />
              <NodeAction />
            </div>
          </div>
          <div className="px-2.5 py-2">
            <div className="text-[11px] font-semibold leading-tight truncate">{p.title}</div>
            <div className="mt-1 text-[10px] text-muted-foreground truncate">{p.body || '无对白'}</div>
          </div>
        </NodeFrame>
      );
    case 'character':
      return (
        <NodeFrame nodeType="character">
          <div className="flex h-full flex-col items-center text-center px-3 py-3.5">
            <div className="flex w-full items-center justify-between gap-1">
              <TypeBadge nodeType="character" />
              <NodeAction />
            </div>
            <div className="mt-2 w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/80 to-orange-500/80 ring-2 ring-amber-500/15 flex items-center justify-center text-white text-base font-bold overflow-hidden shrink-0">
            {p.imageUrl ? <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" /> : (p.title[0] ?? '角')}
            </div>
            <div className="mt-2 text-xs font-semibold truncate w-full">{p.title}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{p.body || '角色设定待补充'}</div>
          </div>
        </NodeFrame>
      );
    case 'ai':
      return (
        <NodeFrame nodeType="ai">
          <div className="flex h-full items-center gap-2.5 px-3 pt-1">
            <div className="w-8 h-8 rounded-lg bg-violet-500/12 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <TypeBadge nodeType="ai" />
                <NodeAction />
              </div>
              <div className="mt-1"><StatusBadge status={p.status || 'idle'} /></div>
              <div className="mt-1 text-[12px] font-semibold leading-tight truncate">{p.title}</div>
              <div className="text-[10px] text-muted-foreground truncate">{p.badge || 'AI'}</div>
            </div>
          </div>
        </NodeFrame>
      );
    case 'video':
      return (
        <NodeFrame nodeType="video">
          <div className="flex h-full flex-col px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <TypeBadge nodeType="video" badge={p.badge} />
              <NodeAction />
            </div>
            <div className="mt-1"><StatusBadge status={p.status || 'waiting'} /></div>
            <div className="mt-2 text-xs font-semibold truncate">{p.title}</div>
            <div className="mt-auto flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span className="truncate">{p.body || '等待素材'}</span>
              <Film className="w-3.5 h-3.5 text-emerald-500/70 shrink-0" />
            </div>
          </div>
        </NodeFrame>
      );
    case 'script':
    default:
      return (
        <NodeFrame nodeType="script">
          <div className="flex h-full flex-col px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <TypeBadge nodeType="script" badge={p.badge} />
              <NodeAction />
            </div>
            <div className="mt-2 text-xs font-semibold leading-tight truncate">{p.title}</div>
            <div className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap">
              {p.body || '等待生成...'}
            </div>
          </div>
        </NodeFrame>
      );
  }
}

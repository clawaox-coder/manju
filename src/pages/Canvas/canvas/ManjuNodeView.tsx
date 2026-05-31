// 画布节点的纯展示层：按 nodeType 渲染语义内容。不依赖 tldraw（便于单测，
// 也避免把 tldraw 的环境检测拖进 jsdom）。ManjuNodeUtil 在 component() 里包一层
// HTMLContainer 调用这里。

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

// 按 nodeType 渲染节点主体（纯展示，不依赖 tldraw context，便于单测）。
export function renderByType(p: ManjuNodeProps) {
  switch (p.nodeType) {
    case 'storyboard':
      return (
        <div className="w-full h-full bg-card border border-border rounded-xl shadow-md overflow-hidden flex flex-col">
          <div className="relative flex-1 bg-gradient-to-br from-slate-700 to-slate-900">
            {p.imageUrl
              ? <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
              : <div className="absolute inset-0 flex items-center justify-center text-white/30 text-[10px]">等待生成</div>}
            {p.badge && <span className="absolute top-1 right-1 text-[9px] bg-primary/70 text-white px-1 py-0.5 rounded">{p.badge}</span>}
          </div>
          <div className="px-2 py-1.5 shrink-0">
            <div className="text-[11px] font-medium truncate">{p.title}</div>
            <div className="text-[10px] text-muted-foreground truncate">{p.body || '无对白'}</div>
          </div>
        </div>
      );
    case 'character':
      return (
        <div className="w-full h-full bg-card border border-border rounded-xl shadow-lg flex flex-col items-center text-center p-3">
          <div className="w-12 h-12 rounded-full bg-foreground flex items-center justify-center text-background text-base font-bold mb-1.5 overflow-hidden shrink-0">
            {p.imageUrl ? <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" /> : (p.title[0] ?? '角')}
          </div>
          <div className="text-xs font-semibold truncate w-full">{p.title}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{p.body}</div>
        </div>
      );
    case 'ai':
      return (
        <div className="w-full h-full bg-gradient-to-br from-primary/10 to-primary/[0.03] border border-primary/20 rounded-xl shadow-sm flex items-center gap-2.5 px-3">
          <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center text-sm shrink-0">✨</div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold leading-tight truncate">{p.title}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[p.status] ?? STATUS_DOT.idle}`} />
              <span className="text-[10px] text-muted-foreground truncate">{p.badge || 'AI'}</span>
            </div>
          </div>
        </div>
      );
    case 'video':
      return (
        <div className="w-full h-full bg-card border-2 border-green-400/40 rounded-xl shadow-lg overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 px-3 py-2 border-b border-border shrink-0">
            <div className="text-xs font-medium truncate">🎬 {p.title}</div>
          </div>
          <div className="px-3 py-2 space-y-1.5 flex-1">
            <div className="flex justify-between text-[10px] text-muted-foreground"><span>时长</span><span>{p.badge}</span></div>
            <div className="flex items-center justify-center gap-1.5 text-[10px]">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[p.status] ?? STATUS_DOT.waiting}`} />
              <span className="text-muted-foreground">{p.body}</span>
            </div>
          </div>
        </div>
      );
    case 'script':
    default:
      return (
        <div className="w-full h-full bg-card border border-border rounded-xl shadow-md overflow-hidden flex flex-col">
          <div className="bg-muted px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
            {p.badge && <span className="text-[10px] font-mono bg-primary/15 text-primary px-1.5 py-0.5 rounded">{p.badge}</span>}
            <span className="text-xs font-medium truncate">{p.title}</span>
          </div>
          <div className="px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap flex-1">
            {p.body || '等待生成...'}
          </div>
        </div>
      );
  }
}

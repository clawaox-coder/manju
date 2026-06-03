// 落地页 Hero 右侧的「产品画布预览」：用静态 HTML + SVG 还原真实工作流画布的视觉
// （剧本 → AI → 分镜 → 视频 的节点图 + 彩色弧形连线 + 底部工具栏），不依赖 tldraw。
// 纯展示组件，无交互/逻辑；节点语义与配色对齐 ManjuNodeView。
import { Clapperboard, FileText, Film, Sparkles, UserRound, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// 单个节点卡：深色玻璃 + 按类型着色的边框/标签。accent 传 hex，便于拼接 alpha。
function NodeCard({
  className,
  accent,
  icon: Icon,
  label,
  badge,
  children,
}: {
  className: string;
  accent: string;
  icon: LucideIcon;
  label: string;
  badge?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`absolute rounded-lg border bg-[#0e1730]/90 p-2 shadow-[0_8px_20px_rgba(0,0,0,0.45)] backdrop-blur-sm ${className}`}
      style={{ borderColor: `${accent}55` }}
    >
      <div className="flex items-center gap-1">
        <span
          className="inline-flex items-center gap-0.5 rounded px-1 py-[1px] text-[8px] font-semibold"
          style={{ color: accent, backgroundColor: `${accent}1f` }}
        >
          <Icon className="h-2 w-2" />
          {label}
        </span>
        {badge && <span className="text-[7px] font-medium text-white/40">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

export function HeroWorkflowPreview() {
  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b1326] shadow-[0_30px_70px_rgba(2,6,23,0.6)]">
      {/* 画布点阵网格 */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[length:22px_22px] opacity-40" />

      {/* 连线层：剧本→AI(紫)、角色→AI(粉虚线)、AI→分镜(橙)、分镜→视频(绿) */}
      <svg viewBox="0 0 560 448" className="absolute inset-0 h-full w-full" fill="none" preserveAspectRatio="none">
        <path d="M162,99 C205,120 180,200 207,212" stroke="#a855f7" strokeWidth="2" opacity="0.7" />
        <path d="M162,287 C205,270 180,236 207,232" stroke="#a855f7" strokeWidth="2" opacity="0.7" />
        <path d="M263,96 C263,150 245,180 252,205" stroke="#ec4899" strokeWidth="2" strokeDasharray="5 4" opacity="0.5" />
        <path d="M353,214 C392,160 380,112 398,102" stroke="#f59e0b" strokeWidth="2" opacity="0.75" />
        <path d="M353,230 C392,235 382,214 398,214" stroke="#f59e0b" strokeWidth="2" opacity="0.75" />
        <path d="M432,250 C474,295 470,300 462,318" stroke="#22c55e" strokeWidth="2" opacity="0.6" />
      </svg>

      {/* 剧本卡 ×2（左列，sky） */}
      <NodeCard className="left-[3%] top-[8%] w-[27%]" accent="#38bdf8" icon={FileText} label="剧本" badge="Script 01">
        <div className="mt-1 line-clamp-2 text-[8px] leading-tight text-white/55">雨夜天台，霓虹刺破乌云，林夏握紧那封信…</div>
      </NodeCard>
      <NodeCard className="left-[3%] top-[54%] w-[27%]" accent="#38bdf8" icon={FileText} label="剧本" badge="Script 02">
        <div className="mt-1 line-clamp-2 text-[8px] leading-tight text-white/55">地下车库，引擎轰鸣，追逐战一触即发。</div>
      </NodeCard>

      {/* 角色卡（上中，amber） */}
      <NodeCard className="left-[37%] top-[2%] w-[22%]" accent="#fbbf24" icon={UserRound} label="角色">
        <div className="mt-1 flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-orange-500 text-[9px] font-bold text-white">夏</span>
          <span className="truncate text-[9px] font-medium text-white/80">林夏</span>
        </div>
      </NodeCard>

      {/* AI 节点（中心，violet，生成中） */}
      <div className="absolute left-[37%] top-[44%] w-[26%] rounded-lg border border-violet-400/50 bg-[#160f2e]/90 p-2 shadow-[0_0_24px_rgba(139,92,246,0.4)] backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-500/20 text-violet-300">
            <Sparkles className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[9px] font-semibold text-white/90">AI 分镜生成</div>
            <div className="flex items-center gap-1 text-[8px] text-amber-300">
              <span className="h-1 w-1 animate-pulse rounded-full bg-amber-400" />
              生成中
            </div>
          </div>
        </div>
      </div>

      {/* 分镜卡 ×2（右列，teal，带缩略图） */}
      <NodeCard className="left-[70%] top-[7%] w-[28%]" accent="#2dd4bf" icon={Clapperboard} label="分镜" badge="Shot 01">
        <div className="mt-1 h-9 w-full rounded bg-gradient-to-br from-indigo-500/70 via-purple-600/60 to-slate-900" />
      </NodeCard>
      <NodeCard className="left-[70%] top-[40%] w-[28%]" accent="#2dd4bf" icon={Clapperboard} label="分镜" badge="Shot 02">
        <div className="mt-1 h-9 w-full rounded bg-gradient-to-br from-rose-500/70 via-fuchsia-600/60 to-slate-900" />
      </NodeCard>

      {/* 视频输出（右下，emerald） */}
      <NodeCard className="left-[70%] top-[74%] w-[28%]" accent="#34d399" icon={Film} label="输出">
        <div className="mt-1 flex items-center justify-between text-[8px] text-white/60">
          <span>成片导出</span>
          <span className="font-mono text-emerald-300">00:30</span>
        </div>
      </NodeCard>

      {/* 底部工具栏（tldraw 风格示意） */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#0e1730]/90 px-3 py-1.5 backdrop-blur-md">
        {['select', 'hand', 'frame', 'note', 'arrow'].map((tool, i) => (
          <span
            key={tool}
            className={`h-3 w-3 rounded-sm ${i === 0 ? 'bg-[#3b82f6]' : 'bg-white/20'}`}
          />
        ))}
      </div>
    </div>
  );
}

import { cn } from '@/lib/utils';

// 亮点功能卡（参考 OiiOii）：精致缩略图 + 底部渐变遮罩 + 标题压底 + 可选角标，整卡可点击。
export interface Highlight {
  id: string;
  title: string;
  cover: string; // CSS background 值（占位封面用渐变）
  tag?: string; // 角标，如「多模型」
}

export function HighlightCard({
  highlight,
  onClick,
  className,
}: {
  highlight: Highlight;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative block w-full overflow-hidden rounded-2xl border border-white/10 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:shadow-[0_16px_40px_rgba(0,0,0,0.5)]',
        className,
      )}
      style={{ background: highlight.cover }}
    >
      {/* 用比例撑出卡片高度（背景即缩略图） */}
      <div className="aspect-[16/10] w-full" />
      {/* 底部渐变遮罩，保证标题可读 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent transition-all group-hover:from-black/90" />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-4">
        <span className="text-base font-semibold text-white">{highlight.title}</span>
        {highlight.tag && (
          <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur">
            {highlight.tag}
          </span>
        )}
      </div>
    </button>
  );
}

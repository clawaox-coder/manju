import { Heart } from 'lucide-react';

// 社区作品卡：仅供浏览（无自有作品的操作菜单），展示封面/标题/作者/点赞。
export interface CommunityWork {
  id: string;
  title: string;
  cover: string; // CSS background 值（占位封面用渐变）
  authorName: string;
  authorAvatar: string; // 头像首字
  likes: number;
}

// 点赞数格式化：≥1 万显示 x.xw（去掉多余的 .0），否则原样。
export function formatLikes(count: number): string {
  if (count >= 10000) {
    const wan = (count / 10000).toFixed(1).replace(/\.0$/, '');
    return `${wan}w`;
  }
  return String(count);
}

export function CommunityCard({ work }: { work: CommunityWork }) {
  return (
    <div className="group cursor-pointer">
      <div
        className="relative mb-2 aspect-video overflow-hidden rounded-xl border border-white/10 shadow-[0_8px_24px_rgba(2,6,23,0.5)] ring-1 ring-inset ring-white/5 transition-all duration-300 group-hover:-translate-y-1 group-hover:ring-[#3b82f6]/50 group-hover:shadow-[0_12px_30px_rgba(37,99,235,0.28)]"
        style={{ background: work.cover }}
      >
        {/* 悬停时压暗底部，衬托文字层 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="truncate text-sm font-semibold text-foreground">{work.title}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-[10px] font-bold text-white">
            {work.authorAvatar}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{work.authorName}</span>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Heart className="h-3 w-3" />
          {formatLikes(work.likes)}
        </span>
      </div>
    </div>
  );
}

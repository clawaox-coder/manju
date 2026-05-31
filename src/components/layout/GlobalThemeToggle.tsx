import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import type { Theme } from '@/types';

const OPTIONS: { key: Theme; label: string; icon: LucideIcon }[] = [
  { key: 'light', label: '浅色', icon: Sun },
  { key: 'dark', label: '深色', icon: Moon },
  { key: 'auto', label: '跟随系统', icon: Monitor },
];

/**
 * 全局浮动主题切换。渲染在 App 顶层，出现在所有路由上，
 * 不依赖任何页面外壳（项目原本的 Header/Sidebar 已移除）。
 */
export function GlobalThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="fixed bottom-4 right-4 z-[400] flex items-center gap-0.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-xl p-1 shadow-lg">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setTheme(opt.key)}
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={active}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

import { NavLink, useLocation } from 'react-router-dom';
import { NAV_GROUPS } from './nav-config';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const billing = useStore((s) => s.billing);
  const storagePct = Math.round((billing.usage.storage.used / billing.usage.storage.total) * 100);
  const location = useLocation();

  return (
    <aside className="w-56 bg-card border-r border-border flex flex-col flex-shrink-0 h-full">
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5 text-[13px]">
        {NAV_GROUPS.map((g, gi) => (
          <div key={gi}>
            {g.label && (
              <div className="pt-4 pb-1.5 px-3 text-[11px] text-muted-foreground font-medium">{g.label}</div>
            )}
            {g.items.map((it) => {
              const Icon = it.icon;
              const isActive = it.to === '/' ? location.pathname === '/' : location.pathname.startsWith(it.to);
              return (
                <NavLink
                  key={it.key}
                  to={it.to}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg transition-colors',
                    isActive
                      ? 'gradient-purple-soft text-brand-700 font-semibold'
                      : 'text-foreground/70 hover:bg-accent'
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    {it.label}
                  </span>
                  {it.dot && <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="m-3 p-3 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-100 dark:border-purple-900/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>云端空间</span>
        </div>
        <div className="text-sm font-semibold mb-2">
          {billing.usage.storage.used} GB <span className="text-xs text-muted-foreground font-normal">/ {billing.usage.storage.total}</span>
        </div>
        <Progress value={storagePct} className="mb-3" />
        <Button
          variant="outline"
          size="sm"
          className="w-full bg-card text-brand-600 border-purple-200"
          onClick={() => toast.info('正在跳转到套餐页面...')}
        >
          升级套餐
        </Button>
      </div>
    </aside>
  );
}

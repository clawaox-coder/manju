import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Settings, Users, CreditCard, Key, HelpCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';

interface AccountTab {
  to: string;
  label: string;
  icon: LucideIcon;
}

const ACCOUNT_TABS: AccountTab[] = [
  { to: '/account/settings', label: '个人设置', icon: Settings },
  { to: '/account/team', label: '团队管理', icon: Users },
  { to: '/account/billing', label: '订阅与账单', icon: CreditCard },
  { to: '/account/apikeys', label: 'API 密钥', icon: Key },
  { to: '/account/help', label: '帮助与快捷键', icon: HelpCircle },
];

export function AccountShell() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-background">
        <header className="border-b border-border h-14 flex items-center px-4 lg:px-6 gap-4 flex-shrink-0">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <span className="text-sm font-semibold">账户中心</span>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <nav className="w-56 border-r border-border p-3 flex-shrink-0 hidden md:block">
            {ACCOUNT_TABS.map((t) => {
              const Icon = t.icon;
              const active = location.pathname === t.to;
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

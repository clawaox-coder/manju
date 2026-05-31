import { useNavigate } from 'react-router-dom';
import { Settings, Users, CreditCard, Key, HelpCircle, LogOut, Wallet, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStore } from '@/store';
import { useConfirm } from '@/hooks/useConfirm';
import { clearTokens } from '@/lib/api/tokens';
import { toast } from 'sonner';

interface MenuLink {
  to: string;
  label: string;
  icon: LucideIcon;
}

const LINKS: MenuLink[] = [
  { to: '/account/settings', label: '个人设置', icon: Settings },
  { to: '/account/team', label: '团队管理', icon: Users },
  { to: '/account/billing', label: '订阅与账单', icon: CreditCard },
  { to: '/account/apikeys', label: 'API 密钥', icon: Key },
  { to: '/account/help', label: '帮助与常见问题', icon: HelpCircle },
];

export function AccountMenu() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const profile = useStore((s) => s.profile);
  const billing = useStore((s) => s.billing);

  const handleLogout = () => {
    confirm({
      title: '退出登录',
      message: '确定要退出登录?',
      okText: '退出',
      danger: false,
      onConfirm: () => {
        clearTokens();
        toast.info('已退出登录');
        navigate('/auth');
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 outline-none cursor-pointer rounded-full">
        <Avatar className="w-8 h-8">
          <AvatarFallback className="bg-muted text-foreground text-xs font-bold">
            {profile.avatar}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60 rounded-xl">
        <DropdownMenuLabel>
          <div className="font-medium">{profile.name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 font-normal">{profile.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <button
            type="button"
            onClick={() => navigate('/account/billing')}
            className="w-full flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-left hover:bg-accent transition-colors"
          >
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="w-3.5 h-3.5" />
              当前套餐
            </span>
            <span className="text-xs font-medium capitalize">{billing.plan}</span>
          </button>
        </div>
        <DropdownMenuSeparator />
        {LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.to} onClick={() => navigate(item.to)} className="cursor-pointer">
              <Icon className="w-4 h-4" />
              {item.label}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleLogout} className="cursor-pointer">
          <LogOut className="w-4 h-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

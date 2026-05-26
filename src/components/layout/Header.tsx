import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, Plus, Search, Video, ChevronDown, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import { TOP_NAV, ACCOUNT_NAV } from './nav-config';
import { useConfirm } from '@/hooks/useConfirm';
import { ThemeToggle } from './ThemeToggle';
import { toast } from 'sonner';

const NOTIF_COLORS = { green: 'bg-green-100 text-green-600', purple: 'bg-purple-100 text-brand-600', yellow: 'bg-yellow-100 text-yellow-600' };

interface Props {
  onNewProject: () => void;
  onToggleSidebar?: () => void;
}

export function Header({ onNewProject, onToggleSidebar }: Props) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const profile = useStore((s) => s.profile);
  const notifications = useStore((s) => s.notifications);
  const markRead = useStore((s) => s.markNotificationRead);
  const markAllRead = useStore((s) => s.markAllNotificationsRead);
  const unread = notifications.filter((n) => !n.read).length;

  function handleSearch(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && search.trim()) {
      const q = search.trim();
      if (q.includes('项目')) navigate('/projects');
      else if (q.includes('角色')) navigate('/characters');
      else if (q.includes('模板')) navigate('/storyboard');
      else toast.info(`没有找到与"${q}"相关的结果`);
      setSearch('');
    }
  }

  function handleLogout() {
    confirm({
      title: '退出登录',
      message: '确定要退出登录?',
      okText: '退出',
      danger: false,
      onConfirm: () => {
        toast.info('已退出登录');
        setTimeout(() => navigate('/'), 600);
      }
    });
  }

  return (
    <header className="bg-card border-b border-border h-16 flex items-center px-6 justify-between flex-shrink-0">
      <div className="flex items-center gap-4 lg:gap-10">
        {onToggleSidebar && (
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onToggleSidebar}>
            <Menu className="w-5 h-5" />
          </Button>
        )}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl gradient-purple flex items-center justify-center shadow-md shadow-purple">
            <Video className="w-5 h-5 text-white" />
          </div>
          <span className="text-base font-bold tracking-wide hidden sm:inline">
            漫剧<span className="text-brand-600">AI</span> Studio
          </span>
        </Link>
        <nav className="hidden lg:flex items-center gap-7 text-[14px] text-muted-foreground">
          {TOP_NAV.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn('relative cursor-pointer hover:text-foreground transition', isActive && 'text-brand-600 font-semibold')
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  {isActive && <span className="absolute -bottom-[22px] left-0 right-0 h-0.5 bg-brand-600 rounded-full" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="relative hidden md:block">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            placeholder="搜索项目、角色、模板... (Ctrl+K)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearch}
            className="w-64 h-9 pl-9 bg-muted border-transparent focus-visible:border-brand-300 focus-visible:bg-card text-xs"
            id="globalSearch"
          />
        </div>

        <ThemeToggle />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unread}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <span className="font-semibold">
                通知 <span className="text-xs text-muted-foreground font-normal">{unread > 0 ? `(${unread} 条未读)` : '已全部读完'}</span>
              </span>
              <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline">
                全部已读
              </button>
            </div>
            <ScrollArea className="max-h-96">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn('p-3 hover:bg-accent border-b border-border/50 flex gap-3 cursor-pointer', n.read && 'opacity-60')}
                  onClick={() => markRead(n.id)}
                >
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', NOTIF_COLORS[n.color])}>
                    {n.icon === 'check' ? '✓' : n.icon === 'star' ? '★' : '👤'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium flex items-center gap-1.5">
                      {n.title} {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{n.body}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{n.time}</div>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <Button onClick={onNewProject} className="h-9 hidden sm:flex">
          <Plus className="w-4 h-4" />
          新建项目
        </Button>
        <Button onClick={onNewProject} variant="default" size="icon" className="sm:hidden">
          <Plus className="w-4 h-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 pl-3 border-l border-border outline-none">
            <Avatar className="w-9 h-9">
              <AvatarFallback className="bg-gradient-to-br from-pink-300 via-purple-300 to-indigo-400 text-white font-bold">
                {profile.avatar}
              </AvatarFallback>
            </Avatar>
            <div className="text-xs leading-tight text-left">
              <div className="font-semibold">{profile.name}</div>
              <Badge variant="default" className="mt-0.5 py-0">
                团队版
              </Badge>
            </div>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div>{profile.name}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 font-normal">{profile.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ACCOUNT_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem key={item.key} onClick={() => navigate(item.to)}>
                  <Icon className="w-4 h-4" />
                  {item.label}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

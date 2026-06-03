import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { FolderOpen, Home, MessageSquarePlus, Sparkles, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface WorkspaceRailProps {
  onNewConversation: () => void;
  onOpenAssets: () => void;
}

function RailButton({
  label,
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<'button'> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/80 text-muted-foreground transition hover:border-primary/30 hover:bg-accent hover:text-foreground',
            className,
          )}
          {...props}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RailLink({
  to,
  label,
  children,
  className,
}: {
  to: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={to}
          aria-label={label}
          title={label}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/80 text-muted-foreground transition hover:border-primary/30 hover:bg-accent hover:text-foreground',
            className,
          )}
        >
          {children}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function WorkspaceRail({ onNewConversation, onOpenAssets }: WorkspaceRailProps) {
  return (
    <TooltipProvider delayDuration={120}>
      <aside className="w-16 shrink-0 border-r border-border bg-sidebar/95 backdrop-blur-xl flex flex-col items-center py-4 px-2">
        <Link
          to="/home"
          aria-label="漫剧AI"
          title="漫剧AI"
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary transition hover:bg-primary/15"
        >
          <Sparkles className="h-4 w-4" />
        </Link>

        <div className="flex flex-col items-center gap-2">
          <RailLink to="/home" label="返回首页">
            <Home className="h-4 w-4" />
          </RailLink>
          <RailButton label="新对话" onClick={onNewConversation}>
            <MessageSquarePlus className="h-4 w-4" />
          </RailButton>
          <RailButton label="资产库" onClick={onOpenAssets}>
            <FolderOpen className="h-4 w-4" />
          </RailButton>
        </div>

        <div className="mt-auto">
          <RailLink to="/account/settings" label="个人中心">
            <UserRound className="h-4 w-4" />
          </RailLink>
        </div>
      </aside>
    </TooltipProvider>
  );
}

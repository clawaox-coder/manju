import { motion } from 'framer-motion';
import { UserPlus, MoreVertical, Crown, Mail, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useMe, useTeamMembers } from '@/hooks/useAuthApi';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';

export default function Team() {
  const confirm = useConfirm();
  const { data: me } = useMe();
  const { data: members = [], isLoading } = useTeamMembers();

  function invite() {
    const email = window.prompt('请输入要邀请的成员邮箱:');
    if (!email) return;
    toast.success(`邀请已发送到 ${email}`);
  }

  function removeMember(name: string) {
    confirm({
      title: '移除成员',
      message: `确定将「${name}」从团队中移除? 该成员将立即失去访问权限。`,
      okText: '移除',
      danger: true,
      onConfirm: () => toast.info(`已移除「${name}」`)
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">团队协作</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {me?.team?.name ?? '我的团队'} · {members.length} 位成员
          </p>
        </div>
        <Button onClick={invite}>
          <UserPlus className="w-3.5 h-3.5" /> 邀请成员
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">团队成员</div>
          <div className="text-3xl font-bold">{members.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">本月协作</div>
          <div className="text-3xl font-bold">—</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">共享项目</div>
          <div className="text-3xl font-bold">—</div>
        </Card>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">成员列表</h2>
            <Button variant="outline" size="sm" onClick={invite}>
              + 邀请
            </Button>
          </div>
          <div className="divide-y divide-border/50">
            {members.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="px-5 py-3 flex items-center gap-3 hover:bg-accent/50"
              >
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-gradient-to-br from-purple-300 to-indigo-400 text-white font-bold">
                    {m.name.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm">{m.name}</div>
                    {m.role === 'owner' && <Crown className="w-3.5 h-3.5 text-yellow-500" />}
                    {m.id === me?.user?.id && <Badge variant="default">你</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {m.email}
                  </div>
                </div>
                <Badge variant={m.role === 'owner' || m.role === 'admin' ? 'default' : m.role === 'editor' ? 'success' : 'gray'}>
                  {m.role === 'owner' ? '管理员' : m.role === 'admin' ? '管理员' : m.role === 'editor' ? '编辑' : '查看者'}
                </Badge>
                {m.id !== me?.user?.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => toast.success(`已将「${m.name}」设为管理员`)}>设为管理员</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.success(`已将「${m.name}」改为编辑权限`)}>改为编辑</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => removeMember(m.name)}>
                        移除成员
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </motion.div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">最近动态</h2>
          <div className="text-xs text-muted-foreground text-center py-6">暂无动态</div>
        </Card>
      </div>
    </div>
  );
}

import { motion } from 'framer-motion';
import { UserPlus, MoreVertical, Crown, Mail } from 'lucide-react';
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
import { useStore } from '@/store';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MEMBERS = [
  { id: 1, name: '星辰 (你)', email: 'me@xingchen.studio', role: '管理员', initial: '星', bg: 'from-pink-300 to-purple-400', online: true, you: true },
  { id: 2, name: '林夕', email: 'linxi@xingchen.studio', role: '编辑', initial: '林', bg: 'from-pink-300 to-rose-400', online: true },
  { id: 3, name: '顾沉舟', email: 'gusz@xingchen.studio', role: '编辑', initial: '顾', bg: 'from-blue-300 to-indigo-400', online: true },
  { id: 4, name: '陈墨', email: 'chenmo@xingchen.studio', role: '查看者', initial: '陈', bg: 'from-blue-300 to-indigo-400', online: false },
  { id: 5, name: '江月', email: 'jiangyue@xingchen.studio', role: '编辑', initial: '江', bg: 'from-yellow-300 to-orange-400', online: false },
  { id: 6, name: '苏瑶', email: 'suyao@xingchen.studio', role: '查看者', initial: '苏', bg: 'from-purple-300 to-pink-400', online: false }
];

const ACTIVITIES = [
  { who: '林夕', what: '修改了「都市修仙」第 3 镜', time: '2 分钟前' },
  { who: '顾沉舟', what: '发布了「霓虹酒吧」V1', time: '15 分钟前' },
  { who: '陈墨', what: '评论了「校园暗恋」', time: '1 小时前' },
  { who: '江月', what: '上传了 5 个新场景', time: '2 小时前' }
];

export default function Team() {
  const confirm = useConfirm();
  const billing = useStore((s) => s.billing);
  const seat = billing.usage.seat;

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
            星辰工作室 · {seat.used}/{seat.total} 席位已使用
          </p>
        </div>
        <Button onClick={invite}>
          <UserPlus className="w-3.5 h-3.5" /> 邀请成员
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">团队成员</div>
          <div className="text-3xl font-bold">{MEMBERS.length}</div>
          <div className="text-[11px] text-muted-foreground mt-2">
            {MEMBERS.filter((m) => m.online).length} 在线 · {seat.total - seat.used} 个空席位
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">本月协作</div>
          <div className="text-3xl font-bold">128</div>
          <div className="text-[11px] text-muted-foreground mt-2">次编辑 · 较上月 + 24%</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">共享项目</div>
          <div className="text-3xl font-bold">8</div>
          <div className="text-[11px] text-muted-foreground mt-2">活跃 · 2 个待审核</div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">成员列表</h2>
            <Button variant="outline" size="sm" onClick={invite}>
              + 邀请
            </Button>
          </div>
          <div className="divide-y divide-border/50">
            {MEMBERS.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="px-5 py-3 flex items-center gap-3 hover:bg-accent/50"
              >
                <div className="relative">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className={cn('bg-gradient-to-br text-white font-bold', m.bg)}>{m.initial}</AvatarFallback>
                  </Avatar>
                  <span className={cn('absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card', m.online ? 'bg-green-500' : 'bg-gray-300')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm">{m.name}</div>
                    {m.role === '管理员' && <Crown className="w-3.5 h-3.5 text-yellow-500" />}
                    {m.you && <Badge variant="default">你</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {m.email}
                  </div>
                </div>
                <Badge variant={m.role === '管理员' ? 'default' : m.role === '编辑' ? 'success' : 'gray'}>{m.role}</Badge>
                {!m.you && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => toast.success(`已将「${m.name}」设为管理员`)}>设为管理员</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.success(`已将「${m.name}」改为编辑权限`)}>改为编辑</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.success(`已将「${m.name}」改为查看权限`)}>改为查看</DropdownMenuItem>
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
          <div className="space-y-3">
            {ACTIVITIES.map((a, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-8 h-8 rounded-full gradient-purple-soft flex items-center justify-center text-xs text-brand-600 font-bold flex-shrink-0">{a.who[0]}</div>
                <div className="flex-1 min-w-0 text-xs">
                  <div>
                    <strong>{a.who}</strong>
                    <span className="text-muted-foreground"> {a.what}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useShared, useLeaveShared } from '@/hooks/useProjectApi';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Shared() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data, isLoading } = useShared();
  const items = data?.data ?? [];
  const leaveMut = useLeaveShared();

  function leave(id: string, name: string) {
    confirm({
      title: '离开共享',
      message: `离开「${name}」后将无法再访问该项目, 确定吗?`,
      okText: '离开',
      danger: true,
      onConfirm: () => {
        leaveMut.mutate(id, { onSuccess: () => toast.info('已离开共享') });
      }
    });
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">与我分享</h1>
          <p className="text-xs text-muted-foreground mt-1">团队成员分享给我的项目 · 共 {items.length} 个</p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="py-16 text-center text-muted-foreground">
          <div className="text-5xl mb-3">📭</div>
          <div className="text-sm">还没有人分享给你</div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">项目</th>
                <th className="px-5 py-3 text-left font-medium">题材</th>
                <th className="px-5 py-3 text-left font-medium">状态</th>
                <th className="px-5 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-t border-border/50 hover:bg-accent/50 cursor-pointer" onClick={() => navigate(`/video?project=${s.id}`)}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-10 h-10 rounded-lg flex-shrink-0', s.bgStyle || 'bg-muted')} />
                      <div className="font-medium">{s.name}</div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">{s.genre || '-'}</td>
                  <td className="px-5 py-4">
                    <Badge variant="gray">{s.status}</Badge>
                  </td>
                  <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/video?project=${s.id}`)}>
                      打开
                    </Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-500" onClick={() => leave(s.id, s.name)}>
                      离开
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

import { AlertTriangle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTrash, useRestoreFromTrash, usePurgeFromTrash, useEmptyTrash } from '@/hooks/useProjectApi';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function daysLeft(deletedAt: string | null): number {
  if (!deletedAt) return 30;
  const diff = 30 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000);
  return Math.max(0, diff);
}

export default function Trash() {
  const confirm = useConfirm();
  const { data, isLoading } = useTrash();  const items = data?.data ?? [];
  const restoreMut = useRestoreFromTrash();
  const purgeMut = usePurgeFromTrash();
  const emptyMut = useEmptyTrash();

  function handleRestore(id: string, name: string) {
    restoreMut.mutate(id, { onSuccess: () => toast.success(`已恢复「${name}」`) });
  }

  function handlePermDel(id: string, name: string) {
    confirm({
      title: '永久删除',
      message: `「${name}」将被永久删除, 此操作无法恢复, 确定吗?`,
      okText: '永久删除',
      danger: true,
      onConfirm: () => {
        purgeMut.mutate(id, { onSuccess: () => toast.info(`已永久删除「${name}」`) });
      }
    });
  }

  function handleEmpty() {
    if (items.length === 0) {
      toast.info('回收站为空');
      return;
    }
    confirm({
      title: '清空回收站',
      message: `回收站中的 ${items.length} 项将被永久删除, 此操作无法恢复, 确定吗?`,
      okText: '清空',
      danger: true,
      onConfirm: () => {
        emptyMut.mutate(undefined, { onSuccess: (res) => toast.info(`已清空 ${res.removed} 项`) });
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
          <h1 className="text-xl font-bold">回收站</h1>
          <p className="text-xs text-muted-foreground mt-1">已删除的项目可在 30 天内恢复 · 共 {items.length} 项</p>
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={handleEmpty}>
            清空回收站
          </Button>
        </div>
      </div>

      <Card className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900/50 p-3 mb-4 flex items-center gap-2 text-xs text-yellow-800 dark:text-yellow-200">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>回收站内的项目将在 30 天后永久删除, 无法恢复。</span>
      </Card>

      {items.length === 0 ? (
        <Card className="py-16 text-center text-muted-foreground">
          <div className="text-5xl mb-3">🗑️</div>
          <div className="text-sm">回收站为空</div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">名称</th>
                <th className="px-5 py-3 text-left font-medium">题材</th>
                <th className="px-5 py-3 text-left font-medium">删除时间</th>
                <th className="px-5 py-3 text-left font-medium">剩余天数</th>
                <th className="px-5 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const days = daysLeft(t.deletedAt);
                return (
                  <tr key={t.id} className="border-t border-border/50 hover:bg-accent/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0', t.bgStyle || 'bg-muted')}>🎬</div>
                        <div className="font-medium">{t.name}</div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">{t.genre || '-'}</td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">{t.deletedAt ? new Date(t.deletedAt).toLocaleDateString('zh-CN') : '-'}</td>
                    <td className="px-5 py-4 text-xs">
                      <span className={cn(days <= 7 ? 'text-red-500 font-semibold' : days <= 15 ? 'text-yellow-600' : 'text-muted-foreground')}>
                        {days} 天
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleRestore(t.id, t.name)}>
                        恢复
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handlePermDel(t.id, t.name)}>
                        永久删除
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

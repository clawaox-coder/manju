import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trash2, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDrafts, useDeleteDraft, useClearAllDrafts } from '@/hooks/useProjectApi';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Drafts() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data, isLoading } = useDrafts();
  const drafts = data?.data ?? [];
  const deleteMut = useDeleteDraft();
  const clearMut = useClearAllDrafts();

  function del(id: string, name: string) {
    confirm({
      title: '删除草稿',
      message: `确定删除「${name}」? 可在回收站中恢复。`,
      okText: '删除',
      danger: true,
      onConfirm: () => {
        deleteMut.mutate(id, { onSuccess: () => toast.info(`「${name}」已移入回收站`) });
      }
    });
  }

  function clearAll() {
    if (drafts.length === 0) {
      toast.info('草稿箱已经是空的');
      return;
    }
    confirm({
      title: '清空草稿',
      message: `确定清空全部 ${drafts.length} 个草稿?`,
      okText: '清空',
      danger: true,
      onConfirm: () => {
        clearMut.mutate(undefined, { onSuccess: (res) => toast.info(`已清空 ${res.removed} 个草稿`) });
      }
    });
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">我的草稿</h1>
          <p className="text-xs text-muted-foreground mt-1">保存但未发布 · 共 {drafts.length} 个</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={clearAll}>
            清空草稿
          </Button>
          <Button onClick={() => navigate('/script')}>+ 新建</Button>
        </div>
      </div>

      {drafts.length === 0 ? (
        <Card className="py-16 text-center text-muted-foreground">
          <div className="text-5xl mb-3">📭</div>
          <div className="text-sm">还没有草稿</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {drafts.map((d, i) => (
            <motion.div key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
              <Card className="p-4 flex items-center gap-4 hover:shadow-md transition cursor-pointer" onClick={() => navigate(`/video?project=${d.id}`)}>
                <div className={cn('w-14 h-14 rounded-lg flex items-center justify-center text-2xl flex-shrink-0', d.bgStyle || 'bg-muted')}>
                  📝
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-semibold text-sm">{d.name}</div>
                    <Badge variant="warning">草稿</Badge>
                    {d.genre && <Badge variant="gray">{d.genre}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(d.updatedAt).toLocaleDateString('zh-CN')} · {d.version}
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" onClick={() => navigate(`/video?project=${d.id}`)}>
                    继续编辑
                  </Button>
                  <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-red-500" onClick={() => del(d.id, d.name)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

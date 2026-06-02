import { useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMe } from '@/hooks/useAuthApi';
import { useImageQuota, useUpdateImageQuotaLimit } from '@/hooks/useAdminApi';

export default function ImageQuotaAdmin() {
  const { data: me } = useMe();
  const { data: rows = [], isLoading } = useImageQuota();
  const updateLimit = useUpdateImageQuotaLimit();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const isOwner = me?.team?.role === 'owner';

  const tableRows = useMemo(
    () => rows.map((row) => ({
      ...row,
      draftLimit: drafts[row.month_yymm] ?? String(row.limit),
    })),
    [drafts, rows],
  );

  if (me && !isOwner) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Card className="p-6">
          <h1 className="text-xl font-bold">图像配额管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">无权访问。只有团队 owner 可以查看和调整图像配额。</p>
        </Card>
      </div>
    );
  }

  const saveRow = async (monthYYMM: string, currentUsed: number) => {
    const raw = drafts[monthYYMM] ?? '';
    const limit = Number(raw);
    if (!Number.isFinite(limit) || limit < 0 || !Number.isInteger(limit)) {
      toast.error('请输入大于等于 0 的整数额度');
      return;
    }
    if (limit < currentUsed) {
      toast.error('新额度不能小于已用次数');
      return;
    }
    try {
      await updateLimit.mutateAsync({ monthYYMM, limit });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[monthYYMM];
        return next;
      });
      toast.success(`已更新 ${monthYYMM} 的图像配额`);
    } catch (error) {
      toast.error((error as Error).message || '保存失败');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold">图像配额管理</h1>
        <p className="text-xs text-muted-foreground mt-1">查看团队各月份的图像使用量，并按需调整当月额度。</p>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">月度配额</h2>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : tableRows.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground text-center">当前还没有图像配额记录。首次生成图片后会出现在这里。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-left">
                  <th className="px-5 py-3 font-medium">月份</th>
                  <th className="px-5 py-3 font-medium">已用</th>
                  <th className="px-5 py-3 font-medium">限额</th>
                  <th className="px-5 py-3 font-medium">更新时间</th>
                  <th className="px-5 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const dirty = row.draftLimit !== String(row.limit);
                  const saving = updateLimit.isPending && updateLimit.variables?.monthYYMM === row.month_yymm;
                  return (
                    <tr key={row.month_yymm} className="border-t border-border/60">
                      <td className="px-5 py-3 font-medium">{row.month_yymm}</td>
                      <td className="px-5 py-3">{row.used}</td>
                      <td className="px-5 py-3">
                        <Input
                          value={row.draftLimit}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [row.month_yymm]: e.target.value }))}
                          inputMode="numeric"
                          className="max-w-[120px]"
                          aria-label={`${row.month_yymm} limit`}
                        />
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          onClick={() => void saveRow(row.month_yymm, row.used)}
                          disabled={!dirty || saving}
                        >
                          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          保存
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

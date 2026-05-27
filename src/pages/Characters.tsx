import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Upload, Search, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu';
import { useConfirm } from '@/hooks/useConfirm';
import { useAssets, useDeleteAsset } from '@/hooks/useAssetApi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const TAG_COLORS: Record<number, string> = {
  0: 'bg-pink-50 text-pink-600',
  1: 'bg-purple-50 text-purple-600',
  2: 'bg-indigo-50 text-indigo-600',
  3: 'bg-blue-50 text-blue-600',
  4: 'bg-green-50 text-green-600',
  5: 'bg-orange-50 text-orange-600',
  6: 'bg-gray-100 text-gray-600',
  7: 'bg-yellow-50 text-yellow-700',
};

function tagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(hash) % 8];
}

export default function Characters() {
  const { data, isLoading } = useAssets({ type: 'character' });
  const deleteAsset = useDeleteAsset();
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('全部');

  const characters = data?.data ?? [];

  const filtered = useMemo(() => {
    let list = characters;
    if (query.trim()) list = list.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
    if (filter !== '全部') list = list.filter((c) => c.tags.includes(filter));
    return list;
  }, [characters, query, filter]);

  const tags = useMemo(() => ['全部', ...new Set(characters.flatMap((c) => c.tags))], [characters]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">角色库</h1>
          <p className="text-xs text-muted-foreground mt-1">共 {characters.length} 个角色 · {filtered.length} 个匹配</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => toast.info('请上传角色图片')}>
            <Upload className="w-3.5 h-3.5" /> 上传角色
          </Button>
          <Button onClick={() => toast.success('AI 已生成新角色')}>
            <Sparkles className="w-3.5 h-3.5" /> AI 生成角色
          </Button>
        </div>
      </div>

      <Card className="p-3 mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索角色..." className="w-56 pl-9" />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn('px-3 py-1.5 rounded-full text-xs transition', filter === t ? 'gradient-purple text-white' : 'hover:bg-accent')}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <motion.div layout className="grid grid-cols-4 gap-4">
        {filtered.map((c, i) => (
          <ContextMenu key={c.id}>
            <ContextMenuTrigger asChild>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                whileHover={{ y: -4 }}
              >
                <Card className="overflow-hidden cursor-pointer hover:shadow-lg transition">
                  {c.thumbnail_url ? (
                    <img src={c.thumbnail_url} alt={c.name} className="aspect-square object-cover w-full" />
                  ) : (
                    <div className={cn('aspect-square flex items-center justify-center text-7xl', c.bg_style ?? 'bg-gradient-to-br from-purple-100 to-pink-100')}>
                      {c.avatar ?? c.name[0]}
                    </div>
                  )}
                  <div className="p-3">
                    <div className="font-semibold text-sm">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{c.description}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {c.tags.map((t) => (
                        <span key={t} className={cn('px-1.5 py-0.5 rounded text-[10px]', tagColor(t))}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-2">使用 {c.uses_count} 次</div>
                  </div>
                </Card>
              </motion.div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => toast.info(`查看 ${c.name} 详情`)}>查看详情</ContextMenuItem>
              <ContextMenuItem onClick={() => toast.success(`已应用到当前镜头`)}>应用到镜头</ContextMenuItem>
              <ContextMenuItem onClick={() => toast.info('AI 重新生成')}>AI 重新生成</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={() =>
                  confirm({
                    title: '删除角色',
                    message: `确定删除「${c.name}」?`,
                    okText: '删除',
                    danger: true,
                    onConfirm: () => deleteAsset.mutate(c.id),
                  })
                }
              >
                删除
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </motion.div>
    </div>
  );
}

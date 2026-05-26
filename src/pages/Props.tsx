import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu';
import { useStore } from '@/store';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Props() {
  const props = useStore((s) => s.props);
  const propFilter = useStore((s) => s.propFilter);
  const setPropFilter = useStore((s) => s.setPropFilter);
  const confirm = useConfirm();

  const cats = useMemo(() => ['全部', ...new Set(props.map((p) => p.cat))], [props]);
  const filtered = useMemo(() => (propFilter === '全部' ? props : props.filter((p) => p.cat === propFilter)), [props, propFilter]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">道具库</h1>
          <p className="text-xs text-muted-foreground mt-1">共 {filtered.length} 个道具资源</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => toast.info('请上传道具图片')}>
            <Upload className="w-3.5 h-3.5" /> 上传道具
          </Button>
          <Button onClick={() => toast.success('AI 已生成新道具')}>
            <Sparkles className="w-3.5 h-3.5" /> AI 生成道具
          </Button>
        </div>
      </div>

      <Card className="p-3 mb-4 flex items-center gap-2 flex-wrap">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setPropFilter(c)}
            className={cn('px-3 py-1.5 rounded-full text-xs transition', propFilter === c ? 'gradient-purple text-white' : 'hover:bg-accent')}
          >
            {c}
          </button>
        ))}
      </Card>

      <motion.div layout className="grid grid-cols-6 gap-4">
        {filtered.map((p, i) => (
          <ContextMenu key={p.id}>
            <ContextMenuTrigger asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.02 }}
                whileHover={{ y: -4 }}
              >
                <Card className="p-3 cursor-pointer hover:shadow-lg transition" onClick={() => toast.success(`已将「${p.name}」应用到场景`)}>
                  <div className={cn('aspect-square rounded-lg mb-3 flex items-center justify-center text-5xl', p.bg)}>{p.icon}</div>
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{p.cat}</span>
                    <span>用 {p.uses}</span>
                  </div>
                </Card>
              </motion.div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => toast.success(`已应用「${p.name}」`)}>应用到场景</ContextMenuItem>
              <ContextMenuItem onClick={() => toast.info(`「${p.name}」用于 ${p.uses} 个镜头`)}>查看使用情况</ContextMenuItem>
              <ContextMenuItem onClick={() => toast.success('已下载')}>下载</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={() =>
                  confirm({
                    title: '删除道具',
                    message: `确定删除「${p.name}」?`,
                    okText: '删除',
                    danger: true,
                    onConfirm: () => toast.info('已删除')
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

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Upload, Search, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAssets } from '@/hooks/useAssetApi';
import { UploadDialog } from '@/components/domain/UploadDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Scenes() {
  const { data, isLoading } = useAssets({ type: 'scene' });
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('全部');
  const [uploadOpen, setUploadOpen] = useState(false);

  const scenes = data?.data ?? [];

  const cats = useMemo(() => ['全部', ...new Set(scenes.flatMap((s) => s.tags))], [scenes]);
  const filtered = useMemo(() => {
    let list = scenes;
    if (query.trim()) list = list.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));
    if (cat !== '全部') list = list.filter((s) => s.tags.includes(cat));
    return list;
  }, [scenes, query, cat]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">场景库</h1>
          <p className="text-xs text-muted-foreground mt-1">共 {scenes.length} 个场景资源</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setUploadOpen(true)}>
            <Upload className="w-3.5 h-3.5" /> 上传场景
          </Button>
          <Button onClick={() => toast.success('AI 已生成新场景')}>
            <Sparkles className="w-3.5 h-3.5" /> AI 生成场景
          </Button>
        </div>
      </div>

      <Card className="p-3 mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索场景..." className="w-56 pl-9" />
        </div>
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn('px-3 py-1.5 rounded-full text-xs transition', cat === c ? 'gradient-purple text-white' : 'hover:bg-accent')}
          >
            {c}
          </button>
        ))}
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <motion.div layout className="grid grid-cols-4 gap-4">
        {filtered.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            whileHover={{ y: -4 }}
          >
            <Card className="overflow-hidden cursor-pointer hover:shadow-lg transition group" onClick={() => toast.success(`已应用「${s.name}」`)}>
              {s.thumbnail_url ? (
                <img src={s.thumbnail_url} alt={s.name} className="aspect-video object-cover w-full" />
              ) : (
                <div className={cn('aspect-video relative', s.bg_style ?? 'bg-gradient-to-br from-sky-100 to-blue-200')}>
                  {s.tags[0] && <Badge className="absolute top-2 right-2 backdrop-blur bg-black/40 text-white">{s.tags[0]}</Badge>}
                </div>
              )}
              <div className="p-3">
                <div className="font-semibold text-sm mb-1">{s.name}</div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>已用 {s.uses_count} 次</span>
                  <span className="text-brand-600 opacity-0 group-hover:opacity-100">应用 →</span>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} assetType="scene" accept="image/*" title="上传场景" />
    </div>
  );
}

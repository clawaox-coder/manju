import { Play, Pause, Upload, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAssets } from '@/hooks/useAssetApi';
import { toast } from 'sonner';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export default function Sfx() {
  const { data, isLoading } = useAssets({ type: 'sfx' });
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [cat, setCat] = useState('全部');

  const sfx = data?.data ?? [];

  useEffect(() => {
    if (playingId == null) return;
    const t = setTimeout(() => setPlayingId(null), 2000);
    return () => clearTimeout(t);
  }, [playingId]);

  const cats = useMemo(() => ['全部', ...new Set(sfx.flatMap((s) => s.tags))], [sfx]);
  const filtered = cat === '全部' ? sfx : sfx.filter((s) => s.tags.includes(cat));

  function toggle(id: string, name: string) {
    if (playingId === id) setPlayingId(null);
    else {
      setPlayingId(id);
      toast.info(`试听: ${name}`);
    }
  }

  function fmtDuration(ms: number | null) {
    if (!ms) return '--';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">音效库</h1>
          <p className="text-xs text-muted-foreground mt-1">动作、环境、转场、UI 音效 · 共 {sfx.length} 个</p>
        </div>
        <Button onClick={() => toast.info('请选择音效文件')}>
          <Upload className="w-3.5 h-3.5" /> 上传音效
        </Button>
      </div>

      <Card className="p-3 mb-4 flex items-center gap-2 flex-wrap">
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

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium w-12">#</th>
              <th className="px-5 py-3 text-left font-medium">音效</th>
              <th className="px-5 py-3 text-left font-medium">标签</th>
              <th className="px-5 py-3 text-left font-medium">时长</th>
              <th className="px-5 py-3 text-left font-medium">波形</th>
              <th className="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, idx) => (
              <tr key={s.id} className={cn('border-t border-border/50 hover:bg-accent/50', playingId === s.id && 'bg-brand-50/30')}>
                <td className="px-5 py-3 text-muted-foreground text-xs">{String(idx + 1).padStart(2, '0')}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn('size-8 gradient-purple-soft text-brand-600', playingId === s.id && 'gradient-purple text-white')}
                      onClick={() => toggle(s.id, s.name)}
                    >
                      {playingId === s.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </Button>
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  {s.tags[0] && <Badge variant="default">{s.tags[0]}</Badge>}
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{fmtDuration(s.duration_ms)}</td>
                <td className="px-5 py-3">
                  <div className="h-6 w-32 audio-wave rounded" />
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => toast.success(`已添加「${s.name}」到时间轴`)} className="text-xs text-brand-600 hover:underline">
                    + 使用
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

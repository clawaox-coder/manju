import { Play, Pause, Upload, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAssets } from '@/hooks/useAssetApi';
import { UploadDialog } from '@/components/domain/UploadDialog';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export default function Music() {
  const { data, isLoading } = useAssets({ type: 'music' });
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const music = data?.data ?? [];

  useEffect(() => {
    if (playingId == null) return;
    const t = setTimeout(() => setPlayingId(null), 4000);
    return () => clearTimeout(t);
  }, [playingId]);

  function toggle(id: string, name: string) {
    if (playingId === id) {
      setPlayingId(null);
      toast.info('已停止播放');
    } else {
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
          <h1 className="text-xl font-bold">音乐库</h1>
          <p className="text-xs text-muted-foreground mt-1">{music.length} 首版权音乐</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="w-3.5 h-3.5" /> 上传音乐
        </Button>
      </div>

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
              <th className="px-5 py-3 text-left font-medium">曲名</th>
              <th className="px-5 py-3 text-left font-medium">标签</th>
              <th className="px-5 py-3 text-left font-medium">时长</th>
              <th className="px-5 py-3 text-left font-medium">使用</th>
              <th className="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {music.map((m, idx) => (
              <tr key={m.id} className={cn('border-t border-border/50 hover:bg-accent/50', playingId === m.id && 'bg-brand-50/30')}>
                <td className="px-5 py-3 text-muted-foreground text-xs">{String(idx + 1).padStart(2, '0')}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn('size-8 gradient-purple-soft text-brand-600', playingId === m.id && 'gradient-purple text-white')}
                      onClick={() => toggle(m.id, m.name)}
                    >
                      {playingId === m.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </Button>
                    <span className="text-sm font-medium">{m.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  {m.tags[0] && <Badge variant="default">{m.tags[0]}</Badge>}
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{fmtDuration(m.duration_ms)}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{m.uses_count}</td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => toast.success(`已添加「${m.name}」到 BGM`)} className="text-xs text-brand-600 hover:underline">
                    + 使用
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} assetType="music" accept="audio/*" title="上传音乐" />
    </div>
  );
}

import { Play, Pause, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

export default function Music() {
  const music = useStore((s) => s.music);
  const playingId = useStore((s) => s.playingMusicId);
  const setPlaying = useStore((s) => s.setPlayingMusic);

  useEffect(() => {
    if (playingId == null) return;
    const t = setTimeout(() => setPlaying(null), 4000);
    return () => clearTimeout(t);
  }, [playingId, setPlaying]);

  function toggle(id: number, name: string) {
    if (playingId === id) {
      setPlaying(null);
      toast.info('已停止播放');
    } else {
      setPlaying(id);
      toast.info(`试听: ${name}`);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">音乐库</h1>
          <p className="text-xs text-muted-foreground mt-1">{music.length} 首版权音乐</p>
        </div>
        <Button onClick={() => toast.info('请选择音乐文件')}>
          <Upload className="w-3.5 h-3.5" /> 上传音乐
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium w-12">#</th>
              <th className="px-5 py-3 text-left font-medium">曲名</th>
              <th className="px-5 py-3 text-left font-medium">分类</th>
              <th className="px-5 py-3 text-left font-medium">情绪</th>
              <th className="px-5 py-3 text-left font-medium">时长</th>
              <th className="px-5 py-3 text-left font-medium">BPM</th>
              <th className="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {music.map((m) => (
              <tr key={m.id} className={cn('border-t border-border/50 hover:bg-accent/50', playingId === m.id && 'bg-brand-50/30')}>
                <td className="px-5 py-3 text-muted-foreground text-xs">{String(m.id).padStart(2, '0')}</td>
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
                <td className="px-5 py-3 text-xs text-muted-foreground">{m.cat}</td>
                <td className="px-5 py-3">
                  <Badge variant="default">{m.mood}</Badge>
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{m.dur}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{m.bpm}</td>
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
    </div>
  );
}

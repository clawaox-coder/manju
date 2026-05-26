import { Play, Pause, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export default function Sfx() {
  const sfx = useStore((s) => s.sfx);
  const playingId = useStore((s) => s.playingSfxId);
  const setPlaying = useStore((s) => s.setPlayingSfx);
  const [cat, setCat] = useState('全部');

  useEffect(() => {
    if (playingId == null) return;
    const t = setTimeout(() => setPlaying(null), 2000);
    return () => clearTimeout(t);
  }, [playingId, setPlaying]);

  const cats = ['全部', ...Array.from(new Set(sfx.map((s) => s.cat)))];
  const filtered = cat === '全部' ? sfx : sfx.filter((s) => s.cat === cat);

  function toggle(id: number, name: string) {
    if (playingId === id) setPlaying(null);
    else {
      setPlaying(id);
      toast.info(`试听: ${name}`);
    }
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

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium w-12">#</th>
              <th className="px-5 py-3 text-left font-medium">音效</th>
              <th className="px-5 py-3 text-left font-medium">分类</th>
              <th className="px-5 py-3 text-left font-medium">情绪</th>
              <th className="px-5 py-3 text-left font-medium">时长</th>
              <th className="px-5 py-3 text-left font-medium">波形</th>
              <th className="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className={cn('border-t border-border/50 hover:bg-accent/50', playingId === s.id && 'bg-brand-50/30')}>
                <td className="px-5 py-3 text-muted-foreground text-xs">{String(s.id).padStart(2, '0')}</td>
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
                <td className="px-5 py-3 text-xs text-muted-foreground">{s.cat}</td>
                <td className="px-5 py-3">
                  <Badge variant="default">{s.mood}</Badge>
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{s.dur}</td>
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

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Sparkles, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useStore } from '@/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const TAG_COLORS: Record<string, string> = {
  pink: 'bg-pink-50 text-pink-600',
  purple: 'bg-purple-50 text-purple-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  orange: 'bg-orange-50 text-orange-600',
  gray: 'bg-gray-100 text-gray-600',
  yellow: 'bg-yellow-50 text-yellow-700',
  amber: 'bg-amber-50 text-amber-700'
};

export default function Voice() {
  const voices = useStore((s) => s.voices);
  const shots = useStore((s) => s.shots);
  const [playing, setPlaying] = useState<string | null>(null);

  function toggle(key: string, name: string) {
    if (playing === key) setPlaying(null);
    else {
      setPlaying(key);
      toast.info(`正在试听 ${name}`);
      setTimeout(() => setPlaying((p) => (p === key ? null : p)), 2500);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">配音与对白</h1>
          <p className="text-xs text-muted-foreground mt-1">为分镜匹配最合适的配音角色</p>
        </div>
        <Button onClick={() => toast.success(`已为 ${shots.length} 个分镜匹配配音`)}>
          <Sparkles className="w-3.5 h-3.5" /> 一键 AI 配音
        </Button>
      </div>

      {/* Voice cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {voices.map((v, i) => (
          <motion.div
            key={v.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={cn('w-12 h-12 rounded-full flex items-center justify-center text-2xl', v.bg)}>{v.icon}</div>
                <div>
                  <div className="font-semibold">{v.name}</div>
                  <div className="text-xs text-muted-foreground">{v.desc}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mb-3 min-h-[20px]">
                {v.tags.map((t) => (
                  <span key={t.label} className={cn('px-1.5 py-0.5 rounded text-[10px]', TAG_COLORS[t.color])}>
                    {t.label}
                  </span>
                ))}
              </div>
              <Button
                onClick={() => toggle(`v${v.id}`, v.name)}
                variant={playing === `v${v.id}` ? 'default' : 'secondary'}
                size="sm"
                className="w-full"
              >
                {playing === `v${v.id}` ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />} 试听
              </Button>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="font-semibold mb-4">分镜配音匹配 ({shots.length})</h2>
        <div className="space-y-3">
          {shots.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand-200 hover:bg-brand-50/30 transition">
              <div className="w-10 h-10 rounded-lg gradient-purple-soft flex items-center justify-center text-brand-600 font-bold text-sm">{s.num}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">{s.title.split('·')[0].trim()}</div>
                <div className="text-sm truncate">{s.dialog}</div>
              </div>
              <Button variant="ghost" size="icon" className="size-9" onClick={() => toggle(`s${s.id}`, `分镜 ${s.num}`)}>
                {playing === `s${s.id}` ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </Button>
              <Button variant="outline" size="sm" className="min-w-[110px] justify-between">
                <span className="flex items-center gap-2">
                  <Avatar className="w-5 h-5">
                    <AvatarFallback className={cn('text-xs', voices[0].bg)}>{voices[0].icon}</AvatarFallback>
                  </Avatar>
                  {voices[0].name}
                </span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

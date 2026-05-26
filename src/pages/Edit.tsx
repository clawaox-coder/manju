import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, RotateCcw, Play } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useStore } from '@/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AppState } from '@/store';

const PRESETS: Record<string, { name: string; desc: string; icon: string; params: AppState['editParams'] }> = {
  rhythm: { name: '节奏感强', desc: '快节奏卡点剪辑, 适合热血/动作', icon: '⚡', params: { transition: 80, bgmIntensity: 90, subtitleStyle: 60, paceCut: 80 } },
  slow: { name: '慢镜头唯美', desc: '抒情慢节奏, 适合言情/治愈', icon: '🌸', params: { transition: 30, bgmIntensity: 50, subtitleStyle: 70, paceCut: 20 } },
  cinematic: { name: '电影感', desc: '电影级运镜与调色', icon: '🎬', params: { transition: 50, bgmIntensity: 70, subtitleStyle: 80, paceCut: 50 } },
  montage: { name: '蒙太奇', desc: '多线交叉剪辑, 适合悬疑', icon: '🎞️', params: { transition: 60, bgmIntensity: 80, subtitleStyle: 40, paceCut: 65 } },
  vlog: { name: '轻松Vlog', desc: '自然轻快, 适合校园/日常', icon: '🎥', params: { transition: 40, bgmIntensity: 60, subtitleStyle: 90, paceCut: 30 } },
  trailer: { name: '预告片', desc: '强冲击力剪辑, 适合宣传片', icon: '🔥', params: { transition: 90, bgmIntensity: 95, subtitleStyle: 75, paceCut: 90 } }
};

const PARAMS: { key: keyof AppState['editParams']; label: string; desc: string }[] = [
  { key: 'transition', label: '转场频率', desc: '少 ←→ 多' },
  { key: 'bgmIntensity', label: 'BGM 强度', desc: '轻柔 ←→ 强烈' },
  { key: 'subtitleStyle', label: '字幕显著度', desc: '弱 ←→ 强' },
  { key: 'paceCut', label: '剪辑节奏', desc: '慢 ←→ 快' }
];

export default function Edit() {
  const navigate = useNavigate();
  const projectName = useStore((s) => s.projectName);
  const preset = useStore((s) => s.editPreset);
  const params = useStore((s) => s.editParams);
  const setPreset = useStore((s) => s.setEditPreset);
  const setParam = useStore((s) => s.setEditParam);
  const shots = useStore((s) => s.shots);
  const currentShot = shots[0];
  const p = PRESETS[preset];

  function selectPreset(key: string) {
    setPreset(key);
    const next = PRESETS[key].params;
    (Object.keys(next) as (keyof AppState['editParams'])[]).forEach((k) => setParam(k, next[k]));
    toast.success(`已切换到「${PRESETS[key].name}」风格`);
  }

  function reset() {
    selectPreset(preset);
    toast.info('参数已重置');
  }

  function runEdit() {
    toast.info(`AI 正在以「${p.name}」风格剪辑...`);
    setTimeout(() => navigate('/video'), 1200);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <button onClick={() => navigate('/video')} className="text-xs text-brand-600 hover:underline">
            {projectName} ›
          </button>
          <h1 className="text-xl font-bold mt-1">智能剪辑</h1>
          <p className="text-xs text-muted-foreground mt-1">选择风格 + 微调参数, AI 自动剪辑成片</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="w-3.5 h-3.5" /> 重置参数
          </Button>
          <Button onClick={runEdit}>
            <Sparkles className="w-3.5 h-3.5" /> 一键剪辑
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3">选择剪辑风格</h3>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(PRESETS).map(([k, v]) => (
                <motion.button
                  key={k}
                  whileHover={{ y: -2 }}
                  onClick={() => selectPreset(k)}
                  className={cn('p-4 rounded-xl border-2 text-left transition', preset === k ? 'border-brand-500 bg-brand-50/30' : 'border-border hover:border-muted-foreground/30')}
                >
                  <div className="text-2xl mb-2">{v.icon}</div>
                  <div className="text-sm font-semibold">{v.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{v.desc}</div>
                </motion.button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-4">参数微调</h3>
            <div className="space-y-5">
              {PARAMS.map(({ key, label, desc }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-[11px] text-muted-foreground">{desc}</div>
                    </div>
                    <div className="text-sm font-bold text-brand-600 w-10 text-right">{params[key]}</div>
                  </div>
                  <Slider value={[params[key]]} max={100} onValueChange={(v) => setParam(key, v[0])} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="font-semibold mb-3">预览效果</h3>
          <div className={cn('aspect-video rounded-xl overflow-hidden relative mb-3', currentShot.bg)}>
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="text-6xl opacity-60">
                {p.icon}
              </motion.div>
            </div>
            <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/40 backdrop-blur text-white text-[10px] rounded">{p.name}</div>
            <div className="absolute bottom-2 left-2 right-2 text-center">
              <span className="text-white text-sm font-medium" style={{ textShadow: '1px 1px 0 #000' }}>
                预览片段 · 0:08
              </span>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">预估时长</span>
              <span className="font-medium">00:45</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">转场数量</span>
              <span className="font-medium">{Math.floor(params.transition / 15)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">剪辑点</span>
              <span className="font-medium">{Math.floor(params.paceCut / 5)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">字幕数量</span>
              <span className="font-medium">{shots.length}</span>
            </div>
          </div>
          <Card className="mt-4 p-3 gradient-purple-soft border-purple-200">
            <div className="text-xs font-semibold text-brand-700 mb-1">💡 AI 建议</div>
            <div className="text-[11px] text-foreground/80">
              基于你的项目类型 "{currentShot.type}", 推荐使用「{p.name}」风格。
            </div>
          </Card>
          <Button variant="outline" className="mt-4 w-full" onClick={() => navigate('/video')}>
            <Play className="w-3.5 h-3.5" /> 试看预览
          </Button>
        </Card>
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Sparkles, Loader2, Upload, Volume2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { useAssets } from '@/hooks/useAssetApi';
import { UploadDialog } from '@/components/domain/UploadDialog';
import { useStore } from '@/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { generateTTS, type TTSVoice } from '@/lib/api/ai';

const TAG_COLORS: Record<number, string> = {
  0: 'bg-pink-50 text-pink-600',
  1: 'bg-purple-50 text-purple-600',
  2: 'bg-indigo-50 text-indigo-600',
  3: 'bg-blue-50 text-blue-600',
  4: 'bg-green-50 text-green-600',
  5: 'bg-orange-50 text-orange-600',
  6: 'bg-gray-100 text-gray-600',
  7: 'bg-amber-50 text-amber-700',
};

const TTS_VOICES: { value: TTSVoice; label: string }[] = [
  { value: 'alloy', label: 'Alloy (中性)' },
  { value: 'echo', label: 'Echo (男声)' },
  { value: 'fable', label: 'Fable (叙事)' },
  { value: 'onyx', label: 'Onyx (低沉男声)' },
  { value: 'nova', label: 'Nova (女声)' },
  { value: 'shimmer', label: 'Shimmer (柔和女声)' },
];

function tagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(hash) % 8];
}

export default function Voice() {
  const { data, isLoading } = useAssets({ type: 'voice' });
  const shots = useStore((s) => s.shots);
  const [playing, setPlaying] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // TTS state
  const [ttsOpen, setTtsOpen] = useState(false);
  const [ttsText, setTtsText] = useState('');
  const [ttsVoice, setTtsVoice] = useState<TTSVoice>('nova');
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsBlob, setTtsBlob] = useState<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const voices = data?.data ?? [];

  function toggle(key: string, name: string) {
    if (playing === key) setPlaying(null);
    else {
      setPlaying(key);
      toast.info(`正在试听 ${name}`);
      setTimeout(() => setPlaying((p) => (p === key ? null : p)), 2500);
    }
  }

  async function handleTTSGenerate() {
    if (!ttsText.trim()) {
      toast.error('请输入要合成的文本');
      return;
    }
    setTtsLoading(true);
    setTtsAudioUrl(null);
    setTtsBlob(null);
    try {
      const blob = await generateTTS({ text: ttsText, voice: ttsVoice, speed: ttsSpeed });
      const url = URL.createObjectURL(blob);
      setTtsAudioUrl(url);
      setTtsBlob(blob);
      toast.success('语音合成完成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'TTS 生成失败');
    } finally {
      setTtsLoading(false);
    }
  }

  function handleTTSSave() {
    if (!ttsBlob) return;
    // Trigger download as a simple "save to library" action
    const a = document.createElement('a');
    a.href = URL.createObjectURL(ttsBlob);
    a.download = `tts-${ttsVoice}-${Date.now()}.mp3`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('已保存到本地');
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">配音与对白</h1>
          <p className="text-xs text-muted-foreground mt-1">为分镜匹配最合适的配音角色</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setTtsOpen(true)} variant="outline">
            <Volume2 className="w-3.5 h-3.5" /> AI 生成配音
          </Button>
          <Button onClick={() => toast.success(`已为 ${shots.length} 个分镜匹配配音`)}>
            <Sparkles className="w-3.5 h-3.5" /> 一键 AI 配音
          </Button>
          <Button variant="outline" onClick={() => setUploadOpen(true)}>
            <Upload className="w-3.5 h-3.5" /> 上传配音
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

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
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt={v.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className={cn('w-12 h-12 rounded-full flex items-center justify-center text-2xl', v.bg_style ?? 'bg-gradient-to-br from-violet-100 to-purple-200')}>
                    {v.avatar ?? v.name[0]}
                  </div>
                )}
                <div>
                  <div className="font-semibold">{v.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{v.description}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mb-3 min-h-[20px]">
                {v.tags.map((t) => (
                  <span key={t} className={cn('px-1.5 py-0.5 rounded text-[10px]', tagColor(t))}>
                    {t}
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
            </div>
          ))}
        </div>
      </Card>

      {/* TTS Dialog */}
      <Dialog open={ttsOpen} onOpenChange={setTtsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>AI 生成配音</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">文本内容</label>
              <textarea
                className="w-full min-h-[100px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring/50"
                placeholder="输入要合成语音的文本..."
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                maxLength={4096}
              />
              <div className="text-xs text-muted-foreground text-right mt-1">{ttsText.length}/4096</div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">语音角色</label>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value as TTSVoice)}
              >
                {TTS_VOICES.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">语速: {ttsSpeed.toFixed(1)}x</label>
              <Slider
                min={0.25}
                max={4.0}
                step={0.1}
                value={[ttsSpeed]}
                onValueChange={([v]) => setTtsSpeed(v)}
              />
            </div>
            {ttsAudioUrl && (
              <div className="rounded-lg border border-border p-3 bg-muted/30">
                <audio ref={audioRef} src={ttsAudioUrl} controls className="w-full h-8" />
              </div>
            )}
          </div>
          <DialogFooter>
            {ttsBlob && (
              <Button variant="outline" onClick={handleTTSSave}>
                保存到素材库
              </Button>
            )}
            <Button onClick={handleTTSGenerate} disabled={ttsLoading || !ttsText.trim()}>
              {ttsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {ttsLoading ? '生成中...' : '生成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} assetType="voice" accept="audio/*" title="上传配音" />
    </div>
  );
}
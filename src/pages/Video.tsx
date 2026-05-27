import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  horizontalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Maximize,
  Layers,
  Music,
  Type,
  Mic,
  Sparkles,
  Download,
  Save,
  Image as ImageIcon,
  GripVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useStore } from '@/store';
import { fmtTime, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Shot } from '@/types';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useCreateRender, useRenderJob } from '@/hooks/useRenderApi';
import { useShots, useReorderShots } from '@/hooks/useScriptApi';

function SortableShot({ shot, active, onClick }: { shot: Shot; active: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: shot.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg cursor-pointer transition group',
        active ? 'gradient-purple-soft border border-brand-300' : 'hover:bg-accent'
      )}
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <div className={cn('w-16 h-10 rounded flex-shrink-0', shot.bg)} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold flex items-center gap-1">
          <Badge variant="default" className="py-0">
            {shot.num}
          </Badge>
          <span className="text-muted-foreground text-[11px]">{shot.type}</span>
        </div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{shot.dialog}</div>
      </div>
      <div className="text-[10px] text-muted-foreground">{shot.duration}s</div>
    </div>
  );
}

function TimelineShot({ shot, active, offset, scale, onClick }: { shot: Shot; active: boolean; offset: number; scale: number; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: shot.id });
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        width: shot.duration * scale,
        marginLeft: offset === 0 ? undefined : 2
      }}
      className={cn(
        'h-full rounded relative overflow-hidden cursor-pointer flex-shrink-0',
        shot.bg,
        active && 'ring-2 ring-brand-500'
      )}
      {...attributes}
      {...listeners}
    >
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute top-1 left-1.5 text-white text-[10px] font-semibold">{shot.num}</div>
      <div className="absolute bottom-1 left-1.5 right-1.5 text-white text-[10px] truncate">{shot.duration}s</div>
    </div>
  );
}

export default function Video() {
  const navigate = useNavigate();
  const projectId = useStore((s) => s.projectId);
  const projectName = useStore((s) => s.projectName);
  const { data: apiShots } = useShots(projectId ?? undefined);
  const reorderShots = useReorderShots(projectId ?? '');

  const shotsState = apiShots ?? useStore.getState().shots;
  const [shots, setShots] = useState(shotsState);
  const currentShotId = useStore((s) => s.currentShotId);
  const setCurrentShot = useStore((s) => s.setCurrentShot);
  const isPlaying = useStore((s) => s.isPlaying);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const currentTime = useStore((s) => s.currentTime);
  const setCurrentTime = useStore((s) => s.setCurrentTime);

  // 当 API shots 更新时同步本地
  useEffect(() => {
    if (apiShots) setShots(apiShots); // eslint-disable-line react-hooks/set-state-in-effect
  }, [apiShots]);
  const [renderOpen, setRenderOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [volume, setVolume] = useState(80);
  const [zoom, setZoom] = useState(30); // px per second

  const createRender = useCreateRender();
  const { data: activeJob } = useRenderJob(activeJobId ?? undefined);

  // 当 job 完成时自动切到 export dialog
  useEffect(() => {
    if (activeJob?.status === 'done') {
      setRenderOpen(false); // eslint-disable-line react-hooks/set-state-in-effect
      setExportOpen(true); // eslint-disable-line react-hooks/set-state-in-effect
    } else if (activeJob?.status === 'failed') {
      setRenderOpen(false); // eslint-disable-line react-hooks/set-state-in-effect
      toast.error(`渲染失败: ${activeJob.error ?? '未知错误'}`);
    }
  }, [activeJob?.status]);

  const renderProgress = activeJob?.progress ?? 0;
  const renderStage = activeJob?.stage ?? '';

  const totalTime = useMemo(() => shots.reduce((s, x) => s + x.duration, 0), [shots]);
  const currentShot = shots.find((s) => s.id === currentShotId) || shots[0];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Tick playback
  useEffect(() => {
    if (!isPlaying) return;
    const t = setInterval(() => {
      const next = currentTime + 0.1;
      if (next >= totalTime) {
        setIsPlaying(false);
        setCurrentTime(totalTime);
        toast.info('播放完毕');
        return;
      }
      setCurrentTime(next);
      let acc = 0;
      for (const s of shots) {
        if (next >= acc && next < acc + s.duration) {
          if (s.id !== currentShotId) setCurrentShot(s.id);
          break;
        }
        acc += s.duration;
      }
    }, 100);
    return () => clearInterval(t);
  }, [isPlaying, currentTime, totalTime, shots, currentShotId, setIsPlaying, setCurrentTime, setCurrentShot]);

  useShortcuts([
    { key: ' ', description: '播放/暂停', group: '视频', handler: () => setIsPlaying(!isPlaying) },
    { key: 'ArrowLeft', description: '上一镜', group: '视频', handler: prevShot },
    { key: 'ArrowRight', description: '下一镜', group: '视频', handler: nextShot },
    { key: 'j', description: '后退 2s', group: '视频', handler: () => setCurrentTime(Math.max(0, currentTime - 2)) },
    { key: 'l', description: '前进 2s', group: '视频', handler: () => setCurrentTime(Math.min(totalTime, currentTime + 2)) }
  ]);

  function prevShot() {
    const idx = shots.findIndex((s) => s.id === currentShotId);
    if (idx > 0) jumpToShot(shots[idx - 1].id);
  }
  function nextShot() {
    const idx = shots.findIndex((s) => s.id === currentShotId);
    if (idx < shots.length - 1) jumpToShot(shots[idx + 1].id);
  }
  function jumpToShot(id: number) {
    setCurrentShot(id);
    let acc = 0;
    for (const s of shots) {
      if (s.id === id) break;
      acc += s.duration;
    }
    setCurrentTime(acc);
  }

  function handleDragEnd(e: DragEndEvent) {
    if (e.over && e.active.id !== e.over.id) {
      const oldIndex = shots.findIndex((s) => s.id === e.active.id);
      const newIndex = shots.findIndex((s) => s.id === e.over!.id);
      const next = arrayMove(shots, oldIndex, newIndex);
      setShots(next);
      // 同步到 API
      if (projectId) {
        const order = next.map((s) => String(s.id));
        reorderShots.mutate(order);
      }
    }
  }

  function startRender() {
    const projectId = useStore.getState().projectId;
    if (!projectId) {
      toast.error('请先选择一个项目');
      return;
    }
    setRenderOpen(true);
    setActiveJobId(null);
    createRender.mutate(
      { input: { project_id: projectId, resolution: '1080p', format: 'mp4' } },
      {
        onSuccess: (data) => {
          setActiveJobId(data.job_id);
        },
        onError: (err) => {
          setRenderOpen(false);
          toast.error(`发起渲染失败: ${(err as Error).message}`);
        },
      },
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/projects')} className="text-xs text-brand-600 hover:underline">
            {projectName} ›
          </button>
          <h1 className="text-base font-semibold">视频生成</h1>
          <Badge variant="success">自动保存 · 刚刚</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.success('已保存')}>
            <Save className="w-3.5 h-3.5" /> 保存
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/edit')}>
            <Sparkles className="w-3.5 h-3.5" /> 智能剪辑
          </Button>
          <Button size="sm" onClick={startRender}>
            <Download className="w-3.5 h-3.5" /> 渲染并导出
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Shot list */}
        <div className="w-72 border-r border-border bg-card overflow-y-auto">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">镜头列表</div>
              <div className="text-[11px] text-muted-foreground">{shots.length} 个 · 拖拽排序</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/storyboard')}>
              + 添加
            </Button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={shots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="p-2 space-y-1">
                {shots.map((s) => (
                  <SortableShot key={s.id} shot={s} active={s.id === currentShotId} onClick={() => jumpToShot(s.id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Center: Preview */}
        <div className="flex-1 flex flex-col bg-muted/30 overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-6 min-h-0">
            <div className="aspect-video w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentShot.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={cn('absolute inset-0', currentShot.bg)}
                />
              </AnimatePresence>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <motion.div
                  animate={isPlaying ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-7xl opacity-70"
                >
                  {isPlaying ? '🎬' : '⏸'}
                </motion.div>
              </div>

              {/* Top overlay */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                <Badge className="backdrop-blur bg-black/40 text-white">
                  {currentShot.num} · {currentShot.type}
                </Badge>
                <Badge variant="gray" className="backdrop-blur bg-black/40 text-white">
                  {fmtTime(currentTime)} / {fmtTime(totalTime)}
                </Badge>
              </div>

              {/* Bottom subtitle */}
              <div className="absolute bottom-16 left-0 right-0 text-center px-6">
                <motion.div
                  key={currentShot.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-block px-3 py-1.5 rounded bg-black/60 text-white text-sm font-medium"
                  style={{ textShadow: '1px 1px 0 #000' }}
                >
                  {currentShot.dialog}
                </motion.div>
              </div>

              {/* Bottom controls */}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                <div className="flex items-center gap-3 text-white">
                  <Button variant="ghost" size="icon" className="size-9 text-white hover:bg-white/20" onClick={prevShot}>
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 text-white hover:bg-white/20"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="size-9 text-white hover:bg-white/20" onClick={nextShot}>
                    <SkipForward className="w-4 h-4" />
                  </Button>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-xs">{fmtTime(currentTime)}</span>
                    <Slider
                      value={[currentTime]}
                      max={totalTime}
                      step={0.1}
                      onValueChange={(v) => setCurrentTime(v[0])}
                      className="flex-1"
                    />
                    <span className="text-xs">{fmtTime(totalTime)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 w-24">
                    <Volume2 className="w-4 h-4" />
                    <Slider value={[volume]} max={100} onValueChange={(v) => setVolume(v[0])} className="flex-1" />
                  </div>
                  <Button variant="ghost" size="icon" className="size-9 text-white hover:bg-white/20">
                    <Maximize className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="border-t border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Layers className="w-3.5 h-3.5" />
                时间轴
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>缩放</span>
                <Slider value={[zoom]} min={10} max={60} step={5} onValueChange={(v) => setZoom(v[0])} className="w-24" />
              </div>
            </div>

            {/* Ruler */}
            <div className="relative h-4 mb-1 border-b border-border">
              {Array.from({ length: Math.ceil(totalTime / 5) + 1 }).map((_, i) => (
                <div key={i} style={{ left: i * 5 * zoom }} className="absolute top-0 text-[10px] text-muted-foreground -translate-x-1/2">
                  {i * 5}s
                </div>
              ))}
              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-px bg-red-500 z-10 pointer-events-none"
                style={{ left: currentTime * zoom }}
              >
                <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
              </div>
            </div>

            {/* Video track */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-16 text-[10px] text-muted-foreground flex items-center gap-1">
                <ImageIcon className="w-3 h-3" /> 视频
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={shots.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
                  <div className="flex h-10 relative flex-1 overflow-x-auto">
                    {shots.map((s, i) => {
                      let offset = 0;
                      for (let k = 0; k < i; k++) offset += shots[k].duration;
                      return <TimelineShot key={s.id} shot={s} active={s.id === currentShotId} offset={offset} scale={zoom} onClick={() => jumpToShot(s.id)} />;
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* Subtitle track */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-16 text-[10px] text-muted-foreground flex items-center gap-1">
                <Type className="w-3 h-3" /> 字幕
              </div>
              <div className="flex h-6 flex-1">
                {shots.map((s) => (
                  <div
                    key={s.id}
                    style={{ width: s.duration * zoom }}
                    className="h-full bg-blue-50 border border-blue-200 rounded flex items-center px-2 text-[10px] truncate text-blue-700 mr-0.5"
                  >
                    {s.dialog.replace(/[[(].*?[\])]/g, '').trim().slice(0, 20)}
                  </div>
                ))}
              </div>
            </div>

            {/* Audio track */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-16 text-[10px] text-muted-foreground flex items-center gap-1">
                <Music className="w-3 h-3" /> BGM
              </div>
              <div className="flex h-6 flex-1">
                <div className="h-full bg-green-50 border border-green-200 rounded flex items-center px-2 text-[10px] text-green-700" style={{ width: totalTime * zoom }}>
                  🎵 追光者 (影视氛围版).mp3
                </div>
              </div>
            </div>

            {/* Voice track */}
            <div className="flex items-center gap-2">
              <div className="w-16 text-[10px] text-muted-foreground flex items-center gap-1">
                <Mic className="w-3 h-3" /> 配音
              </div>
              <div className="flex h-6 flex-1">
                {shots.map((s) => (
                  <div
                    key={s.id}
                    style={{ width: s.duration * zoom }}
                    className="h-full bg-orange-50 border border-orange-200 rounded mr-0.5 audio-wave"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Inspector */}
        <div className="w-80 border-l border-border bg-card overflow-y-auto">
          <div className="p-3 border-b border-border">
            <div className="text-sm font-semibold">检查器</div>
            <div className="text-[11px] text-muted-foreground">当前: 镜头 {currentShot.num}</div>
          </div>
          <Tabs defaultValue="visual" className="px-3 py-2">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="visual">画面</TabsTrigger>
              <TabsTrigger value="audio">音频</TabsTrigger>
              <TabsTrigger value="ai">AI</TabsTrigger>
            </TabsList>
            <TabsContent value="visual" className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">画面风格</label>
                <select className="w-full px-3 py-1.5 rounded-lg border border-border text-xs bg-background">
                  <option>日系动漫</option>
                  <option>写实风</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">运镜</label>
                <select className="w-full px-3 py-1.5 rounded-lg border border-border text-xs bg-background">
                  <option>{currentShot.type}</option>
                  <option>远景</option>
                  <option>近景</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">时长 ({currentShot.duration}s)</label>
                <Slider defaultValue={[currentShot.duration]} max={10} step={0.5} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">转场效果</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['淡入', '推镜', '硬切'].map((t) => (
                    <button key={t} className="py-1.5 rounded border border-border text-[11px] hover:bg-accent">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="audio" className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">配音 - 苏瑶</label>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate('/voice')}>
                  <Mic className="w-3.5 h-3.5" /> 选择配音演员
                </Button>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">BGM 音量</label>
                <Slider defaultValue={[60]} max={100} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">音效</label>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate('/sfx')}>
                  + 添加音效
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="ai" className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => toast.info('AI 重新生成画面')}>
                <Sparkles className="w-3.5 h-3.5" /> 重新生成画面
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => toast.info('AI 续写对白')}>
                <Sparkles className="w-3.5 h-3.5" /> 续写对白
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/consistency')}>
                <Sparkles className="w-3.5 h-3.5" /> 角色一致性检查
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/edit')}>
                <Sparkles className="w-3.5 h-3.5" /> 智能剪辑
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Render dialog */}
      <Dialog open={renderOpen} onOpenChange={(open) => { if (!open && activeJob?.status !== 'done') { setRenderOpen(false); } }}>
        <DialogContent hideClose className="max-w-md">
          <DialogHeader>
            <DialogTitle>正在渲染视频...</DialogTitle>
          </DialogHeader>
          <div className="text-center py-4">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="text-5xl mb-3">
              ⚙️
            </motion.div>
            <div className="text-3xl font-bold mb-3">{renderProgress}%</div>
            <Progress value={renderProgress} className="mb-3" />
            <div className="text-xs text-muted-foreground">
              {renderStage === 'running' ? '正在准备...' : renderStage === 'composing' ? '正在合成画面...' : renderStage === 'encoding' ? '正在编码视频...' : renderStage === 'uploading' ? '正在上传...' : '排队中...'}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>渲染完成</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {activeJob?.thumbnail_url && (
              <img src={activeJob.thumbnail_url} alt="thumbnail" className="aspect-video rounded-xl w-full object-cover" />
            )}
            {!activeJob?.thumbnail_url && <div className="aspect-video rounded-xl scene-bg-hero" />}
            <div className="text-xs text-muted-foreground">
              {activeJob?.size_bytes ? `视频大小: ${(activeJob.size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
              {activeJob?.duration_ms ? ` · 时长 ${(activeJob.duration_ms / 1000).toFixed(0)}s` : ''}
              {activeJob?.resolution ? ` · ${activeJob.resolution}` : ''}
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" asChild>
                <a href={activeJob?.result_url ?? '#'} target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4" /> 下载到本地
                </a>
              </Button>
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(activeJob?.result_url ?? ''); toast.success('链接已复制'); }}>
                分享
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, RefreshCw, Pencil, Trash2, ArrowRight, Plus, Image as ImageIcon, Type, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store';
import { useShots, useDeleteShot } from '@/hooks/useScriptApi';
import { useStoryboardGenerate, useAiTask } from '@/hooks/useAiApi';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STYLES = [
  { key: 'anime', label: '日系动漫', icon: '🎌' },
  { key: 'realistic', label: '写实风', icon: '📸' },
  { key: 'guofeng', label: '国风水墨', icon: '🎋' },
  { key: 'comic', label: '漫画分格', icon: '📓' }
];

export default function Storyboard() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const projectId = useStore((s) => s.projectId);
  const projectName = useStore((s) => s.projectName);

  const { data: shots = [], isLoading } = useShots(projectId ?? undefined);
  const deleteShot = useDeleteShot(projectId ?? '');
  const storyboardGenerate = useStoryboardGenerate();

  const [styleKey, setStyleKey] = useState('anime');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const { data: activeTask } = useAiTask(activeTaskId ?? undefined);

  useEffect(() => {
    if (activeTask?.status === 'done') {
      toast.success('分镜生成完毕');
      setActiveTaskId(null); // eslint-disable-line react-hooks/set-state-in-effect
      setRegeneratingId(null); // eslint-disable-line react-hooks/set-state-in-effect
    } else if (activeTask?.status === 'failed') {
      toast.error(`生成失败: ${activeTask.error ?? '未知错误'}`);
      setActiveTaskId(null); // eslint-disable-line react-hooks/set-state-in-effect
      setRegeneratingId(null); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [activeTask?.status]);

  // eslint-disable-next-line
  function regenerateShot(id: string) {
    if (!projectId) return;
    setRegeneratingId(id);
    storyboardGenerate.mutate(
      { project_id: projectId, style: styleKey, shot_ids: [id] },
      {
        onSuccess: (data) => setActiveTaskId(data.task_id),
        onError: (err) => {
          setRegeneratingId(null);
          toast.error(`生成失败: ${(err as Error).message}`);
        },
      },
    );
  }

  function batchGenerate() {
    if (!projectId) {
      toast.error('请先选择一个项目');
      return;
    }
    storyboardGenerate.mutate(
      { project_id: projectId, style: styleKey, regenerate_all: true },
      {
        onSuccess: (data) => {
          setActiveTaskId(data.task_id);
          toast.info(`AI 正在以「${STYLES.find((s) => s.key === styleKey)?.label}」风格生成分镜...`);
        },
        onError: (err) => toast.error(`生成失败: ${(err as Error).message}`),
      },
    );
  }

  function handleDeleteShot(id: string) {
    confirm({
      title: '删除分镜',
      message: '确定删除此镜头? 此操作不可恢复。',
      okText: '删除',
      danger: true,
      onConfirm: () => deleteShot.mutate(id),
    });
  }

  const totalDuration = shots.reduce((s, x) => s + (x.duration_ms ?? 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <button onClick={() => navigate('/projects')} className="text-xs text-brand-600 hover:underline">
            {projectName} ›
          </button>
          <h1 className="text-xl font-bold mt-1">AI 生成分镜</h1>
          <p className="text-xs text-muted-foreground mt-1">共 {shots.length} 个分镜 · 总时长 {Math.round(totalDuration / 1000)} 秒</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/script')}>
            ‹ 返回剧本
          </Button>
          <Button onClick={() => navigate('/video')}>
            下一步: 生成视频 <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Style picker */}
      <Card className="p-4 mb-4">
        <div className="text-xs text-muted-foreground mb-3">画面风格</div>
        <div className="flex items-center gap-2 flex-wrap">
          {STYLES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStyleKey(s.key)}
              className={cn(
                'px-3 py-2 rounded-xl border-2 text-sm flex items-center gap-2 transition',
                styleKey === s.key ? 'border-brand-500 bg-brand-50/30' : 'border-border hover:border-muted-foreground/30'
              )}
            >
              <span className="text-lg">{s.icon}</span>
              {s.label}
            </button>
          ))}
          <Button className="ml-auto" onClick={batchGenerate} disabled={storyboardGenerate.isPending || !!activeTaskId}>
            {activeTaskId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {activeTaskId ? '生成中...' : '一键重新生成全部'}
          </Button>
        </div>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Shot grid */}
      <div className="grid grid-cols-3 gap-4">
        {shots.map((shot, idx) => (
          <motion.div
            key={shot.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
          >
            <Card className="overflow-hidden group">
              <div className={cn('aspect-video relative', shot.bg_style ?? 'bg-gradient-to-br from-slate-100 to-slate-200')}>
                {shot.image_url && <img src={shot.image_url} alt={shot.title ?? ''} className="absolute inset-0 w-full h-full object-cover" />}
                {regeneratingId === shot.id && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs">
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> 生成中...
                  </div>
                )}
                <Badge className="absolute top-2 left-2 backdrop-blur bg-black/40 text-white">
                  {shot.num ?? `#${idx + 1}`} · {shot.shot_type ?? '全景'}
                </Badge>
                <Badge variant="gray" className="absolute top-2 right-2 backdrop-blur bg-black/40 text-white">
                  {Math.round((shot.duration_ms ?? 0) / 1000)}s
                </Badge>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex gap-1">
                    <Button size="icon" variant="secondary" className="size-9" onClick={() => regenerateShot(shot.id)}>
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="secondary" className="size-9" onClick={() => toast.info(`编辑镜头`)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="destructive" className="size-9" onClick={() => handleDeleteShot(shot.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <div className="text-sm font-semibold truncate">{shot.title ?? '未命名镜头'}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{shot.dialog}</div>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  {shot.image_url && (
                    <>
                      <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> AI 生成</span>
                      <span>·</span>
                    </>
                  )}
                  <span className="flex items-center gap-1"><Type className="w-3 h-3" /> 含字幕</span>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
        <motion.button
          whileHover={{ scale: 1.02 }}
          className="aspect-video rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:border-brand-400 hover:text-brand-600 transition min-h-[200px]"
          onClick={() => toast.info('插入空分镜')}
        >
          <Plus className="w-8 h-8 mb-2" />
          <span className="text-xs">添加分镜</span>
        </motion.button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Send, Clock, Loader2, ImagePlus, Clapperboard } from 'lucide-react';
import { useShots, useUpdateShot, useOptimizeShot } from '@/hooks/useScriptApi';
import { isDemoCanvasProjectId } from '@/pages/Canvas/demoCanvasData';
import { DemoWorkbenchNotice } from '@/pages/Canvas/workbench/DemoWorkbenchNotice';
import { AiOptimizeError } from '@/lib/api/ai';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  shotId: string;
}

export function StoryboardCardEditor({ projectId, shotId }: Props) {
  const { data: shots, isLoading } = useShots(projectId);
  const optimize = useOptimizeShot(projectId);
  const update = useUpdateShot(projectId);
  const demoMode = isDemoCanvasProjectId(projectId);
  const [dialogInstruction, setDialogInstruction] = useState('');
  const [imageInstruction, setImageInstruction] = useState('');
  const [durationOverride, setDurationOverride] = useState<string | null>(null);
  const dialogInputRef = useRef<HTMLInputElement>(null);

  const shot = useMemo(() => shots?.find((s) => s.id === shotId), [shots, shotId]);
  const currentDurationSec = shot ? (shot.duration_ms / 1000).toString() : '';
  const durationDisplay = durationOverride ?? currentDurationSec;

  useEffect(() => { dialogInputRef.current?.focus(); }, []);

  const toastError = (e: unknown, fallback: string) => {
    if (e instanceof AiOptimizeError && e.code === 'IMAGE_QUOTA_EXCEEDED') {
      toast.error(e.message || '本月图像额度已用完,下月恢复');
    } else {
      toast.error((e as Error).message || fallback);
    }
  };

  const submitDialog = async () => {
    const text = dialogInstruction.trim();
    if (!text || optimize.isPending || !shot) return;
    try {
      await optimize.mutateAsync({ shot_id: shotId, instruction: text, mode: 'text' });
      setDialogInstruction('');
      toast.success('已改对白');
    } catch (e) {
      toastError(e, '改对白失败');
    }
  };

  const submitImage = async () => {
    if (optimize.isPending || !shot) return;
    const hint = imageInstruction.trim() || '保持当前画面风格,贴合对白';
    try {
      await optimize.mutateAsync({ shot_id: shotId, instruction: hint, mode: 'image' });
      setImageInstruction('');
      toast.success('已重画这一镜');
    } catch (e) {
      toastError(e, '重画失败');
    }
  };

  const submitDuration = async () => {
    if (!shot || update.isPending) return;
    const sec = parseFloat(durationDisplay);
    if (isNaN(sec) || sec <= 0) return;
    const ms = Math.round(sec * 1000);
    if (ms === shot.duration_ms) return;
    try {
      await update.mutateAsync({ shotId, input: { duration_ms: ms } });
      setDurationOverride(null);
      toast.success('已改时长');
    } catch (e) {
      toast.error((e as Error).message || '改时长失败');
    }
  };

  const canSendDialog = !!dialogInstruction.trim() && !optimize.isPending && !!shot;
  const parsedSec = parseFloat(durationDisplay);
  const durationChanged =
    !!shot && !isNaN(parsedSec) && parsedSec > 0 && Math.round(parsedSec * 1000) !== shot.duration_ms;
  const canSaveDuration = durationChanged && !update.isPending;
  const showDemoPreview = demoMode && !!shot && !shot.image_url;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-[26px] bg-teal-500/[0.08] ring-1 ring-teal-500/18">
        {isLoading ? (
          <p className="px-4 py-4 text-[12px] text-muted-foreground">载入中…</p>
        ) : !shot ? (
          <p className="px-4 py-4 text-[12px] text-amber-600 dark:text-amber-400">分镜不存在(可能已被删除)。</p>
        ) : (
          <>
            <div className="relative aspect-[1.9/1] w-full overflow-hidden bg-gradient-to-br from-slate-700 via-slate-900 to-teal-950">
              {shot.image_url ? (
                <img src={shot.image_url} alt={shot.title ?? ''} className="h-full w-full object-cover" />
              ) : showDemoPreview ? (
                <div className="relative flex h-full w-full items-end overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.2),transparent_42%),linear-gradient(145deg,rgba(15,23,42,0.2),rgba(15,23,42,0.75))]" />
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/65 via-black/18 to-transparent" />
                  <div
                    data-testid="demo-storyboard-preview"
                    className="relative z-[1] m-4 max-w-[82%] rounded-[18px] border border-white/10 bg-black/24 px-3.5 py-3 text-white/92 backdrop-blur-sm"
                  >
                    <div className="text-[10px] font-medium tracking-[0.12em] text-white/58 uppercase">Shot Preview</div>
                    <div className="mt-1 text-[14px] font-semibold leading-5 text-white">
                      {shot.title || `镜头 ${shot.order_index + 1}`}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-white/72">
                      {shot.dialog || '(暂无对白)'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-white/45">
                  等待生成
                </div>
              )}
              <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                {!demoMode && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-teal-500/12 px-2 py-1 text-[10px] font-semibold text-teal-100">
                    <Clapperboard className="h-3 w-3" />
                    分镜
                  </span>
                )}
                {!demoMode && (
                  <span className="rounded-md bg-black/40 px-2 py-1 text-[10px] font-medium text-white/85">
                    镜头 {shot.order_index + 1}
                  </span>
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
            </div>
            {!demoMode && (
              <div className="px-4 py-4">
                <div className="text-[15px] font-semibold text-foreground">
                  {shot.title || `镜头 ${shot.order_index + 1}`}
                </div>
                <p className="mt-2 line-clamp-3 text-[12px] leading-6 text-muted-foreground">
                  {shot.dialog || '(暂无对白)'}
                </p>
              </div>
            )}
            {demoMode && (
              <div className="border-t border-teal-500/14 px-4 py-3.5">
                <DemoWorkbenchNotice
                  workflow="对白、时长和重画这条连续工作流"
                  note="真实项目里会先改对白和节奏，再决定是不是要重画这一镜。"
                  surface="embedded"
                />
              </div>
            )}
          </>
        )}
      </div>

      {!demoMode ? (
        <div className="rounded-[20px] bg-card/16 px-4 py-4 ring-1 ring-border/38">
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium text-muted-foreground">继续调整这一镜</div>
                <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
                  先改对白和节奏，再决定是否要重画。
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">改对白</div>
                <div className={cn(
                  'flex items-center gap-2 rounded-2xl bg-background/72 px-3 py-2.5 ring-1 ring-border/55 transition',
                  'focus-within:ring-2 focus-within:ring-primary/18',
                )}>
                  <input
                    ref={dialogInputRef}
                    className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
                    placeholder="比如:短一点、口语化…"
                    value={dialogInstruction}
                    onChange={(e) => setDialogInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submitDialog(); }
                    }}
                    disabled={optimize.isPending || !shot}
                  />
                  <button
                    type="button"
                    onClick={submitDialog}
                    disabled={!canSendDialog}
                    className="h-6 w-6 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition disabled:opacity-40"
                    aria-label="发送"
                  >
                    <Send className="h-3 w-3" />
                  </button>
                </div>
                {optimize.isPending && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    AI 正在改对白…
                  </p>
                )}
              </div>

              <div className="lg:border-l lg:border-border/45 lg:pl-4">
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">改时长(秒)</div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-1.5 rounded-2xl bg-background/72 px-3 py-2.5 ring-1 ring-border/55 transition focus-within:ring-2 focus-within:ring-primary/18">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <input
                      type="number"
                      min="0.5"
                      max="60"
                      step="0.5"
                      className="flex-1 bg-transparent text-[13px] outline-none disabled:opacity-60"
                      value={durationDisplay}
                      onChange={(e) => setDurationOverride(e.target.value)}
                      disabled={update.isPending || !shot}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={submitDuration}
                    disabled={!canSaveDuration}
                    className="h-9 rounded-xl bg-primary px-3 text-[12px] font-medium text-primary-foreground transition disabled:opacity-40"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-border/35 pt-4">
              <div className="mb-2 text-[11px] font-medium text-muted-foreground">需要重画时再补一句</div>
              <div className={cn(
                'flex items-center gap-2 rounded-2xl bg-background/72 px-3 py-2.5 ring-1 ring-border/55 transition',
                'focus-within:ring-2 focus-within:ring-primary/18',
              )}>
                <input
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
                  placeholder="画面描述(可选)…"
                  value={imageInstruction}
                  onChange={(e) => setImageInstruction(e.target.value)}
                  disabled={optimize.isPending || !shot}
                />
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={submitImage}
                  disabled={optimize.isPending || !shot}
                  className="inline-flex h-9 min-w-[7rem] items-center justify-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-medium text-primary-foreground transition disabled:opacity-50"
                >
                  {optimize.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      AI 正在重画…
                    </>
                  ) : (
                    <>
                      <ImagePlus className="h-3.5 w-3.5" />
                      重画
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        </div>
      ) : null}
    </div>
  );
}

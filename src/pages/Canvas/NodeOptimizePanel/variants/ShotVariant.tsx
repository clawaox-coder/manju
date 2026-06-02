import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Send, Clock, Loader2 } from 'lucide-react';
import { useShots, useUpdateShot, useOptimizeShot } from '@/hooks/useScriptApi';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  shotId: string;
}

export function ShotVariant({ projectId, shotId }: Props) {
  const { data: shots, isLoading } = useShots(projectId);
  const optimize = useOptimizeShot(projectId);
  const update = useUpdateShot(projectId);
  const [dialogInstruction, setDialogInstruction] = useState('');
  // 外部 → 本地编辑值用 override 模式:null 时显示外部值,用户改动时持有覆盖,
  // 保存成功后置 null 让显示回归外部值。避免 effect 内 setState。
  const [durationOverride, setDurationOverride] = useState<string | null>(null);
  const dialogInputRef = useRef<HTMLInputElement>(null);

  const shot = useMemo(() => shots?.find((s) => s.id === shotId), [shots, shotId]);
  const currentDurationSec = shot ? (shot.duration_ms / 1000).toString() : '';
  const durationDisplay = durationOverride ?? currentDurationSec;

  useEffect(() => { dialogInputRef.current?.focus(); }, []);

  const submitDialog = async () => {
    const text = dialogInstruction.trim();
    if (!text || optimize.isPending || !shot) return;
    try {
      await optimize.mutateAsync({ shot_id: shotId, instruction: text, mode: 'text' });
      setDialogInstruction('');
      toast.success('已改对白');
    } catch (e) {
      toast.error((e as Error).message || '改对白失败');
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

  return (
    <div className="flex flex-col">
      {/* 头部:缩略图 + 当前对白 */}
      <div className="px-3.5 py-3 border-b border-border space-y-2">
        {isLoading ? (
          <p className="text-[12px] text-muted-foreground">载入中…</p>
        ) : !shot ? (
          <p className="text-[12px] text-amber-600 dark:text-amber-400">分镜不存在(可能已被删除)。</p>
        ) : (
          <>
            <div className="aspect-video w-full bg-muted rounded-lg overflow-hidden border border-border">
              {shot.image_url ? (
                <img src={shot.image_url} alt={shot.title ?? ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                  等待生成
                </div>
              )}
            </div>
            <div>
              <div className="text-[12px] font-medium truncate">
                {shot.title || `镜头 ${shot.order_index + 1}`}
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">
                {shot.dialog || '(暂无对白)'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* 改对白 */}
      <div className="px-3.5 py-3 border-b border-border">
        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">改对白</div>
        <div className={cn(
          'flex items-center gap-2 rounded-xl border bg-card px-3 py-2 transition',
          'border-border focus-within:border-primary/40',
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
            className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 transition shrink-0"
            aria-label="发送"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
        {optimize.isPending && (
          <p className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            AI 正在改对白…
          </p>
        )}
      </div>

      {/* 改时长 */}
      <div className="px-3.5 py-3 border-b border-border">
        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">改时长(秒)</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 rounded-xl border border-border bg-card px-3 py-2 focus-within:border-primary/40 transition">
            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
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
            className="px-3 h-8 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 transition"
          >
            保存
          </button>
        </div>
      </div>

      {/* 重画(后端无图像模型,二期)*/}
      <div className="px-3.5 py-3">
        <p className="text-[11px] text-muted-foreground italic">
          重画这一镜:即将上线(需图像模型,二期)
        </p>
      </div>
    </div>
  );
}

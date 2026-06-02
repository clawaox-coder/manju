import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';
import { useScript, useRewriteScene } from '@/hooks/useScriptApi';
import { splitScenes } from '@/pages/Canvas/sceneSplit';
import { AiOptimizeError } from '@/lib/api/ai';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  sceneIndex: number;
  /** 完成一次成功重写后,父组件可选择关闭面板(本期保留打开供继续微调,故不调)。 */
  onDone?: () => void;
}

const PREVIEW_MAX = 80;

export function ScriptSceneVariant({ projectId, sceneIndex }: Props) {
  const { data: script, isLoading: scriptLoading } = useScript(projectId);
  const rewrite = useRewriteScene(projectId);
  const [instruction, setInstruction] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const scenes = useMemo(() => (script ? splitScenes(script.content) : []), [script]);
  const scene = scenes[sceneIndex];

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async () => {
    const text = instruction.trim();
    if (!text || rewrite.isPending || !scene) return;
    try {
      await rewrite.mutateAsync({ scene_index: sceneIndex, instruction: text });
      setInstruction('');
      toast.success('已重写本场');
    } catch (e) {
      if (e instanceof AiOptimizeError && e.status === 409) {
        toast.error('剧本已被改动,已刷新最新版本,请重试');
        // hook 的 onError 已 invalidate,useScript 会重取拿到新 version_no
      } else {
        toast.error((e as Error).message || '重写失败');
      }
    }
  };

  const canSend = !!instruction.trim() && !rewrite.isPending && !!scene;

  return (
    <div className="flex flex-col">
      {/* 头部:当前场预览 */}
      <div className="px-3.5 py-3 border-b border-border">
        {scriptLoading ? (
          <p className="text-[12px] text-muted-foreground">载入中…</p>
        ) : !scene ? (
          <p className="text-[12px] text-amber-600 dark:text-amber-400">
            该场不存在(可能已被外部改动)。
          </p>
        ) : (
          <>
            <div className="text-[12px] font-medium text-foreground mb-1 truncate">{scene.title}</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-3">
              {scene.content.slice(0, PREVIEW_MAX)}
              {scene.content.length > PREVIEW_MAX ? '…' : ''}
            </p>
          </>
        )}
      </div>

      {/* 输入 + 发送 */}
      <div className="px-3.5 py-3">
        <div className={cn(
          'flex items-center gap-2 rounded-xl border bg-card px-3 py-2 transition',
          'border-border focus-within:border-primary/40',
        )}>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
            placeholder="描述你想要的重写方向…"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); }
            }}
            disabled={rewrite.isPending || !scene}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 transition shrink-0"
            aria-label="发送"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
        {rewrite.isPending && (
          <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            AI 正在重写本场…
          </p>
        )}
      </div>
    </div>
  );
}

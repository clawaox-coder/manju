import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Send, Loader2 } from 'lucide-react';
import { useScript, useRewriteScene } from '@/hooks/useScriptApi';
import { isDemoCanvasProjectId } from '@/pages/Canvas/demoCanvasData';
import { splitScenes } from '@/pages/Canvas/sceneSplit';
import { DemoWorkbenchNotice } from '@/pages/Canvas/workbench/DemoWorkbenchNotice';
import { AiOptimizeError } from '@/lib/api/ai';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  sceneIndex: number;
  onDone?: () => void;
}

const PREVIEW_MAX = 80;

export function ScriptSceneEditor({ projectId, sceneIndex }: Props) {
  const { data: script, isLoading: scriptLoading } = useScript(projectId);
  const rewrite = useRewriteScene(projectId);
  const demoMode = isDemoCanvasProjectId(projectId);
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
      } else {
        toast.error((e as Error).message || '重写失败');
      }
    }
  };

  const canSend = !!instruction.trim() && !rewrite.isPending && !!scene;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-[22px] bg-sky-500/[0.05] ring-1 ring-sky-500/10">
        {scriptLoading ? (
          <p className="px-4 py-4 text-[12px] text-muted-foreground">载入中…</p>
        ) : !scene ? (
          <p className="px-4 py-4 text-[12px] text-amber-600 dark:text-amber-400">
            该场不存在(可能已被外部改动)。
          </p>
        ) : (
          <>
            <div className="bg-gradient-to-br from-sky-500/10 via-background/38 to-background/18 px-4 py-4">
              <div className="flex items-center gap-2">
                {!demoMode && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-semibold text-sky-600 dark:text-sky-300">
                    <FileText className="h-3 w-3" />
                    剧本
                  </span>
                )}
                {!demoMode && (
                  <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                    当前场次
                  </span>
                )}
              </div>
              <div className="mt-3 text-[15px] font-semibold text-foreground">{scene.title}</div>
              {!demoMode && (
                <p className="mt-2 text-[12px] leading-6 text-muted-foreground">
                  先判断这一场是否成立，再决定怎么重写它。
                </p>
              )}
            </div>
            <div className="px-4 pb-4">
              {demoMode ? (
                <div
                  data-testid="demo-script-preview"
                  className="border-l border-sky-500/18 pl-3 text-[12px] leading-6 text-foreground/78 whitespace-pre-wrap"
                >
                  {scene.content.slice(0, PREVIEW_MAX)}
                  {scene.content.length > PREVIEW_MAX ? '…' : ''}
                </div>
              ) : (
                <div className="rounded-[16px] bg-background/46 px-4 py-4 text-[12px] leading-6 text-muted-foreground whitespace-pre-wrap ring-1 ring-border/28">
                  {scene.content.slice(0, PREVIEW_MAX)}
                  {scene.content.length > PREVIEW_MAX ? '…' : ''}
                </div>
              )}
            </div>
            {demoMode && (
              <div className="border-t border-sky-500/10 px-4 py-3">
                <DemoWorkbenchNotice
                  workflow="剧本改写"
                  note="到真实项目里，这里会像给编剧一句明确反馈那样继续改这一场。"
                  surface="embedded"
                />
              </div>
            )}
          </>
        )}
      </div>

      {!demoMode ? (
        <div className="rounded-[16px] bg-card/12 px-4 py-3">
          <>
            <div className="mb-2 text-[11px] font-medium text-muted-foreground">继续改这一场</div>
            <p className="mb-3 text-[12px] leading-6 text-muted-foreground">
              像给编剧一句明确反馈那样输入。
            </p>
            <div className={cn(
              'flex items-center gap-2 rounded-2xl bg-background/72 px-3 py-2.5 ring-1 ring-border/55 transition',
              'focus-within:ring-2 focus-within:ring-primary/18',
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
          </>
        </div>
      ) : null}
    </div>
  );
}

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Wand2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { storyboardGenerate, getAiTask } from '@/lib/api/ai';
import { useConfirm } from '@/hooks/useConfirm';

interface Props {
  projectId: string;
}

const AI_TASK_TERMINAL = ['done', 'succeeded', 'failed', 'error'];
const POLL_MS = 2000;
const TIMEOUT_MS = 90000;

async function pollUntilTerminal(taskId: string): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > TIMEOUT_MS) return false;
    const t = await getAiTask(taskId);
    if (AI_TASK_TERMINAL.includes(t.status)) {
      return t.status === 'done' || t.status === 'succeeded';
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export function AiGenVariant({ projectId }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [style, setStyle] = useState('');
  const [running, setRunning] = useState(false);
  const [withImages, setWithImages] = useState(true);

  const doGenerate = async () => {
    setRunning(true);
    try {
      const res = await storyboardGenerate({
        project_id: projectId,
        style: style.trim() || 'default',
        regenerate_all: true,
        with_images: withImages,
      });
      const ok = await pollUntilTerminal(res.task_id);
      if (!ok) throw new Error('生成失败或超时');
      qc.invalidateQueries({ queryKey: ['shots', projectId] });
      toast.success('已重新生成全部分镜');
    } catch (e) {
      toast.error((e as Error).message || '生成失败');
    } finally {
      setRunning(false);
    }
  };

  const askThenRun = () => {
    if (running) return;
    confirm({
      title: '重新生成全部分镜?',
      message: withImages
        ? '这会替换当前全部分镜的内容，并额外消耗约 3-6 张图像配额。'
        : '这会替换当前全部分镜的内容。',
      okText: '生成',
      danger: true,
      onConfirm: () => { void doGenerate(); },
    });
  };

  return (
    <div className="flex flex-col">
      <div className="px-3.5 py-3 border-b border-border">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          整体动作:重新生成全部分镜(影响每一镜),执行前请二次确认。
        </p>
      </div>

      <div className="px-3.5 py-3 border-b border-border">
        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">风格(可选)</div>
        <div className="rounded-xl border border-border bg-card px-3 py-2 focus-within:border-primary/40 transition">
          <input
            type="text"
            className="w-full bg-transparent text-[13px] outline-none disabled:opacity-60"
            placeholder="比如:日系动漫 / 电影感 / 黑白漫画(留空走 default)"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            disabled={running}
          />
        </div>
      </div>

      <div className="px-3.5 py-3 border-b border-border">
        <label className="flex items-start gap-2 text-[12px] text-foreground cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={withImages}
            onChange={(e) => setWithImages(e.target.checked)}
            disabled={running}
          />
          <span>
            顺带为每镜生成画面
            <span className="block text-[11px] text-muted-foreground mt-1">
              开启后会按镜头数量消耗图像配额，通常约 3-6 张。
            </span>
          </span>
        </label>
      </div>

      <div className="px-3.5 py-3">
        <button
          type="button"
          onClick={askThenRun}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-primary text-primary-foreground text-[13px] font-medium disabled:opacity-50 transition"
        >
          {running ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              正在重生成…
            </>
          ) : (
            <>
              <Wand2 className="w-3.5 h-3.5" />
              重新生成全部分镜
            </>
          )}
        </button>
      </div>
    </div>
  );
}

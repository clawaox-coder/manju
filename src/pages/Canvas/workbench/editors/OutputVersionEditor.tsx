import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Film, Download, ExternalLink } from 'lucide-react';
import { createRender, getRender } from '@/lib/api/render';
import { useConfirm } from '@/hooks/useConfirm';

interface Props {
  projectId: string;
}

const RENDER_TERMINAL = ['done', 'failed', 'cancelled'];
const POLL_MS = 2000;
const TIMEOUT_MS = 120000;
const RESOLUTIONS = ['720p', '1080p', '2k'] as const;
const FORMATS = ['mp4', 'mov', 'webm'] as const;

type Resolution = (typeof RESOLUTIONS)[number];
type Format = (typeof FORMATS)[number];

async function pollUntilTerminal(jobId: string): Promise<{ ok: boolean; url: string | null }> {
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > TIMEOUT_MS) return { ok: false, url: null };
    const job = await getRender(jobId);
    if (RENDER_TERMINAL.includes(job.status)) {
      return { ok: job.status === 'done', url: job.result_url };
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export function OutputVersionEditor({ projectId }: Props) {
  const confirm = useConfirm();
  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [format, setFormat] = useState<Format>('mp4');
  const [running, setRunning] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const doRender = async () => {
    setRunning(true);
    setResultUrl(null);
    try {
      const job = await createRender(
        { project_id: projectId, resolution, format },
        `render-${projectId}-${Date.now()}`,
      );
      const result = await pollUntilTerminal(job.job_id);
      if (!result.ok) throw new Error('渲染失败或超时');
      setResultUrl(result.url);
      toast.success('渲染完成');
    } catch (e) {
      toast.error((e as Error).message || '渲染失败');
    } finally {
      setRunning(false);
    }
  };

  const askThenRun = () => {
    if (running) return;
    confirm({
      title: '渲染整片?',
      message: '渲染整片可能耗时数十秒,确认开始吗?',
      okText: '渲染',
      danger: false,
      onConfirm: () => { void doRender(); },
    });
  };

  return (
    <div className="flex flex-col">
      <div className="px-3.5 py-3 border-b border-border">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          整体动作:渲染整片(可能耗时数十秒),执行前请二次确认。
        </p>
      </div>

      <div className="px-3.5 py-3 border-b border-border">
        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">分辨率</div>
        <div className="flex gap-1">
          {RESOLUTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResolution(r)}
              disabled={running}
              className={`flex-1 h-8 rounded-lg text-[12px] font-medium transition ${
                resolution === r
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-foreground/70 hover:bg-accent'
              } disabled:opacity-50`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3.5 py-3 border-b border-border">
        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">格式</div>
        <div className="flex gap-1">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              disabled={running}
              className={`flex-1 h-8 rounded-lg text-[12px] font-medium transition ${
                format === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-foreground/70 hover:bg-accent'
              } disabled:opacity-50`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3.5 py-3 border-b border-border">
        <button
          type="button"
          onClick={askThenRun}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-primary text-primary-foreground text-[13px] font-medium disabled:opacity-50 transition"
        >
          {running ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              正在渲染…
            </>
          ) : (
            <>
              <Film className="w-3.5 h-3.5" />
              渲染整片
            </>
          )}
        </button>
      </div>

      {resultUrl && (
        <div className="px-3.5 py-3 space-y-2">
          <div className="text-[11px] font-medium text-muted-foreground">完成</div>
          <div className="flex gap-2">
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border bg-card text-[12px] hover:bg-accent transition"
            >
              <ExternalLink className="w-3 h-3" />
              预览
            </a>
            <a
              href={resultUrl}
              download
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border bg-card text-[12px] hover:bg-accent transition"
            >
              <Download className="w-3 h-3" />
              下载
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

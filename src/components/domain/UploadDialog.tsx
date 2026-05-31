import { useCallback, useRef, useState } from 'react';
import { Upload, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSignUpload, useCreateAsset } from '@/hooks/useAssetApi';
import type { AssetType } from '@/lib/api/assets';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetType: AssetType;
  accept?: string;
  title?: string;
}

type Stage = 'idle' | 'signing' | 'uploading' | 'creating' | 'done';

export function UploadDialog({ open, onOpenChange, assetType, accept, title }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const signUpload = useSignUpload();
  const createAsset = useCreateAsset();

  const reset = useCallback(() => {
    setFile(null);
    setStage('idle');
    setProgress(0);
  }, []);

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function handleFile(f: File) {
    setFile(f);
    setStage('idle');
    setProgress(0);
  }

  async function startUpload() {
    if (!file) return;
    try {
      setStage('signing');
      const sign = await signUpload.mutateAsync({
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        purpose: assetType,
      });

      setStage('uploading');
      await uploadWithProgress(sign.upload_url, sign.method, sign.headers, file);

      setStage('creating');
      await createAsset.mutateAsync({
        type: assetType,
        name: file.name.replace(/\.[^.]+$/, ''),
        file_url: sign.file_url,
      });

      setStage('done');
      toast.success('上传成功');
      setTimeout(() => handleClose(false), 1000);
    } catch (err) {
      toast.error(`上传失败: ${(err as Error).message}`);
      setStage('idle');
    }
  }

  async function uploadWithProgress(url: string, method: string, headers: Record<string, string>, body: File) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('网络错误'));
      xhr.send(body);
    });
  }

  const stageLabel = { idle: '', signing: '获取上传凭证...', uploading: '上传中...', creating: '注册资产...', done: '完成' };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? `上传${assetType}`}</DialogTitle>
        </DialogHeader>

        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition',
              dragOver ? 'border-foreground bg-accent' : 'border-border hover:border-foreground/30'
            )}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <div className="text-sm font-medium">拖拽文件到此处, 或点击选择</div>
            <div className="text-xs text-muted-foreground mt-1">{accept ?? '支持常见格式'}</div>
            <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-xs font-mono">
                {file.name.split('.').pop()?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
              </div>
              {stage === 'idle' && (
                <Button variant="ghost" size="icon" className="size-8" onClick={reset}>
                  <X className="w-4 h-4" />
                </Button>
              )}
              {stage === 'done' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            </div>

            {stage !== 'idle' && stage !== 'done' && (
              <div>
                <Progress value={stage === 'uploading' ? progress : stage === 'creating' ? 100 : 10} className="mb-2" />
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> {stageLabel[stage]}
                </div>
              </div>
            )}

            {stage === 'idle' && (
              <Button className="w-full" onClick={startUpload}>
                <Upload className="w-4 h-4" /> 开始上传
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

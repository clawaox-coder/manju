import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';
import { useAsset, useUpdateAsset, useOptimizeCharacter } from '@/hooks/useAssetApi';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  assetId: string;
}

export function CharacterVariant({ projectId, assetId }: Props) {
  const { data: asset, isLoading } = useAsset('character', assetId);
  const optimize = useOptimizeCharacter(projectId);
  const update = useUpdateAsset();
  const [instruction, setInstruction] = useState('');
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const instructionInputRef = useRef<HTMLInputElement>(null);

  const currentName = asset?.name ?? '';
  const nameDisplay = nameOverride ?? currentName;

  useEffect(() => { instructionInputRef.current?.focus(); }, []);

  const submitOptimize = async () => {
    const text = instruction.trim();
    if (!text || optimize.isPending || !asset) return;
    try {
      await optimize.mutateAsync({ asset_id: assetId, instruction: text });
      setInstruction('');
      toast.success('已改设定');
    } catch (e) {
      toast.error((e as Error).message || '优化失败');
    }
  };

  const submitName = async () => {
    if (!asset || update.isPending) return;
    const next = nameDisplay.trim();
    if (!next || next === asset.name) return;
    try {
      await update.mutateAsync({ type: 'character', id: assetId, input: { name: next } });
      setNameOverride(null);
      toast.success('已改名');
    } catch (e) {
      toast.error((e as Error).message || '改名失败');
    }
  };

  const canSendOptimize = !!instruction.trim() && !optimize.isPending && !!asset;
  const nameChanged = !!asset && nameDisplay.trim().length > 0 && nameDisplay.trim() !== asset.name;
  const canSaveName = nameChanged && !update.isPending;

  return (
    <div className="flex flex-col">
      {/* 头部:头像 + 名称 + 描述 */}
      <div className="px-3.5 py-3 border-b border-border">
        {isLoading ? (
          <p className="text-[12px] text-muted-foreground">载入中…</p>
        ) : !asset ? (
          <p className="text-[12px] text-amber-600 dark:text-amber-400">角色不存在(可能已被删除)。</p>
        ) : (
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-foreground/10 flex items-center justify-center text-foreground text-base font-bold overflow-hidden shrink-0">
              {asset.thumbnail_url || asset.file_url
                ? <img src={asset.thumbnail_url ?? asset.file_url ?? ''} alt={asset.name} className="w-full h-full object-cover" />
                : (asset.avatar || asset.name[0] || '角')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium truncate">{asset.name}</div>
              <p className="text-[11px] text-muted-foreground line-clamp-3 mt-0.5">
                {asset.description || '(暂无设定)'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* AI 改设定 */}
      <div className="px-3.5 py-3 border-b border-border">
        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">AI 改设定</div>
        <div className={cn(
          'flex items-center gap-2 rounded-xl border bg-card px-3 py-2 transition',
          'border-border focus-within:border-primary/40',
        )}>
          <input
            ref={instructionInputRef}
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
            placeholder="比如:更冷酷、加身世背景…"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submitOptimize(); }
            }}
            disabled={optimize.isPending || !asset}
          />
          <button
            type="button"
            onClick={submitOptimize}
            disabled={!canSendOptimize}
            className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 transition shrink-0"
            aria-label="发送"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
        {optimize.isPending && (
          <p className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            AI 正在改设定…
          </p>
        )}
      </div>

      {/* 改名称 */}
      <div className="px-3.5 py-3">
        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">改名称</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl border border-border bg-card px-3 py-2 focus-within:border-primary/40 transition">
            <input
              type="text"
              maxLength={100}
              className="w-full bg-transparent text-[13px] outline-none disabled:opacity-60"
              value={nameDisplay}
              onChange={(e) => setNameOverride(e.target.value)}
              disabled={update.isPending || !asset}
            />
          </div>
          <button
            type="button"
            onClick={submitName}
            disabled={!canSaveName}
            className="px-3 h-8 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 transition"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

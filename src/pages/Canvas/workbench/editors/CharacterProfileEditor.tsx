import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Send, Loader2, ImagePlus } from 'lucide-react';
import { useAsset, useUpdateAsset, useOptimizeCharacter } from '@/hooks/useAssetApi';
import { isDemoCanvasProjectId } from '@/pages/Canvas/demoCanvasData';
import { DemoWorkbenchNotice } from '@/pages/Canvas/workbench/DemoWorkbenchNotice';
import { AiOptimizeError } from '@/lib/api/ai';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  assetId: string;
}

export function CharacterProfileEditor({ projectId, assetId }: Props) {
  const { data: asset, isLoading } = useAsset('character', assetId);
  const optimize = useOptimizeCharacter(projectId);
  const update = useUpdateAsset();
  const demoMode = isDemoCanvasProjectId(projectId);
  const [instruction, setInstruction] = useState('');
  const [avatarInstruction, setAvatarInstruction] = useState('');
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const instructionInputRef = useRef<HTMLInputElement>(null);

  const currentName = asset?.name ?? '';
  const nameDisplay = nameOverride ?? currentName;

  useEffect(() => { instructionInputRef.current?.focus(); }, []);

  const toastError = (e: unknown, fallback: string) => {
    if (e instanceof AiOptimizeError && e.code === 'IMAGE_QUOTA_EXCEEDED') {
      toast.error(e.message || '本月图像额度已用完,下月恢复');
    } else {
      toast.error((e as Error).message || fallback);
    }
  };

  const submitOptimize = async () => {
    const text = instruction.trim();
    if (!text || optimize.isPending || !asset) return;
    try {
      await optimize.mutateAsync({ asset_id: assetId, instruction: text });
      setInstruction('');
      toast.success('已改设定');
    } catch (e) {
      toastError(e, '优化失败');
    }
  };

  const submitAvatar = async () => {
    if (optimize.isPending || !asset) return;
    const hint = avatarInstruction.trim() || '保持当前角色设定';
    try {
      await optimize.mutateAsync({ asset_id: assetId, instruction: hint, generate_avatar: true });
      setAvatarInstruction('');
      toast.success('已生成新头像');
    } catch (e) {
      toastError(e, '生成头像失败');
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
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-[22px] bg-primary/[0.05] ring-1 ring-primary/10">
        {isLoading ? (
          <p className="px-4 py-4 text-[12px] text-muted-foreground">载入中…</p>
        ) : !asset ? (
          <p className="px-4 py-4 text-[12px] text-amber-600 dark:text-amber-400">角色不存在(可能已被删除)。</p>
        ) : (
          <>
            <div className="bg-gradient-to-br from-primary/8 via-background/38 to-background/18 px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-foreground/10 text-base font-bold text-foreground">
                  {asset.thumbnail_url || asset.file_url
                    ? <img src={asset.thumbnail_url ?? asset.file_url ?? ''} alt={asset.name} className="h-full w-full object-cover" />
                    : (asset.avatar || asset.name[0] || '角')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    {!demoMode && (
                      <span className="rounded-full border border-primary/15 bg-primary/6 px-2.5 py-1 text-[10px] font-medium text-primary">
                        角色卡
                      </span>
                    )}
                    {!demoMode && <div className="min-w-0 truncate text-[12px] font-medium">{asset.name}</div>}
                  </div>
                  <div className="text-[15px] font-semibold text-foreground">{asset.name}</div>
                  {!demoMode && (
                    <p className="mt-2 text-[12px] leading-6 text-muted-foreground">
                      先把角色设定和形象调整顺，再决定会不会影响分镜和配音。
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="px-4 pb-4">
              {demoMode ? (
                <p
                  data-testid="demo-character-description"
                  className="line-clamp-5 border-l border-primary/16 pl-3 text-[12px] leading-6 text-foreground/76"
                >
                  {asset.description || '(暂无设定)'}
                </p>
              ) : (
                <p className="line-clamp-5 rounded-[16px] bg-background/46 px-4 py-4 text-[12px] leading-6 text-muted-foreground ring-1 ring-border/28">
                  {asset.description || '(暂无设定)'}
                </p>
              )}
            </div>
            {demoMode && (
              <div className="border-t border-primary/10 px-4 py-3">
                <DemoWorkbenchNotice
                  workflow="改设定、改名称和生成头像这条角色工作流"
                  note="真实项目里会先把设定和名字调顺，需要时再补一句换形象。"
                  surface="embedded"
                />
              </div>
            )}
          </>
        )}
      </div>

      {!demoMode ? (
        <div className="rounded-[18px] bg-card/12 px-4 py-3.5 ring-1 ring-border/24">
          <>
            <div className="mb-3">
              <div className="text-[11px] font-medium text-muted-foreground">继续调整这个角色</div>
              <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
                先改设定和名字，需要时再补一句生成头像。
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
              <div>
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">改设定</div>
                <div className={cn(
                  'flex items-center gap-2 rounded-2xl bg-background/72 px-3 py-2.5 ring-1 ring-border/55 transition',
                  'focus-within:ring-2 focus-within:ring-primary/18',
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
                    className="h-6 w-6 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition disabled:opacity-40"
                    aria-label="发送"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
                {optimize.isPending && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    AI 正在改设定…
                  </p>
                )}
              </div>

              <div className="lg:border-l lg:border-border/45 lg:pl-4">
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">改名称</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-2xl bg-background/72 px-3 py-2.5 ring-1 ring-border/55 transition focus-within:ring-2 focus-within:ring-primary/18">
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
                    className="h-9 rounded-xl bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-40 transition"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-border/45 pt-4">
              <div className="mb-2 text-[11px] font-medium text-muted-foreground">需要换形象时再补一句</div>
              <div className={cn(
                'mb-3 flex items-center gap-2 rounded-2xl bg-background/72 px-3 py-2.5 ring-1 ring-border/55 transition',
                'focus-within:ring-2 focus-within:ring-primary/18',
              )}>
                <input
                  type="text"
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
                  placeholder="头像描述(可选)…"
                  value={avatarInstruction}
                  onChange={(e) => setAvatarInstruction(e.target.value)}
                  disabled={optimize.isPending || !asset}
                />
              </div>
              <button
                type="button"
                onClick={submitAvatar}
                disabled={optimize.isPending || !asset}
                className="inline-flex h-9 min-w-[7rem] items-center justify-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50 transition"
              >
                {optimize.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    AI 正在生成…
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-3.5 h-3.5" />
                    生成头像
                  </>
                )}
              </button>
            </div>
          </>
        </div>
      ) : null}
    </div>
  );
}

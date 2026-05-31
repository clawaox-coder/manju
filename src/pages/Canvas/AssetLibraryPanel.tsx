import { useState } from 'react';
import { Search, Users, Image as ImageIcon, Boxes, Music, Volume2, Loader2, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAssets } from '@/hooks/useAssetApi';
import type { AssetType } from '@/lib/api/assets';
import { cn } from '@/lib/utils';

interface AssetTab {
  type: AssetType;
  label: string;
  icon: LucideIcon;
}

const TABS: AssetTab[] = [
  { type: 'character', label: '角色', icon: Users },
  { type: 'scene', label: '场景', icon: ImageIcon },
  { type: 'prop', label: '道具', icon: Boxes },
  { type: 'music', label: '音乐', icon: Music },
  { type: 'sfx', label: '音效', icon: Volume2 },
];

interface AssetLibraryPanelProps {
  open: boolean;
  onClose: () => void;
  /** Called when a user picks an asset (e.g. to insert into the canvas). */
  onPick?: (assetId: string, name: string, type: AssetType) => void;
}

export function AssetLibraryPanel({ open, onClose, onPick }: AssetLibraryPanelProps) {
  const [tab, setTab] = useState<AssetType>('character');
  const [query, setQuery] = useState('');
  const { data, isLoading } = useAssets({ type: tab, q: query.trim() || undefined });
  const assets = data?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex flex-col w-[92vw] max-w-4xl h-[85vh] max-h-[85vh] gap-0 p-0 overflow-hidden bg-background/70 backdrop-blur-2xl border-border/60 shadow-2xl">
        <DialogHeader className="px-5 h-14 flex-row items-center border-b border-border">
          <DialogTitle className="text-base">资产库</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 px-3 py-2 border-b border-border flex-shrink-0 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => setTab(t.type)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors',
                  tab === t.type
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="px-3 py-2 border-b border-border flex-shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索资产..."
              className="w-full h-8 pl-8 pr-2 rounded-lg bg-muted/50 text-xs outline-none focus:bg-card border border-transparent focus:border-primary/30 transition-colors"
            />
          </div>
        </div>
        {/* PLACEHOLDER_GRID */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
              <span className="text-sm">还没有{TABS.find((t) => t.type === tab)?.label}资产</span>
              <span className="text-[11px] mt-1">在对话里让 AI 生成，会自动收进这里</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {assets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onPick?.(a.id, a.name, a.type)}
                  className="group text-left rounded-xl border border-border overflow-hidden hover:border-primary/40 transition-colors"
                >
                  <div className={cn('aspect-square flex items-center justify-center text-2xl', a.bg_style || 'bg-muted')}>
                    {a.thumbnail_url || a.file_url ? (
                      <img
                        src={a.thumbnail_url || a.file_url || ''}
                        alt={a.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{a.avatar || '🎭'}</span>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="text-xs font-medium truncate">{a.name}</div>
                    {a.description && (
                      <div className="text-[10px] text-muted-foreground truncate">{a.description}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SHORTCUT_GROUPS } from '@/hooks/useShortcuts';
import { Keyboard } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsOverlay({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <div className="flex items-center gap-2 mb-4">
          <Keyboard className="h-5 w-5" />
          <h2 className="font-bold text-base">键盘快捷键</h2>
        </div>
        <div className="grid grid-cols-3 gap-6">
          {SHORTCUT_GROUPS.map((g) => (
            <div key={g.cat}>
              <div className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{g.cat}</div>
              <div className="space-y-2">
                {g.items.map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs">{s.desc}</span>
                    <span className="flex gap-1">
                      {s.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-3 border-t border-border text-center text-[11px] text-muted-foreground">
          按 <kbd>Esc</kbd> 或点击外部关闭
        </div>
      </DialogContent>
    </Dialog>
  );
}

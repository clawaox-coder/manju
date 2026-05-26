import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ConfirmState {
  title: string;
  message: string;
  okText: string;
  danger: boolean;
  onConfirm: () => void;
}

const ConfirmContext = React.createContext<((opts: Omit<ConfirmState, 'open'>) => void) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<ConfirmState | null>(null);

  const confirm = React.useCallback((opts: Omit<ConfirmState, 'open'>) => {
    setState(opts);
    setOpen(true);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{state?.title}</DialogTitle>
            <DialogDescription>{state?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              variant={state?.danger ? 'destructive' : 'default'}
              onClick={() => {
                state?.onConfirm();
                setOpen(false);
              }}
            >
              {state?.okText ?? '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

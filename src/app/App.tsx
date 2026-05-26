import { Toaster } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConfirmProvider } from '@/hooks/useConfirm';
import { useTheme } from '@/hooks/useTheme';
import { AppRouter } from './router';
import { ErrorBoundary } from './ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function App() {
  useTheme();
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <ConfirmProvider>
            <AppRouter />
            <Toaster
              position="top-right"
              toastOptions={{
                classNames: {
                  toast: 'rounded-lg border border-border bg-card shadow-lg',
                  title: 'text-sm',
                  description: 'text-xs text-muted-foreground'
                }
              }}
            />
          </ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

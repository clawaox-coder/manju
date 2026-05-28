import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider } from '@/hooks/useConfirm';
import type { ReactElement, ReactNode } from 'react';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ConfirmProvider>{children}</ConfirmProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

export function renderWithProviders(ui: ReactElement, opts?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: createWrapper(), ...opts });
}

export { screen, waitFor, fireEvent } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

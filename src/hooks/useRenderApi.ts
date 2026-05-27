import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/render';
import type { CreateRenderInput, ListRenderParams } from '@/lib/api/render';

export function useRenderJobs(params: ListRenderParams = {}) {
  return useQuery({
    queryKey: ['renders', params],
    queryFn: () => api.listRenders(params),
  });
}

export function useRenderJob(id: string | undefined) {
  return useQuery({
    queryKey: ['render', id],
    queryFn: () => api.getRender(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return false;
      if (status === 'done' || status === 'failed' || status === 'cancelled') return false;
      return 2000;
    },
  });
}

export function useCreateRender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateRenderInput; idempotencyKey?: string }) =>
      api.createRender(input, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renders'] });
    },
  });
}

export function useCancelRender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelRender(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renders'] });
    },
  });
}

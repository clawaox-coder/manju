import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/scripts';
import type { CreateShotInput } from '@/lib/api/scripts';
import { rewriteScene, AiOptimizeError, type RewriteSceneInput } from '@/lib/api/ai';

export function useScript(projectId: string | undefined) {
  return useQuery({
    queryKey: ['script', projectId],
    queryFn: () => api.getScript(projectId!),
    enabled: !!projectId,
  });
}

export function useUpdateScript(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { content: string; expected_version_no: number }) =>
      api.updateScript(projectId, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['script', projectId] }); },
  });
}

// 单场重写(canvas-node-optimize-panel):精准改单场,409 时也失效以拿到新版本供重试。
export function useRewriteScene(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<RewriteSceneInput, 'project_id'>) =>
      rewriteScene({ project_id: projectId, ...input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['script', projectId] }); },
    onError: (err) => {
      if (err instanceof AiOptimizeError && err.status === 409) {
        qc.invalidateQueries({ queryKey: ['script', projectId] });
      }
    },
  });
}

export function useShots(projectId: string | undefined) {
  return useQuery({
    queryKey: ['shots', projectId],
    queryFn: () => api.listShots(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateShot(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShotInput) => api.createShot(projectId, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shots', projectId] }); },
  });
}

export function useUpdateShot(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shotId, input }: { shotId: string; input: Partial<CreateShotInput> }) =>
      api.updateShot(projectId, shotId, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shots', projectId] }); },
  });
}

export function useDeleteShot(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shotId: string) => api.deleteShot(projectId, shotId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shots', projectId] }); },
  });
}

export function useReorderShots(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: string[]) => api.reorderShots(projectId, order),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shots', projectId] }); },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/scripts';
import type { ScriptDTO, ShotDTO, CreateShotInput } from '@/lib/api/scripts';

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

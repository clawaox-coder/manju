import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/projects';
import type { ProjectDTO, ListProjectsParams, CreateProjectInput } from '@/lib/api/projects';
import type { Project } from '@/types';

export type { ProjectDTO };

function toProject(dto: ProjectDTO): Project {
  return {
    id: dto.id,
    name: dto.name,
    genre: dto.genre,
    status: dto.status,
    progress: dto.progress,
    version: dto.version,
    thumbnailUrl: dto.thumbnail_url,
    bgStyle: dto.bg_style,
    teamId: dto.team_id,
    ownerId: dto.owner_id,
    metadata: dto.metadata,
    deletedAt: dto.deleted_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function useProjects(params: ListProjectsParams = {}) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: async () => {
      const res = await api.listProjects(params);
      return { ...res, data: res.data.map(toProject) };
    },
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => toProject(await api.getProject(id!)),
    enabled: !!id,
  });
}

export function useDrafts() {
  return useQuery({
    queryKey: ['drafts'],
    queryFn: async () => {
      const res = await api.listDrafts();
      return { ...res, data: res.data.map(toProject) };
    },
  });
}

export function useShared() {
  return useQuery({
    queryKey: ['shared'],
    queryFn: async () => {
      const res = await api.listShared();
      return { ...res, data: res.data.map(toProject) };
    },
  });
}

export function useTrash() {
  return useQuery({
    queryKey: ['trash'],
    queryFn: async () => {
      const res = await api.listTrash();
      return { ...res, data: res.data.map(toProject) };
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['drafts'] });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; genre?: string | null } }) =>
      api.updateProject(id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); },
  });
}

export function useDuplicateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.duplicateProject(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['drafts'] });
      qc.invalidateQueries({ queryKey: ['trash'] });
    },
  });
}

export function useDeleteDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteDraft(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drafts'] });
      qc.invalidateQueries({ queryKey: ['trash'] });
    },
  });
}

export function useClearAllDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearAllDrafts(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drafts'] });
      qc.invalidateQueries({ queryKey: ['trash'] });
    },
  });
}

export function useLeaveShared() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.leaveShared(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shared'] }); },
  });
}

export function useRestoreFromTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restoreFromTrash(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trash'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function usePurgeFromTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.purgeFromTrash(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trash'] }); },
  });
}

export function useEmptyTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.emptyTrash(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trash'] }); },
  });
}

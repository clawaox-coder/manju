import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/assets';
import type { AssetDTO, AssetType, ListAssetsParams, CreateAssetInput } from '@/lib/api/assets';

export function useAssets(params: ListAssetsParams = {}) {
  return useQuery({
    queryKey: ['assets', params],
    queryFn: () => api.listAssets(params),
  });
}

export function useAsset(id: string | undefined) {
  return useQuery({
    queryKey: ['asset', id],
    queryFn: () => api.getAsset(id!),
    enabled: !!id,
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssetInput) => api.createAsset(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); },
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Omit<CreateAssetInput, 'type'>> }) =>
      api.updateAsset(id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteAsset(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); },
  });
}

export function useSignUpload() {
  return useMutation({
    mutationFn: (input: api.SignUploadInput) => api.signUpload(input),
  });
}

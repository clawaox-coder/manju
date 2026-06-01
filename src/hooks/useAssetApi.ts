import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/assets';
import type { ListAssetsParams, CreateAssetInput, AssetType } from '@/lib/api/assets';

export function useAssets(params: ListAssetsParams = {}) {
  return useQuery({
    queryKey: ['assets', params],
    queryFn: () => api.listAssets(params),
  });
}

export function useAsset(type: AssetType, id: string | undefined) {
  return useQuery({
    queryKey: ['asset', type, id],
    queryFn: () => api.getAsset(type, id!),
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
    mutationFn: ({ type, id, input }: { type: AssetType; id: string; input: Partial<Omit<CreateAssetInput, 'type'>> }) =>
      api.updateAsset(type, id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, id }: { type: AssetType; id: string }) => api.deleteAsset(type, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); },
  });
}

export function useSignUpload() {
  return useMutation({
    mutationFn: (input: api.SignUploadInput) => api.signUpload(input),
  });
}

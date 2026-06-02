import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listImageQuota, updateImageQuota, type ImageQuotaRow } from '@/lib/api/admin';

export function useImageQuota() {
  return useQuery({
    queryKey: ['image-quota'],
    queryFn: listImageQuota,
    staleTime: 60 * 1000,
  });
}

export function useUpdateImageQuotaLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ monthYYMM, limit }: { monthYYMM: string; limit: number }) => updateImageQuota(monthYYMM, limit),
    onSuccess: (row) => {
      queryClient.setQueryData<ImageQuotaRow[]>(['image-quota'], (prev = []) => {
        const next = prev.filter((item) => item.month_yymm !== row.month_yymm);
        return [row, ...next].sort((a, b) => b.month_yymm.localeCompare(a.month_yymm));
      });
    },
  });
}

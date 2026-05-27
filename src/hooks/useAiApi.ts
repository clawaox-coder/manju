import { useQuery, useMutation } from '@tanstack/react-query';
import * as api from '@/lib/api/ai';
import type { StoryboardGenerateInput } from '@/lib/api/ai';

export function useStoryboardGenerate() {
  return useMutation({
    mutationFn: (input: StoryboardGenerateInput) => api.storyboardGenerate(input),
  });
}

export function useAiTask(taskId: string | undefined) {
  return useQuery({
    queryKey: ['ai-task', taskId],
    queryFn: () => api.getAiTask(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return 2000;
      if (status === 'done' || status === 'failed') return false;
      return 2000;
    },
  });
}

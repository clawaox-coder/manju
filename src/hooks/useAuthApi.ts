import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '@/lib/api/auth';
import { request } from '@/lib/api/client';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: 5 * 60 * 1000,
  });
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  joined_at: string;
}

async function fetchTeamMembers(): Promise<TeamMember[]> {
  return request<TeamMember[]>('/v1/team/members', { method: 'GET' });
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ['team-members'],
    queryFn: fetchTeamMembers,
    staleTime: 60 * 1000,
  });
}

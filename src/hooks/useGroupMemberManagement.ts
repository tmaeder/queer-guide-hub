import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';

interface Profile { user_id: string; display_name: string; avatar_url: string; }

export function useSearchProfiles(search: string, excludeIds: string[]) {
  const [results, setResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await supabase.from('profiles').select('user_id, display_name, avatar_url').ilike('display_name', `%${search}%`).not('user_id', 'in', `(${excludeIds.join(',')})`).limit(10);
      setResults(data || []); setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, excludeIds]);
  return { results, isSearching };
}

export function useGroupMemberManagement(groupId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidate = () => { if (groupId) queryClient.invalidateQueries({ queryKey: ['group-members', groupId] }); };

  const addMember = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { error } = await supabase.from('group_memberships').insert({ group_id: groupId, user_id: userId, role: 'member' });
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: 'Member added' }); invalidate(); },
    onError: (error: Error) => { toast({ title: 'Error', description: error.message, variant: 'destructive' }); },
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const { error } = await supabase.from('group_memberships').update({ role: newRole }).eq('group_id', groupId!).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: 'Role updated' }); invalidate(); },
    onError: (error: Error) => { toast({ title: 'Error', description: error.message, variant: 'destructive' }); },
  });

  const removeMember = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { error } = await supabase.from('group_memberships').delete().eq('group_id', groupId!).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: 'Member removed' }); invalidate(); },
    onError: (error: Error) => { toast({ title: 'Error', description: error.message, variant: 'destructive' }); },
  });

  return { addMember, changeRole, removeMember };
}

import { supabase } from '@/integrations/supabase/client';

export interface SendEventMemberOption {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface SendEventGroupOption {
  id: string;
  name: string;
  image_url: string | null;
}

export async function fetchSendEventMembers(
  currentUserId: string,
  query: string,
): Promise<SendEventMemberOption[]> {
  let q = supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .neq('user_id', currentUserId)
    .order('display_name')
    .limit(30);
  if (query.trim()) {
    q = q.ilike('display_name', `%${query.trim()}%`);
  }
  const { data } = await q;
  return (data || []).map((p) => ({
    id: p.user_id,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
  }));
}

export async function fetchSendEventGroups(
  currentUserId: string,
): Promise<SendEventGroupOption[]> {
  const { data } = await supabase
    .from('group_memberships')
    .select('group_id, community_groups(id, name, image_url)')
    .eq('user_id', currentUserId)
    .order('joined_at', { ascending: false });
  return (data || [])
    .map((row) => {
      const g = row.community_groups as
        | { id: string; name: string; image_url: string | null }
        | null;
      return g ? { id: g.id, name: g.name, image_url: g.image_url } : null;
    })
    .filter((g): g is SendEventGroupOption => g !== null);
}

export async function postEventToGroup(
  groupId: string,
  userId: string,
  content: string,
): Promise<void> {
  const { error } = await supabase.from('group_posts').insert({
    group_id: groupId,
    user_id: userId,
    content,
    post_type: 'text',
  });
  if (error) throw error;
}

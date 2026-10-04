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

/**
 * Members a user can send a share to. Matches display name OR username, and
 * drops anyone in a block relationship with the caller in EITHER direction —
 * offering a blocked person as a recipient would hand the blocked side a way
 * back in. RLS on `user_relationships` lets the caller read rows where they
 * are either party, which is exactly the set needed here.
 */
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
  const term = query.trim().replace(/[%,()]/g, '');
  if (term) {
    q = q.or(`display_name.ilike.%${term}%,username.ilike.%${term}%`);
  }
  const [{ data }, { data: blocks, error: blocksError }] = await Promise.all([
    q,
    supabase
      .from('user_relationships')
      .select('user_id, target_user_id')
      .eq('relationship_type', 'block')
      .or(`user_id.eq.${currentUserId},target_user_id.eq.${currentUserId}`),
  ]);
  // Fail closed: if the block list cannot be read, offer nobody rather than
  // possibly offering someone the caller blocked.
  if (blocksError) return [];
  const blocked = new Set(
    (blocks || []).map((b) => (b.user_id === currentUserId ? b.target_user_id : b.user_id)),
  );
  return (data || [])
    .filter((p) => !blocked.has(p.user_id))
    .map((p) => ({
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

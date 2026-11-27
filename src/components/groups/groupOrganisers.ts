export interface Organiser {
  role: string;
  profiles?: { display_name?: string | null } | null;
}

/** Admins and moderators the caller is allowed to see, admins first. */
export function groupOrganisers(members: Organiser[]): { name: string; role: string }[] {
  return members
    .filter((m) => m.role === 'admin' || m.role === 'moderator')
    .map((m) => ({ name: m.profiles?.display_name?.trim() || '', role: m.role }))
    .filter((m) => m.name)
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1));
}

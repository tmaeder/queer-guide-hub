export interface Organiser {
  role: string;
  // The members query types display_name loosely (`{}`); coerce at use.
  profiles?: { display_name?: unknown } | null;
}

/** Admins and moderators the caller is allowed to see, admins first. */
export function groupOrganisers(members: Organiser[]): { name: string; role: string }[] {
  return members
    .filter((m) => m.role === 'admin' || m.role === 'moderator')
    .map((m) => ({
      name: typeof m.profiles?.display_name === 'string' ? m.profiles.display_name.trim() : '',
      role: m.role,
    }))
    .filter((m) => m.name)
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1));
}

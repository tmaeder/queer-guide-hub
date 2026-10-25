export type RedirectWorkspaceRole = 'owner' | 'member' | 'viewer' | 'billing';

export function isReadOnlyRedirectRole(role: string | undefined) {
  return role === 'viewer' || role === 'billing';
}

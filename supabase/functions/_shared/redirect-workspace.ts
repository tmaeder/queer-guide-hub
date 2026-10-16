import { UUID } from './redirect-api.ts';
// This identity is seeded by redirect_workspace_identity.sql. New workspace
// selections stay unavailable until every legacy reader/writer has tenant fences.
export const LEGACY_REDIRECT_WORKSPACE = '58aa4340-8f21-4b7f-9a10-90be2da89c01';
export function redirectWorkspaceSelection(value: string | null):
  | { id: string }
  | { error: string; status: 400 | 403 } {
  if (value === null) return { id: LEGACY_REDIRECT_WORKSPACE };
  if (!UUID.test(value)) return { error: 'Provide one valid Redirects workspace ID', status: 400 };
  if (value.toLowerCase() !== LEGACY_REDIRECT_WORKSPACE)
    return { error: 'This Redirects workspace is not available', status: 403 };
  return { id: LEGACY_REDIRECT_WORKSPACE };
}

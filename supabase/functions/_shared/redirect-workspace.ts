import { UUID } from './redirect-api.ts';
// Selection identifies a requested workspace. SQL checks its active state and
// current principal authority; tenant activation has independent schema fences.
export const LEGACY_REDIRECT_WORKSPACE = '58aa4340-8f21-4b7f-9a10-90be2da89c01';
export function redirectWorkspaceSelection(value: string | null):
  | { id: string }
  | { error: string; status: 400 | 403 } {
  if (value === null) return { id: LEGACY_REDIRECT_WORKSPACE };
  if (!UUID.test(value)) return { error: 'Provide one valid Redirects workspace ID', status: 400 };
  return { id: value.toLowerCase() };
}

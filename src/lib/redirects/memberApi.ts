import { supabase } from '@/integrations/supabase/client';
export class RedirectApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = 'RedirectApiError';
  }
}
export async function memberRedirectApi<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: Record<string, unknown> | Record<string, unknown>[],
  signal?: AbortSignal,
  workspaceId?: string,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('redirect-api' + path, {
    method,
    ...(workspaceId ? { headers: { 'X-Qg-Redirect-Workspace': workspaceId } } : {}),
    ...(body !== undefined ? { body } : {}),
    signal,
  });
  if (error || data?.error) {
    let message = data?.error ?? error?.message ?? 'Redirect request failed';
    if (error?.context instanceof Response) {
      try {
        const response = await error.context.json();
        if (typeof response.error === 'string') message = response.error;
      } catch {
        /* Preserve the transport error. */
      }
    }
    throw new RedirectApiError(
      message,
      error?.context instanceof Response ? error.context.status : null,
    );
  }
  return data as T;
}
// Each closure keeps one immutable workspace context. Never mutate shared
// Supabase/global headers when the user switches between workspaces.
export function createWorkspaceRedirectApi(workspaceId: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(workspaceId))
    throw new Error('Choose a valid Redirects workspace');
  const selected = workspaceId.toLowerCase();
  return <T>(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    body?: Record<string, unknown> | Record<string, unknown>[],
    signal?: AbortSignal,
  ) => memberRedirectApi<T>(path, method, body, signal, selected);
}
export interface MemberLink {
  id: string;
  slug: string;
  target: string;
  shortUrl: string;
  isDomainRoot?: boolean;
  domainId?: string | null;
  domainHostname?: string | null;
  folderId: string | null;
  tagIds: string[];
  comment: string;
  notes?: string | null;
  isEnabled: boolean;
  isArchived: boolean;
  clicks: number;
  canEdit: boolean;
  statusCode: number;
  queryMode: string;
  queryOverride: Record<string, string> | null;
  utmDefaults: Record<string, string> | null;
  expiresAt: string | null;
  startsAt: string | null;
  clickLimit: number | null;
  updatedAt: string;
}
export interface MemberFolder {
  id: string;
  name: string;
  description: string;
  canEdit: boolean;
  canManage: boolean;
  canRename?: boolean;
}
export interface MemberResources {
  folders: MemberFolder[];
  tags: { id: string; name: string; color: string }[];
  templates: { id: string; name: string; parameters: Record<string, string> }[];
}
export async function memberResources(signal?: AbortSignal): Promise<MemberResources> {
  async function page<T>(kind: string): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | null = null;
    do {
      const result: { data: T[]; nextCursor: string | null } = await memberRedirectApi(
        '/' + kind + '?limit=100' + (cursor ? '&cursor=' + cursor : ''),
        'GET',
        undefined,
        signal,
      );
      rows.push(...result.data);
      if (cursor && result.nextCursor === cursor)
        throw new Error('Workspace pagination did not advance');
      cursor = result.nextCursor;
    } while (cursor);
    return rows;
  }
  const [folders, tags, templates] = await Promise.all([
    page<MemberResources['folders'][number]>('folders'),
    page<MemberResources['tags'][number]>('tags'),
    page<MemberResources['templates'][number]>('templates'),
  ]);
  return { folders, tags, templates };
}

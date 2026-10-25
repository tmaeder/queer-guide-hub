import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceRedirectApi, memberRedirectApi } from '../memberApi';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.invoke.mockImplementation(async (_path, options) => ({
    data: { workspace: options.headers?.['X-Qg-Redirect-Workspace'] ?? 'legacy-default' },
    error: null,
  }));
});
describe('immutable workspace API clients', () => {
  it('keeps concurrent contexts and the default client independent', async () => {
    const first = createWorkspaceRedirectApi('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
    const second = createWorkspaceRedirectApi('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    const responses = await Promise.all([
      first<{ workspace: string }>('/workspace-ownership'),
      second<{ workspace: string }>('/workspace-ownership'),
      memberRedirectApi<{ workspace: string }>('/session'),
    ]);
    expect(responses.map((row) => row.workspace)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'legacy-default',
    ]);
    expect(mocks.invoke.mock.calls[2][1].headers).toBeUndefined();
  });
  it('rejects malformed and combined selections before invoking the backend', () => {
    for (const value of [
      '',
      'not-a-workspace',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ])
      expect(() => createWorkspaceRedirectApi(value)).toThrow('Choose a valid Redirects workspace');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});

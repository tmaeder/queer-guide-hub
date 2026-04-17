import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rpcCalls: Array<{ name: string; args: unknown }> = [];
let rpcResult: unknown = 'story-uuid-1';
const updateCalls: Array<{ table: string; patch: unknown; id: string }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn((name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: rpcResult, error: null });
    }),
    from: vi.fn((table: string) => ({
      update: vi.fn((patch: unknown) => ({
        eq: vi.fn((_col: string, id: string) => {
          updateCalls.push({ table, patch, id });
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    })),
  },
}));

import {
  useCreateStory,
  useAddStoryMembers,
  useRemoveStoryMembers,
  useResolveStory,
  useAcceptStorySuggestion,
  useDismissStorySuggestion,
  useUpdateStory,
} from '../useFeedbackStories';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  rpcCalls.length = 0;
  updateCalls.length = 0;
  rpcResult = 'story-uuid-1';
});

describe('useFeedbackStories mutations', () => {
  it('useCreateStory calls create_story RPC with expected args', async () => {
    const { result } = renderHook(() => useCreateStory(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        title: 'Map pins drift',
        submissionIds: ['a', 'b', 'c'],
        summary: 'several reports of pins moving',
      });
    });
    expect(rpcCalls).toEqual([
      {
        name: 'create_story',
        args: {
          p_title: 'Map pins drift',
          p_submission_ids: ['a', 'b', 'c'],
          p_summary: 'several reports of pins moving',
          p_origin: 'manual',
        },
      },
    ]);
  });

  it('useAddStoryMembers calls add_story_members RPC', async () => {
    const { result } = renderHook(() => useAddStoryMembers(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ storyId: 'S', submissionIds: ['x', 'y'] });
    });
    expect(rpcCalls[0]).toEqual({
      name: 'add_story_members',
      args: { p_story_id: 'S', p_submission_ids: ['x', 'y'] },
    });
  });

  it('useRemoveStoryMembers calls remove_story_members RPC', async () => {
    const { result } = renderHook(() => useRemoveStoryMembers(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ storyId: 'S', submissionIds: ['x'] });
    });
    expect(rpcCalls[0]).toEqual({
      name: 'remove_story_members',
      args: { p_story_id: 'S', p_submission_ids: ['x'] },
    });
  });

  it('useResolveStory forwards closeItems flag (no cascade)', async () => {
    rpcResult = 0;
    const { result } = renderHook(() => useResolveStory(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ storyId: 'S', closeItems: false });
    });
    expect(rpcCalls[0]).toEqual({
      name: 'resolve_story',
      args: { p_story_id: 'S', p_close_items: false },
    });
  });

  it('useResolveStory forwards closeItems flag (cascade)', async () => {
    rpcResult = 3;
    const { result } = renderHook(() => useResolveStory(), { wrapper: wrapper() });
    let returned: number | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({ storyId: 'S', closeItems: true });
    });
    expect(rpcCalls[0].args).toEqual({ p_story_id: 'S', p_close_items: true });
    expect(returned).toBe(3);
  });

  it('useAcceptStorySuggestion forwards override title', async () => {
    rpcResult = 'story-from-suggestion';
    const { result } = renderHook(() => useAcceptStorySuggestion(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ suggestionId: 'sug-1', overrideTitle: 'Sharper title' });
    });
    expect(rpcCalls[0]).toEqual({
      name: 'accept_story_suggestion',
      args: { p_suggestion_id: 'sug-1', p_override_title: 'Sharper title' },
    });
  });

  it('useDismissStorySuggestion writes dismissed=true to table', async () => {
    const { result } = renderHook(() => useDismissStorySuggestion(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync('sug-1');
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('feedback_story_suggestions');
    expect(updateCalls[0].id).toBe('sug-1');
    expect((updateCalls[0].patch as { dismissed?: boolean }).dismissed).toBe(true);
  });

  it('useUpdateStory patches feedback_stories', async () => {
    const { result } = renderHook(() => useUpdateStory(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        storyId: 'S',
        patch: { title: 'New title', priority: 1 },
      });
    });
    expect(updateCalls[0].table).toBe('feedback_stories');
    expect(updateCalls[0].patch).toEqual({ title: 'New title', priority: 1 });
  });
});

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const { state, useAuthMock, storageState } = vi.hoisted(() => ({
  state: {
    results: [] as MockResult[],
    calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
  },
  useAuthMock: vi.fn(),
  storageState: {
    uploads: [] as Array<{ bucket: string; path: string }>,
    removes: [] as Array<{ bucket: string; paths: string[] }>,
    signed: [] as Array<{ bucket: string; path: string }>,
    nextUploadResult: { error: null as unknown },
    nextRemoveResult: { error: null as unknown },
    nextSignedResult: { data: { signedUrl: 'https://signed/x' } as { signedUrl: string } | null, error: null as unknown },
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (onFulfilled: (v: MockResult) => unknown) => {
                const next = state.results.shift() ?? { data: [], error: null };
                return Promise.resolve(next).then(onFulfilled);
              };
            }
            return (...args: unknown[]) => {
              record.chain.push({ method: prop, args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
    storage: {
      from(bucket: string) {
        return {
          upload(path: string) {
            storageState.uploads.push({ bucket, path });
            return Promise.resolve(storageState.nextUploadResult);
          },
          remove(paths: string[]) {
            storageState.removes.push({ bucket, paths });
            return Promise.resolve(storageState.nextRemoveResult);
          },
          createSignedUrl(path: string) {
            storageState.signed.push({ bucket, path });
            return Promise.resolve(storageState.nextSignedResult);
          },
        };
      },
    },
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import {
  useTripDocuments,
  useUploadDocument,
  useDeleteDocument,
  getDocumentDownloadUrl,
} from '../useTripDocuments';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  storageState.uploads.length = 0;
  storageState.removes.length = 0;
  storageState.signed.length = 0;
  storageState.nextUploadResult = { error: null };
  storageState.nextRemoveResult = { error: null };
  storageState.nextSignedResult = { data: { signedUrl: 'https://signed/x' }, error: null };
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
});

describe('useTripDocuments', () => {
  it("disabled when tripId is undefined", () => {
    renderHook(() => useTripDocuments(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it("disabled without a user", () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => useTripDocuments(null), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it("personal scope (tripId=null) filters trip_id IS NULL", async () => {
    withResults({ data: [{ id: 'd1' }], error: null });
    const { result } = renderHook(() => useTripDocuments(null), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const is = state.calls[0].chain.find(s => s.method === 'is');
    expect(is?.args).toEqual(['trip_id', null]);
  });

  it("trip scope filters trip_id eq tripId", async () => {
    withResults({ data: [], error: null });
    renderHook(() => useTripDocuments('t1'), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['trip_id', 't1']);
  });
});

function makeFile(name = 'passport.pdf', _size = 100, type = 'application/pdf'): File {
  const blob = new Blob(['content'], { type });
  return new File([blob], name, { type });
}

describe('useUploadDocument', () => {
  it('rejects when not authenticated', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useUploadDocument(), { wrapper });
    await expect(
      result.current.mutateAsync({ file: makeFile(), title: 'X', doc_type: 'passport' }),
    ).rejects.toThrow('not authenticated');
  });

  it('uploads to trip-documents/{user_id}/{id}.{ext} then inserts metadata', async () => {
    withResults({ data: { id: 'doc-1', title: 'Passport' }, error: null });

    const { result } = renderHook(() => useUploadDocument(), { wrapper });
    await result.current.mutateAsync({
      file: makeFile('my-passport.pdf', 200),
      title: 'Passport',
      doc_type: 'passport',
      expiry_date: '2030-01-01',
    });

    expect(storageState.uploads).toHaveLength(1);
    const up = storageState.uploads[0];
    expect(up.bucket).toBe('trip-documents');
    expect(up.path.startsWith('u1/')).toBe(true);
    expect(up.path.endsWith('.pdf')).toBe(true);

    // Then a row insert into trip_documents.
    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    const payload = insert?.args[0] as Record<string, unknown>;
    expect(payload.user_id).toBe('u1');
    expect(payload.title).toBe('Passport');
    expect(payload.doc_type).toBe('passport');
    expect(payload.expiry_date).toBe('2030-01-01');
    expect(payload.storage_path).toBe(up.path);
  });

  it('rolls back the upload when the metadata insert fails', async () => {
    withResults({ data: null, error: { message: 'rls' } });

    const { result } = renderHook(() => useUploadDocument(), { wrapper });
    await expect(
      result.current.mutateAsync({ file: makeFile(), title: 'X', doc_type: 'passport' }),
    ).rejects.toEqual({ message: 'rls' });

    // The orphan blob should be removed.
    expect(storageState.removes).toHaveLength(1);
  });

  it('throws when the storage upload itself errors', async () => {
    storageState.nextUploadResult = { error: { message: 'storage down' } };

    const { result } = renderHook(() => useUploadDocument(), { wrapper });
    await expect(
      result.current.mutateAsync({ file: makeFile(), title: 'X', doc_type: 'passport' }),
    ).rejects.toEqual({ message: 'storage down' });

    // Storage upload failed → no DB insert attempted.
    expect(state.calls).toHaveLength(0);
  });
});

describe('useDeleteDocument', () => {
  it('removes the storage object first, then deletes the row', async () => {
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useDeleteDocument(), { wrapper });
    await result.current.mutateAsync({
      id: 'doc-1',
      user_id: 'u1',
      trip_id: null,
      doc_type: 'passport',
      title: 'P',
      storage_path: 'u1/doc-1.pdf',
      file_size_bytes: null,
      mime_type: null,
      expiry_date: null,
      country_id: null,
      notes: null,
      created_at: '',
      updated_at: '',
    });

    expect(storageState.removes[0].paths).toEqual(['u1/doc-1.pdf']);
    expect(state.calls[0].chain.some(s => s.method === 'delete')).toBe(true);
  });

  it('does not delete the row when the storage remove fails', async () => {
    storageState.nextRemoveResult = { error: { message: 'denied' } };

    const { result } = renderHook(() => useDeleteDocument(), { wrapper });
    await expect(
      result.current.mutateAsync({
        id: 'doc-1', user_id: 'u1', trip_id: null,
        doc_type: 'passport', title: 'P', storage_path: 'u1/doc-1.pdf',
        file_size_bytes: null, mime_type: null, expiry_date: null,
        country_id: null, notes: null, created_at: '', updated_at: '',
      }),
    ).rejects.toEqual({ message: 'denied' });

    expect(state.calls).toHaveLength(0);
  });
});

describe('getDocumentDownloadUrl', () => {
  it('returns the signed URL on success', async () => {
    storageState.nextSignedResult = { data: { signedUrl: 'https://signed/abc' }, error: null };
    const url = await getDocumentDownloadUrl({
      id: 'd', user_id: 'u', trip_id: null, doc_type: 'other', title: 'x',
      storage_path: 'u/d.pdf', file_size_bytes: null, mime_type: null,
      expiry_date: null, country_id: null, notes: null,
      created_at: '', updated_at: '',
    });
    expect(url).toBe('https://signed/abc');
  });

  it('returns null on error', async () => {
    storageState.nextSignedResult = { data: null, error: { message: 'fail' } };
    const url = await getDocumentDownloadUrl({
      id: 'd', user_id: 'u', trip_id: null, doc_type: 'other', title: 'x',
      storage_path: 'u/d.pdf', file_size_bytes: null, mime_type: null,
      expiry_date: null, country_id: null, notes: null,
      created_at: '', updated_at: '',
    });
    expect(url).toBeNull();
  });
});

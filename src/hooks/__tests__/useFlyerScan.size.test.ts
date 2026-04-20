import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const extractSpy = vi.fn();
const uploadSpy = vi.fn();
const invokeSpy = vi.fn();

vi.mock('@/lib/fileExtractors', async () => {
  const actual = await vi.importActual<typeof import('@/lib/fileExtractors')>(
    '@/lib/fileExtractors',
  );
  return {
    ...actual,
    extractFileContent: (file: File) => extractSpy(file),
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => uploadSpy(...args),
        getPublicUrl: () => ({ data: { publicUrl: 'https://x' } }),
      }),
    },
    functions: { invoke: (...args: unknown[]) => invokeSpy(...args) },
  },
}));

import { useFlyerScan } from '../useFlyerScan';
import { MAX_UPLOAD_BYTES } from '@/lib/uploadErrors';

function makeFile(name: string, size: number, type = 'image/png'): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size, configurable: true });
  return f;
}

describe('useFlyerScan — size gate (defense-in-depth)', () => {
  beforeEach(() => {
    extractSpy.mockReset();
    uploadSpy.mockReset();
    invokeSpy.mockReset();
  });

  it('does NOT call extractFileContent for an oversized file', async () => {
    const { result } = renderHook(() => useFlyerScan());
    const huge = makeFile('huge.png', MAX_UPLOAD_BYTES + 1);

    await act(async () => {
      await result.current.startScan([huge]);
    });

    expect(extractSpy).not.toHaveBeenCalled();
    expect(uploadSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.scanState).toBe('error'));
    expect(result.current.error?.code).toBe('FILE_TOO_LARGE');
  });

  it('aborts the batch when any file is oversized (no decoding of other files)', async () => {
    const { result } = renderHook(() => useFlyerScan());
    const ok = makeFile('ok.txt', 1000, 'text/plain');
    const huge = makeFile('huge.png', MAX_UPLOAD_BYTES + 1);

    await act(async () => {
      await result.current.startScan([ok, huge]);
    });

    expect(extractSpy).not.toHaveBeenCalled();
    expect(result.current.error?.code).toBe('FILE_TOO_LARGE');
  });

  it('accepts a file at the exact size limit', async () => {
    extractSpy.mockResolvedValue({
      mode: 'text',
      text: 'hello world'.repeat(20),
      fileName: 'boundary.txt',
    });
    invokeSpy.mockResolvedValue({ data: { items: [], raw_text: '' }, error: null });

    const { result } = renderHook(() => useFlyerScan());
    const boundary = makeFile('boundary.txt', MAX_UPLOAD_BYTES, 'text/plain');

    await act(async () => {
      await result.current.startScan([boundary]);
    });

    expect(extractSpy).toHaveBeenCalledTimes(1);
    expect(extractSpy).toHaveBeenCalledWith(boundary);
  });
});

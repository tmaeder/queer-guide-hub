import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormPersistence } from '../useFormPersistence';

interface Form {
  email: string;
  password: string;
  name: string;
}

const initial: Form = { email: '', password: '', name: '' };

describe('useFormPersistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips data through localStorage but excludes password', () => {
    const { result, unmount } = renderHook(() =>
      useFormPersistence<Form>('test', initial, ['password'])
    );

    act(() => {
      result.current.update({ email: 'a@b.co', password: 'secret', name: 'Alex' });
    });

    expect(result.current.data).toEqual({ email: 'a@b.co', password: 'secret', name: 'Alex' });

    const stored = JSON.parse(window.localStorage.getItem('qg:signup:test')!);
    expect(stored).toEqual({ email: 'a@b.co', name: 'Alex' });
    expect(stored.password).toBeUndefined();

    unmount();

    // Reload from storage on remount
    const { result: result2 } = renderHook(() =>
      useFormPersistence<Form>('test', initial, ['password'])
    );
    expect(result2.current.data.email).toBe('a@b.co');
    expect(result2.current.data.name).toBe('Alex');
    expect(result2.current.data.password).toBe(''); // not persisted
  });

  it('clear() wipes storage and resets state', () => {
    const { result } = renderHook(() => useFormPersistence<Form>('clr', initial, ['password']));
    act(() => result.current.update({ email: 'x@y.z' }));
    expect(window.localStorage.getItem('qg:signup:clr')).not.toBeNull();

    act(() => result.current.clear());
    expect(window.localStorage.getItem('qg:signup:clr')).toBeNull();
    expect(result.current.data).toEqual(initial);
  });
});

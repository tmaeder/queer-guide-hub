import { describe, it, expect } from 'vitest';
import { queryKeys, createOptimizedQueryClient } from '../queryOptimizations';

describe('queryKeys', () => {
  it('generates stable query keys for countries', () => {
    expect(queryKeys.countries()).toEqual(['countries', undefined]);
    expect(queryKeys.countries({ search: 'germany' })).toEqual(['countries', { search: 'germany' }]);
  });

  it('generates stable query keys for cities', () => {
    expect(queryKeys.cities({ continent: 'europe' })).toEqual(['cities', { continent: 'europe' }]);
  });

  it('generates stable query keys for venues', () => {
    expect(queryKeys.venues({ category: 'bar' })).toEqual(['venues', { category: 'bar' }]);
  });

  it('generates stable query keys for events', () => {
    expect(queryKeys.events()).toEqual(['events', undefined]);
  });

  it('generates stable query keys for profiles', () => {
    expect(queryKeys.profiles('user-123')).toEqual(['profiles', 'user-123']);
    expect(queryKeys.profiles()).toEqual(['profiles', undefined]);
  });

  it('generates stable query keys for favorites', () => {
    expect(queryKeys.favorites('user-1', 'venue')).toEqual(['favorites', 'user-1', 'venue']);
  });
});

describe('createOptimizedQueryClient', () => {
  it('creates a query client with correct defaults', () => {
    const client = createOptimizedQueryClient();
    const defaults = client.getDefaultOptions();

    expect(defaults.queries?.staleTime).toBe(5 * 60 * 1000);
    expect(defaults.queries?.gcTime).toBe(15 * 60 * 1000);
    expect(defaults.queries?.refetchOnMount).toBe(true);
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
  });

  it('retry function skips 401 errors', () => {
    const client = createOptimizedQueryClient();
    const retry = client.getDefaultOptions().queries?.retry;

    if (typeof retry === 'function') {
      const authError = Object.assign(new Error('Unauthorized'), { status: 401 });
      expect(retry(0, authError)).toBe(false);
    }
  });

  it('retry function skips 403 errors', () => {
    const client = createOptimizedQueryClient();
    const retry = client.getDefaultOptions().queries?.retry;

    if (typeof retry === 'function') {
      const forbiddenError = Object.assign(new Error('Forbidden'), { status: 403 });
      expect(retry(0, forbiddenError)).toBe(false);
    }
  });

  it('retry function retries 500 errors up to 3 times', () => {
    const client = createOptimizedQueryClient();
    const retry = client.getDefaultOptions().queries?.retry;

    if (typeof retry === 'function') {
      const serverError = Object.assign(new Error('Server Error'), { status: 500 });
      expect(retry(0, serverError)).toBe(true);
      expect(retry(1, serverError)).toBe(true);
      expect(retry(2, serverError)).toBe(true);
      expect(retry(3, serverError)).toBe(false);
    }
  });
});

/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
const api = vi.hoisted(() => ({ from: vi.fn(), ranges: vi.fn(), filters: vi.fn() }));
vi.mock('@/integrations/supabase/untyped', () => ({ untypedFrom: api.from }));
import {
  classificationSource,
  fetchManagedOptions,
  invalidateManagedOptions,
  selectableOptions,
  useManagedOptions,
  useVocabularyOptions,
} from '../useManagedOptions';

function respond(pages: Array<{ data?: Record<string, unknown>[]; error?: unknown }>) {
  api.from.mockImplementation(() => {
    const builder = {
      select: () => builder,
      order: () => builder,
      range: (...args: unknown[]) => {
        api.ranges(...args);
        return builder;
      },
      eq: (...args: unknown[]) => {
        api.filters(...args);
        return builder;
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(pages.shift() ?? { data: [] }).then(resolve, reject),
    };
    return builder;
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  invalidateManagedOptions();
});
describe('managed taxonomy choices', () => {
  it('paginates without losing terms after the first API page and applies vocabulary filters', async () => {
    respond([
      {
        data: Array.from({ length: 500 }, (_, i) => ({
          value: `value-${i}`,
          name: `Label ${i}`,
          is_active: true,
        })),
      },
      { data: [{ value: 'last', name: 'Last', is_active: false }] },
    ]);
    const options = await fetchManagedOptions(classificationSource('venue_category'));
    expect(options).toHaveLength(501);
    expect(options.at(-1)).toEqual({ value: 'last', label: 'Last', active: false });
    expect(api.ranges.mock.calls).toEqual([
      [0, 499],
      [500, 999],
    ]);
    expect(api.filters).toHaveBeenCalledWith('taxonomy', 'venue_category');
  });
  it('shares cached requests and evicts failed requests so Retry can recover', async () => {
    respond([{ error: new Error('offline') }]);
    const source = classificationSource('hotel_type');
    await expect(fetchManagedOptions(source)).rejects.toThrow('offline');
    respond([{ data: [{ value: 'hotel', name: 'Hotel', is_active: true }] }]);
    await Promise.all([fetchManagedOptions(source), fetchManagedOptions(source)]);
    expect(api.from).toHaveBeenCalledTimes(2);
  });
  it('retains only selected inactive or legacy values while showing new active choices', () => {
    expect(
      selectableOptions(
        [
          { value: 'active', label: 'Active', active: true },
          { value: 'old', label: 'Old', active: false },
          { value: 'hidden', label: 'Hidden', active: false },
        ],
        ['old', 'legacy'],
      ),
    ).toEqual([
      { value: 'active', label: 'Active' },
      { value: 'old', label: 'Old (inactive)' },
      { value: 'legacy', label: 'legacy (existing)' },
    ]);
  });
  it('refreshes mounted consumers when a CMS save invalidates vocabularies', async () => {
    respond([{ data: [{ value: 'a', name: 'Before', is_active: true }] }]);
    const { result } = renderHook(() => useManagedOptions(classificationSource('gender')));
    await waitFor(() => expect(result.current.options[0]?.label).toBe('Before'));
    respond([{ data: [{ value: 'a', name: 'After', is_active: true }] }]);
    act(() => invalidateManagedOptions());
    await waitFor(() => expect(result.current.options[0]?.label).toBe('After'));
  });
});

describe('managed vocabulary integrity', () => {
  it('does not reuse eligible-member vocabulary responses for another access context', async () => {
    respond([{ data: [{ id: 'private-term', label: 'Eligible term' }] }, { data: [] }]);
    const source = { table: 'kink_categories', valueColumn: 'id', labelColumn: 'label' };
    expect(await fetchManagedOptions(source)).toHaveLength(1);
    expect(await fetchManagedOptions(source)).toEqual([]);
    expect(api.from).toHaveBeenCalledTimes(2);
  });
  it('stores raw hierarchy metadata while stripping kind prefixes from content choices', async () => {
    respond([
      {
        data: [
          {
            id: 'd',
            value: 'department:apparel',
            name: 'Apparel',
            is_active: true,
            parent_id: null,
          },
          { id: 'g', value: 'group:tops', name: 'Tops', is_active: true, parent_id: 'd' },
        ],
      },
    ]);
    const result = await fetchManagedOptions({
      ...classificationSource('marketplace_browse'),
      valuePrefix: 'group:',
      extraColumns: ['id', 'parent_id'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('tops');
    expect(result[0].data?.parent_id).toBe('d');
  });
  it('keeps the last managed choices during a failed refresh instead of resurrecting inactive seed options', async () => {
    respond([
      {
        data: [
          { value: 'retired', name: 'Retired', is_active: false },
          { value: 'current', name: 'Current', is_active: true },
        ],
      },
    ]);
    const { result } = renderHook(() =>
      useVocabularyOptions(classificationSource('hotel_type'), [
        { value: 'retired', label: 'Retired' },
      ]),
    );
    await waitFor(() => expect(result.current).toEqual([{ value: 'current', label: 'Current' }]));
    respond([{ error: new Error('offline') }]);
    act(() => invalidateManagedOptions());
    await waitFor(() => expect(api.from).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual([{ value: 'current', label: 'Current' }]);
  });
});

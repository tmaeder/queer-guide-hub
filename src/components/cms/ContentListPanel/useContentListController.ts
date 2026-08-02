/**
 * useContentListController — encapsulates state, persistence, dynamic option
 * loading, debouncing, data fetching, sort, and selection logic for the
 * ContentList shell. Keeps Rules-of-Hooks order stable.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { applyFilters, applySorts } from './filterOps';
import { normalizeSpec, type Filter, type SortSpec } from './viewSpec';
import { useParams } from 'react-router';
import { useContext } from 'react';
import { getContentType, getContentTypeIds } from '@/config/contentTypeRegistry';
import { AdminShellContext } from '@/components/admin/shell/AdminShell';
import type { ContentView } from './types';
import type { ContentTypeConfig, FieldConfig, SelectOption } from '@/types/cms';
import {
  extractStatus,
  loadPersistedState,
  persistState,
  type ListItem,
  type SortDir,
  type SortField,
} from './types';

/** Safe hook: returns AdminShell context or no-op fallback (for use outside AdminShell) */
function useAdminShellSafe() {
  const ctx = useContext(AdminShellContext);
  return ctx ?? { openEditor: () => {}, closeEditor: () => {} };
}

export interface UseContentListControllerArgs {
  contentTypeId?: string;
  onEdit?: (contentType: string, itemId: string) => void;
  onCreate?: (contentType: string) => void;
}

export function useContentListController({
  contentTypeId: propTypeId,
  onEdit: propOnEdit,
  onCreate: propOnCreate,
}: UseContentListControllerArgs) {
  const { type: routeType } = useParams<{ type?: string }>();
  const { openEditor } = useAdminShellSafe();

  const contentTypeId = propTypeId ?? routeType;
  const onEdit = propOnEdit ?? ((ct: string, id: string) => openEditor(ct, id));
  const onCreate = propOnCreate ?? ((ct: string) => openEditor(ct, null));

  const config = contentTypeId ? getContentType(contentTypeId) : null;

  const persistKey = contentTypeId ? `cms-list:${contentTypeId}` : null;
  const persisted = useMemo(
    () => (persistKey ? loadPersistedState(persistKey) : null),
    [persistKey],
  );

  // Fallback used only when the persisted spec carries no sorts at all.
  const initialSortField: SortField = config?.defaultSort?.field ?? 'updated_at';
  const initialSortDir: SortDir = config?.defaultSort?.dir ?? 'desc';

  const [items, setItems] = useState<ListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  // `sorts` is the source of truth and its ARRAY ORDER is the precedence.
  // sortField/sortDir stay as derived values of the primary sort so the table
  // headers keep their existing props.
  const [sorts, setSorts] = useState<SortSpec[]>(() =>
    normalizeSpec({ sorts: persisted?.sorts }, config ?? null).sorts.length
      ? normalizeSpec({ sorts: persisted?.sorts }, config ?? null).sorts
      : [{ field: initialSortField, dir: initialSortDir }],
  );
  const sortField: SortField = sorts[0]?.field ?? initialSortField;
  const sortDir: SortDir = sorts[0]?.dir ?? initialSortDir;
  // `filters` is an ORDERED LIST, not a map keyed by field: two filters on the
  // same field (price >= 1 AND price <= 4) are legal and a map cannot hold them.
  const [filters, setFilters] = useState<Filter[]>(
    () => normalizeSpec({ filters: persisted?.filters }, config ?? null).filters,
  );
  // Ordered list of VISIBLE fields. Replaces the old subtractive
  // `hiddenColumns`: the array is the column order, so there is no second
  // ordering structure that could disagree with it.
  const [columns, setColumns] = useState<string[]>(
    () => normalizeSpec({ columns: persisted?.columns }, config ?? null).columns,
  );
  // View + board grouping persist per content type, so a chosen layout survives
  // navigating away and back.
  const [view, setView] = useState<ContentView>(persisted?.view ?? 'table');
  const [groupBy, setGroupBy] = useState<string | null>(persisted?.groupBy ?? null);
  const [dateField, setDateField] = useState<string | null>(persisted?.dateField ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, SelectOption[]>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const allListColumns: FieldConfig[] = useMemo(
    () => (config?.fields ?? []).filter((f) => f.listColumn),
    [config],
  );
  // Spec order, not config order — `columns` is what the user arranged.
  const extraColumns: FieldConfig[] = useMemo(() => {
    const byName = new Map((config?.fields ?? []).map((f) => [f.name, f]));
    return columns.map((n) => byName.get(n)).filter((f): f is FieldConfig => !!f);
  }, [columns, config]);
  const filterFields: FieldConfig[] = useMemo(
    () => (config?.fields ?? []).filter((f) => f.filterable),
    [config],
  );

  // Persist filter+sort+columns per content type
  useEffect(() => {
    if (persistKey) {
      persistState(persistKey, {
        sorts,
        filters,
        columns,
        view,
        groupBy,
        dateField,
      });
    }
  }, [persistKey, sorts, filters, columns, view, groupBy, dateField]);

  // Load dynamic filter options (e.g. country/city dropdowns).
  useEffect(() => {
    let cancelled = false;
    const dynFields = filterFields.filter((f) => f.dynamicOptions);
    if (dynFields.length === 0) return;

    Promise.all(
      dynFields.map(async (f) => {
        const cfg = f.dynamicOptions!;
        const { data, error } = await supabase
          .from(cfg.table as 'cities')
          .select(`${cfg.valueColumn},${cfg.labelColumn}`)
          .order(cfg.orderBy ?? cfg.labelColumn);
        if (error) {
          console.error(`Failed to load options for ${f.name}:`, error);
          return [f.name, [] as SelectOption[]] as const;
        }
        const opts: SelectOption[] = (data ?? []).map((row: Record<string, unknown>) => ({
          value: String(row[cfg.valueColumn]),
          label: String(row[cfg.labelColumn] ?? row[cfg.valueColumn]),
        }));
        return [f.name, opts] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setDynamicOptions((prev) => {
        const next = { ...prev };
        for (const [name, opts] of entries) next[name] = opts;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [filterFields]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Data loading
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      if (contentTypeId && config) {
        // eslint-disable-next-line react-hooks/immutability -- function declared below; effect/callback fires after render so the binding is initialized when called.
        await loadSingleType(config);
      } else {
        // eslint-disable-next-line react-hooks/immutability -- function declared below; effect/callback fires after render so the binding is initialized when called.
        await loadAllTypes();
      }
    } catch (err) {
      console.error('Error loading content:', err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helpers below, deps control re-fetching
  }, [contentTypeId, config, page, rowsPerPage, debouncedSearch, sorts, filters]);

  async function loadSingleType(ct: ContentTypeConfig) {
    const from = page * rowsPerPage;
    const to = from + rowsPerPage - 1;

    // 'title' is an alias for the type's real title column, and a virtual field
    // has no column to order by at all.
    const resolveSortField = (name: string) => {
      if (name === 'title') return ct.titleField;
      return ct.fields.find((f) => f.name === name)?.virtual ? 'updated_at' : name;
    };

    let query = supabase
      .from(ct.tableName as 'events')
      .select(ct.listSelect ?? '*', { count: 'exact' })
      .range(from, to);
    query = applySorts(query as never, sorts, resolveSortField) as typeof query;

    if (debouncedSearch) {
      query = query.ilike(ct.titleField, `%${debouncedSearch}%`);
    }

    // Every filter goes through the shared translator. The previous inline
    // version had five type branches and silently skipped everything else, so
    // filtering on an autocomplete/url/textarea did nothing at all.
    query = applyFilters(query as never, filters) as typeof query;

    const { data, error, count } = await query;
    if (error) throw error;

    const mapped = (data || []).map((row: Record<string, unknown>) => ({
      id: row[ct.primaryKey] as string,
      title: (row[ct.titleField] as string) || '(Untitled)',
      description: ct.descriptionField
        ? (row[ct.descriptionField] as string | undefined)
        : undefined,
      updatedAt: row.updated_at as string | undefined,
      contentType: ct.id,
      contentTypeLabel: ct.label.singular,
      contentTypeColor: ct.color,
      status: extractStatus(row, ct),
      raw: row,
    }));

    setItems(mapped);
    setTotalCount(count ?? 0);
  }

  async function loadAllTypes() {
    const allItems: ListItem[] = [];
    const configs = getContentTypeIds()
      .map((id) => getContentType(id))
      .filter((ct): ct is ContentTypeConfig => !!ct && ct.admin?.includeInAllContent !== false);

    for (const ct of configs) {
      let query = supabase
        .from(ct.tableName as 'events')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .limit(100);

      if (debouncedSearch) {
        query = query.ilike(ct.titleField, `%${debouncedSearch}%`);
      }

      const { data } = await query;

      const mapped = (data || []).map((row: Record<string, unknown>) => ({
        id: row[ct.primaryKey],
        title: row[ct.titleField] || '(Untitled)',
        description: ct.descriptionField ? row[ct.descriptionField] : undefined,
        updatedAt: row.updated_at,
        contentType: ct.id,
        contentTypeLabel: ct.label.singular,
        contentTypeColor: ct.color,
        status: extractStatus(row, ct),
      }));

      allItems.push(...mapped);
    }

    allItems.sort((a, b) => {
      if (sortField === 'title') {
        const cmp = (a.title || '').localeCompare(b.title || '');
        return sortDir === 'asc' ? cmp : -cmp;
      }
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      const cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });

    setTotalCount(allItems.length);
    const from = page * rowsPerPage;
    setItems(allItems.slice(from, from + rowsPerPage));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    loadItems();
  }, [loadItems]);

  // Reset page on search/filter change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setPage(0);
    setSelected(new Set());
  }, [debouncedSearch, filters]);

  // There is deliberately NO "restore on content-type change" effect.
  //
  // There used to be one, and it corrupted state. React runs effects in
  // declaration order, so on a type switch the persist effect above ran first
  // in a commit where `persistKey` was already the INCOMING type but every
  // state value was still the outgoing one — writing venues' sort/filters/
  // columns into the events key, which the restore effect then read back. The
  // incoming type's saved state was destroyed on every switch. It also only
  // restored sort/filters/columns, so view/groupBy/dateField leaked across
  // types regardless.
  //
  // ContentListPanel now remounts on the type id (`key`), so `persistKey` is
  // constant for this hook's whole life and initial state comes from the
  // useState initializers. The bug has no path to exist rather than being
  // patched.

  // Clear selection on page change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setSelected(new Set());
  }, [page]);

  /**
   * Plain click sorts by this field alone. Shift-click appends it, or flips it
   * if already present — the standard multi-sort idiom, and the only way to
   * build a precedence list without opening the Sort panel.
   */
  function handleSort(field: SortField, append = false) {
    setSorts((prev) => {
      const existing = prev.find((s2) => s2.field === field);
      const flipped: SortSpec = {
        field,
        dir: existing
          ? existing.dir === 'asc'
            ? 'desc'
            : 'asc'
          : field === 'title'
            ? 'asc'
            : 'desc',
      };
      if (!append) return [flipped];
      return existing ? prev.map((s2) => (s2.field === field ? flipped : s2)) : [...prev, flipped];
    });
    setPage(0);
  }

  const allVisibleIds = useMemo(() => items.map((it) => `${it.contentType}-${it.id}`), [items]);
  const allSelected = items.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const someSelected = allVisibleIds.some((id) => selected.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allVisibleIds));
    }
  }

  function toggleSelect(itemKey: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  }

  function clearFilters() {
    setFilters([]);
  }

  return {
    contentTypeId,
    config,
    onEdit,
    onCreate,
    items,
    totalCount,
    loading,
    search,
    setSearch,
    debouncedSearch,
    page,
    setPage,
    rowsPerPage,
    setRowsPerPage,
    sorts,
    setSorts,
    sortField,
    sortDir,
    filters,
    setFilters,
    clearFilters,
    columns,
    setColumns,
    view,
    setView,
    groupBy,
    setGroupBy,
    dateField,
    setDateField,
    selected,
    setSelected,
    dynamicOptions,
    allListColumns,
    extraColumns,
    filterFields,
    loadItems,
    handleSort,
    allSelected,
    someSelected,
    toggleSelectAll,
    toggleSelect,
  };
}

export type ContentListController = ReturnType<typeof useContentListController>;

/**
 * useContentListController — encapsulates state, persistence, dynamic option
 * loading, debouncing, data fetching, sort, and selection logic for the
 * ContentList shell. Keeps Rules-of-Hooks order stable.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useParams } from 'react-router';
import { useContext } from 'react';
import { getContentType } from '@/config/contentTypeRegistry';
import { AdminShellContext } from '@/components/admin/shell/AdminShell';
import type { ContentTypeConfig, FieldConfig, SelectOption } from '@/types/cms';
import {
  extractStatus,
  loadPersistedState,
  persistState,
  type DateRange,
  type FilterState,
  type FilterValue,
  type ListItem,
  type NumberRange,
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

  const initialSortField: SortField =
    persisted?.sortField ?? config?.defaultSort?.field ?? 'updated_at';
  const initialSortDir: SortDir = persisted?.sortDir ?? config?.defaultSort?.dir ?? 'desc';

  const [items, setItems] = useState<ListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortField, setSortField] = useState<SortField>(initialSortField);
  const [sortDir, setSortDir] = useState<SortDir>(initialSortDir);
  const [filters, setFilters] = useState<FilterState>(persisted?.filters ?? {});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(persisted?.hiddenColumns ?? []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, SelectOption[]>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const allListColumns: FieldConfig[] = useMemo(
    () => (config?.fields ?? []).filter((f) => f.listColumn),
    [config],
  );
  const extraColumns: FieldConfig[] = useMemo(
    () => allListColumns.filter((f) => !hiddenColumns.includes(f.name)),
    [allListColumns, hiddenColumns],
  );
  const filterFields: FieldConfig[] = useMemo(
    () => (config?.fields ?? []).filter((f) => f.filterable),
    [config],
  );

  // Persist filter+sort+columns per content type
  useEffect(() => {
    if (persistKey) persistState(persistKey, { sortField, sortDir, filters, hiddenColumns });
  }, [persistKey, sortField, sortDir, filters, hiddenColumns]);

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
        await loadSingleType(config);
      } else {
        await loadAllTypes();
      }
    } catch (err) {
      console.error('Error loading content:', err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helpers below, deps control re-fetching
  }, [contentTypeId, config, page, rowsPerPage, debouncedSearch, sortField, sortDir, filters]);

  async function loadSingleType(ct: ContentTypeConfig) {
    const from = page * rowsPerPage;
    const to = from + rowsPerPage - 1;

    const sortFieldDef = ct.fields.find((f) => f.name === sortField);
    const dbSortField =
      sortField === 'title'
        ? ct.titleField
        : sortFieldDef?.virtual
          ? 'updated_at'
          : sortField;

    let query = supabase
      .from(ct.tableName as 'events')
      .select(ct.listSelect ?? '*', { count: 'exact' })
      .order(dbSortField, { ascending: sortDir === 'asc' })
      .range(from, to);

    if (debouncedSearch) {
      query = query.ilike(ct.titleField, `%${debouncedSearch}%`);
    }

    for (const f of ct.fields.filter((x) => x.filterable && !x.virtual)) {
      const val = filters[f.name];
      if (val === undefined || val === '' || val === null) continue;
      if (f.type === 'select' || f.type === 'boolean') {
        query = query.eq(f.name, val as string | boolean);
      } else if (f.type === 'datetime' || f.type === 'date') {
        const range = val as DateRange;
        if (range.from) query = query.gte(f.name, range.from);
        if (range.to) query = query.lte(f.name, range.to);
      } else if (f.type === 'number') {
        const range = val as NumberRange;
        if (range.min !== undefined) query = query.gte(f.name, range.min);
        if (range.max !== undefined) query = query.lte(f.name, range.max);
      } else if (f.type === 'text') {
        query = query.ilike(f.name, `%${val as string}%`);
      }
    }

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
    const configs = [
      'venues',
      'events',
      'personalities',
      'news_articles',
      'cities',
      'countries',
      'unified_tags',
      'marketplace_listings',
      'community_groups',
      'hotels',
      'queer_villages',
      'cms_pages',
    ]
      .map((id) => getContentType(id))
      .filter(Boolean) as ContentTypeConfig[];

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
    loadItems();
  }, [loadItems]);

  // Reset page on search/filter change
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [debouncedSearch, filters]);

  // On content type change, restore persisted state (or defaults) and reset
  const lastTypeRef = useRef<string | undefined>(contentTypeId);
  useEffect(() => {
    if (lastTypeRef.current === contentTypeId) return;
    lastTypeRef.current = contentTypeId;
    setPage(0);
    setSelected(new Set());
    const p = persistKey ? loadPersistedState(persistKey) : null;
    setSortField(p?.sortField ?? config?.defaultSort?.field ?? 'updated_at');
    setSortDir(p?.sortDir ?? config?.defaultSort?.dir ?? 'desc');
    setFilters(p?.filters ?? {});
    setHiddenColumns(p?.hiddenColumns ?? []);
  }, [contentTypeId, persistKey, config]);

  // Clear selection on page change
  useEffect(() => {
    setSelected(new Set());
  }, [page]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'title' ? 'asc' : 'desc');
    }
    setPage(0);
  }

  const allVisibleIds = useMemo(
    () => items.map((it) => `${it.contentType}-${it.id}`),
    [items],
  );
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

  function setFilter(name: string, value: FilterValue) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '' || value === null) {
        delete next[name];
      } else {
        next[name] = value;
      }
      return next;
    });
  }

  function clearFilters() {
    setFilters({});
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
    sortField,
    sortDir,
    filters,
    setFilter,
    clearFilters,
    hiddenColumns,
    setHiddenColumns,
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

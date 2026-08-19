import {
  tableFeatures,
  columnGroupingFeature,
  columnVisibilityFeature,
  rowExpandingFeature,
  rowSortingFeature,
  createExpandedRowModel,
  createGroupedRowModel,
  createSortedRowModel,
} from '@tanstack/react-table';

/**
 * The one feature set every admin table is built from.
 *
 * TanStack Table v9 no longer bundles features implicitly — each one has to be
 * registered here, and the registered set becomes a *type* parameter that
 * threads through `ColumnDef`, `Header` and `createColumnHelper`. Keeping a
 * single exported object means the ~30 admin pages that render through
 * `AdminDataTable` share one type and one bundle cost.
 *
 * Deliberately NOT `stockFeatures`: that re-bundles all 16 features and throws
 * away the tree-shaking v9 exists to enable. These four are what
 * `AdminDataTable` actually drives — sorting, column visibility, grouping and
 * the expansion grouping implies. Add a feature here (with its row-model slot)
 * when the table starts using it, not before.
 */
export const adminTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  columnGroupingFeature,
  rowExpandingFeature,
  sortedRowModel: createSortedRowModel(),
  groupedRowModel: createGroupedRowModel(),
  expandedRowModel: createExpandedRowModel(),
});

/** Type companion to {@link adminTableFeatures} — the `TFeatures` arg everywhere. */
export type AdminTableFeatures = typeof adminTableFeatures;

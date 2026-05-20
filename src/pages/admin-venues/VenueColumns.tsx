import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { createColumnHelper } from '@tanstack/react-table';
import { Star, MapPin, Check } from 'lucide-react';
import type { AdminColumnMeta } from '@/components/admin/data-table/types';
import type { VenueRow } from './types';

const columnHelper = createColumnHelper<VenueRow>();

export function useVenueColumns() {
  return useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <div>
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            {info.row.original.address && (
              <p className="text-xs text-muted-foreground">
                {info.row.original.address}
              </p>
            )}
          </div>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: (info) => {
          const val = info.getValue();
          return val ? (
            <Badge variant="secondary">{val.charAt(0).toUpperCase() + val.slice(1)}</Badge>
          ) : (
            '-'
          );
        },
        meta: { serverSortable: true, serverFilterable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('city', {
        header: 'City',
        cell: (info) => {
          const val = info.getValue();
          return val ? (
            <div className="flex items-center gap-1">
              <MapPin style={{ height: 12, width: 12 }} />
              {val}
            </div>
          ) : (
            '-'
          );
        },
        meta: { serverSortable: true, serverFilterable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('country', {
        header: 'Country',
        cell: (info) => info.getValue() || '-',
        meta: { serverSortable: true, defaultVisible: false, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('is_featured', {
        header: 'Featured',
        cell: (info) =>
          info.getValue() ? (
            <Badge style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground) / 0.7)' }}>
              <Star style={{ height: 12, width: 12, marginRight: 4 }} />
              Featured
            </Badge>
          ) : null,
        meta: { serverSortable: true, serverFilterable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('verified', {
        header: 'Verified',
        cell: (info) =>
          info.getValue() ? (
            <Badge style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' }}>
              <Check style={{ height: 12, width: 12, marginRight: 4 }} />
              Verified
            </Badge>
          ) : null,
        meta: { serverSortable: true, serverFilterable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('foursquare_rating', {
        header: 'Rating',
        cell: (info) => {
          const val = info.getValue();
          return val ? `${val.toFixed(1)}/10` : '-';
        },
        meta: { serverSortable: true, defaultVisible: false, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('price_range', {
        header: 'Price',
        cell: (info) => {
          const val = info.getValue();
          return val ? '$'.repeat(val) : '-';
        },
        meta: { serverSortable: true, defaultVisible: false, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('created_at', {
        header: 'Created',
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
        meta: { serverSortable: true, defaultVisible: false, hideable: true } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );
}

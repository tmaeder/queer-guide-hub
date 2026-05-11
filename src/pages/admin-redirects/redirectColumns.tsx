import { Badge } from '@/components/ui/badge';
import type { AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { Link2, ArrowRight, Clock } from 'lucide-react';
import type { RedirectRow } from './types';

const columnHelper = createColumnHelper<RedirectRow>();

export function getRedirectColumns() {
  return [
    columnHelper.accessor('type', {
      header: 'Type',
      cell: (info) => (
        <Badge variant={info.getValue() === 'SHORT' ? 'default' : 'secondary'}>
          {info.getValue() === 'SHORT' ? (
            <Link2 style={{ height: 12, width: 12, marginRight: 4 }} />
          ) : (
            <ArrowRight style={{ height: 12, width: 12, marginRight: 4 }} />
          )}
          {info.getValue()}
        </Badge>
      ),
      meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
    }),
    columnHelper.accessor('slug', {
      header: 'Source',
      cell: (info) => {
        const row = info.row.original;
        const source = row.type === 'SHORT' ? `/go/${row.slug}` : row.source_path;
        return (
          <div className="flex items-center" style={{ gap: 4 }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {source}
            </span>
            {(row.start_at || row.end_at) && (
              <Clock style={{ height: 12, width: 12, color: '#888' }} />
            )}
          </div>
        );
      },
      meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
    }),
    columnHelper.accessor('target', {
      header: 'Target',
      cell: (info) => (
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            maxWidth: 240,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
          }}
        >
          {info.getValue()}
        </span>
      ),
      meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
    }),
    columnHelper.accessor('status_code', {
      header: 'Code',
      cell: (info) => (
        <Badge
          variant="outline"
          style={{ color: info.getValue() === 301 ? '#16a34a' : '#ca8a04' }}
        >
          {info.getValue()}
        </Badge>
      ),
      meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
    }),
    columnHelper.accessor('click_count', {
      header: 'Clicks',
      cell: (info) => {
        const row = info.row.original;
        return (
          <span>
            {info.getValue().toLocaleString()}
            {row.click_limit ? <span style={{ color: '#888' }}> / {row.click_limit}</span> : null}
          </span>
        );
      },
      meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
    }),
    columnHelper.accessor('is_enabled', {
      header: 'Enabled',
      cell: (info) => (
        <Badge variant={info.getValue() ? 'default' : 'secondary'}>
          {info.getValue() ? 'On' : 'Off'}
        </Badge>
      ),
      meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
    }),
    columnHelper.accessor('created_at', {
      header: 'Created',
      cell: (info) => new Date(info.getValue()).toLocaleDateString(),
      meta: {
        serverSortable: true,
        defaultVisible: false,
        hideable: true,
      } satisfies AdminColumnMeta,
    }),
  ];
}

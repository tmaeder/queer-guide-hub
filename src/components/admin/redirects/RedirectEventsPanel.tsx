import { useEffect, useState } from 'react';
import { useRedirects, type RedirectEvent } from '@/hooks/useRedirects';
import {
  AdminSimpleTable,
  type AdminSimpleColumn,
} from '@/components/admin/primitives/AdminSimpleTable';
import { formatDateTime } from '@/lib/format';

/**
 * Click analytics for one redirect, rendered inside the registry editor.
 *
 * The standalone redirects page opened this in its own dialog from a row
 * action. Row actions on the registry are plain callbacks in a static config
 * and cannot own React state, and this data is per-record anyway — so the
 * editor is where it belongs.
 */

interface RedirectEventsPanelProps {
  redirectId: string;
}

const EVENT_COLUMNS: readonly AdminSimpleColumn<RedirectEvent>[] = [
  {
    key: 'when',
    header: 'When',
    cellClassName: 'whitespace-nowrap text-muted-foreground',
    render: (e) => formatDateTime(e.ts),
  },
  { key: 'path', header: 'Path', render: (e) => e.path },
  { key: 'country', header: 'Country', render: (e) => e.country ?? '—' },
  {
    key: 'referer',
    header: 'Referer',
    cellClassName: 'max-w-60',
    // The title lived on the <td>; a cell owns no attributes here, so the
    // truncation and the tooltip move together onto one block child.
    render: (e) => (
      <span className="block truncate" title={e.referer ?? undefined}>
        {e.referer ?? '—'}
      </span>
    ),
  },
  { key: 'status', header: 'Status', render: (e) => e.status },
];

export function RedirectEventsPanel({ redirectId }: RedirectEventsPanelProps) {
  const { fetchEvents } = useRedirects();
  // Store the id alongside the rows rather than blanking state at the top of the
  // effect: a synchronous setState there is both a lint error and an extra
  // render. A result whose id no longer matches simply reads as "still loading".
  const [loaded, setLoaded] = useState<{ id: string; rows: RedirectEvent[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchEvents(redirectId).then((rows) => {
      // The editor can move to another record before this resolves; without the
      // guard the previous redirect's clicks would render under the new one.
      if (!cancelled) setLoaded({ id: redirectId, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [redirectId, fetchEvents]);

  const events = loaded?.id === redirectId ? loaded.rows : null;

  return (
    <AdminSimpleTable
      caption="Redirect hit events"
      columns={EVENT_COLUMNS}
      rows={events ?? []}
      rowKey={(e) => String(e.id)}
      isLoading={events === null}
      emptyNoun="clicks"
    />
  );
}

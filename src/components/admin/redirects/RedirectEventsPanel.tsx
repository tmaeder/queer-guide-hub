import { useEffect, useState } from 'react';
import { useRedirects, type RedirectEvent } from '@/hooks/useRedirects';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { Skeleton } from '@/components/ui/skeleton';
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

  if (events === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (events.length === 0) {
    return <AdminEmpty noun="clicks" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4 font-semibold">When</th>
            <th className="py-2 pr-4 font-semibold">Path</th>
            <th className="py-2 pr-4 font-semibold">Country</th>
            <th className="py-2 pr-4 font-semibold">Referer</th>
            <th className="py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-border/50">
              <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                {formatDateTime(e.ts)}
              </td>
              <td className="py-2 pr-4">{e.path}</td>
              <td className="py-2 pr-4">{e.country ?? '—'}</td>
              <td className="py-2 pr-4 max-w-[240px] truncate" title={e.referer ?? undefined}>
                {e.referer ?? '—'}
              </td>
              <td className="py-2">{e.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

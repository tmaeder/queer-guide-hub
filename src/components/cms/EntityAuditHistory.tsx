/**
 * EntityAuditHistory — compact "who changed this" panel for a single entity,
 * mounted in the CMS editor. Reads cms_audit_log via useCMSAudit.loadForContent
 * and renders actor · action · relative time using the shared format helpers.
 *
 * Deliberately lightweight (not the page-shaped AuditLog) so it sits cleanly
 * inside the editor. Now that both CMS saves and bulk data-table edits write
 * audit entries, this surfaces a real trail.
 */
import { useEffect, useState } from 'react';
import { History, ChevronDown, ChevronRight } from 'lucide-react';
import { useCMSAudit } from '@/hooks/useCMSAudit';
import { formatRelativeTime, formatAction } from '@/lib/audit-format';

interface EntityAuditHistoryProps {
  sourceTable: string;
  sourceId: string;
}

export function EntityAuditHistory({ sourceTable, sourceId }: EntityAuditHistoryProps) {
  const { entries, loading, loadForContent } = useCMSAudit();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) loadForContent(sourceTable, sourceId);
  }, [open, sourceTable, sourceId, loadForContent]);

  return (
    <div className="rounded-element border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-13 font-medium">
          <History size={14} className="text-muted-foreground" aria-hidden />
          History
        </span>
        {open ? (
          <ChevronDown size={14} className="text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground" aria-hidden />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-2">
          {loading ? (
            <p className="text-2xs text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-2xs text-muted-foreground">No history yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4">
                  <span className="min-w-0 truncate text-2xs">
                    <span className="font-medium">
                      {e.actor?.display_name || e.actor?.email || 'system'}
                    </span>{' '}
                    <span className="text-muted-foreground">{formatAction(e.action)}</span>
                  </span>
                  <span className="flex-shrink-0 text-2xs text-muted-foreground">
                    {formatRelativeTime(e.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

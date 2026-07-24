/**
 * AdminInbox — Unified work surface (Phase β D2).
 * Renders the TriageView across all queues with SLA-bucket framing.
 * Absorbed /admin/review (IA P2): `?queue=` (or legacy `?tab=`) scopes the
 * view to one queue; without params it shows everything.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { TriageView } from '@/components/admin/triage/TriageView';
import { useRegisterAdminCommandAction } from '@/components/admin/command-palette/useAdminCommandActions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Legacy /admin/review?tab= vocabulary → TriageView queue types. */
const TAB_TO_QUEUE: Record<string, string> = {
  staging: 'staging',
  moderation: 'moderation',
  submissions: 'submissions',
  content: 'content',
  tags: 'tags',
  duplicates: 'duplicates',
  automation: 'automation',
  'news-quality': 'news-quality',
  'entity-links': 'entity-links',
};

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'J / K', label: 'Next / previous item' },
  { keys: 'A', label: 'Approve' },
  { keys: 'R', label: 'Reject' },
  { keys: 'S', label: 'Skip' },
  { keys: 'F', label: 'Flag' },
  { keys: 'U', label: 'Undo last approve / reject' },
  { keys: 'Space', label: 'Select / deselect' },
  { keys: '?', label: 'Show this help' },
];

export default function AdminInbox() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showHelp, setShowHelp] = useState(false);

  const tab = searchParams.get('tab');
  const queue = searchParams.get('queue');
  const initialQueue = queue ?? (tab ? TAB_TO_QUEUE[tab] : undefined) ?? undefined;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '?') {
        e.preventDefault();
        setShowHelp((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useRegisterAdminCommandAction({
    id: 'inbox.automation',
    label: 'Open Automation',
    keywords: 'rules cron audit',
    perform: () => navigate('/admin/automation'),
  });

  useEffect(() => {
    document.title = 'Inbox · Admin · Queer Guide';
  }, []);

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-4 border-b border-border bg-background">
        <h1 className="text-headline font-bold leading-tight">Inbox</h1>
        <p className="text-13 text-muted-foreground mt-1">
          Everything that needs you, across queues. Sorted by priority. Press{' '}
          <kbd className="px-1 border border-border bg-muted text-2xs">J</kbd>/
          <kbd className="px-1 border border-border bg-muted text-2xs">K</kbd> to navigate,{' '}
          <kbd className="px-1 border border-border bg-muted text-2xs">A</kbd> approve,{' '}
          <kbd className="px-1 border border-border bg-muted text-2xs">R</kbd> reject. Press{' '}
          <kbd className="px-1 border border-border bg-muted text-2xs">?</kbd> for all shortcuts.
        </p>
      </header>
      <div className="flex-1 min-h-0">
        <TriageView initialQueueType={initialQueue} />
      </div>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <dl className="flex flex-col gap-2">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between gap-4">
                <dt className="text-13 text-muted-foreground">{s.label}</dt>
                <dd>
                  <kbd className="rounded-badge border border-border bg-muted px-1.5 py-0.5 text-2xs">
                    {s.keys}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}

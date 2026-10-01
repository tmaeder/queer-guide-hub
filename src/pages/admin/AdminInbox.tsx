/**
 * AdminInbox — Unified work surface (Phase β D2).
 * Renders the TriageView across all queues with SLA-bucket framing.
 * Absorbed /admin/review (IA P2): `?queue=` (or legacy `?tab=`) scopes the
 * view to one queue; without params it shows everything.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { TriageView } from '@/components/admin/triage/TriageView';
import { AutomationStatusCard } from '@/components/admin/AutomationStatusCard';
import { useRegisterAdminCommandAction } from '@/components/admin/command-palette/useAdminCommandActions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Keyboard } from 'lucide-react';

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border bg-background px-4 py-2 md:px-6">
        <div className="flex min-w-0 items-center gap-4">
          {/* eslint-disable-next-line queerguide/admin-ui-primitives -- compact app-shell title */}
          <h1 className="text-title font-bold leading-none tracking-tight">Inbox</h1>
          <AutomationStatusCard compact />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowHelp(true)}
            aria-keyshortcuts="?"
            className="shrink-0 text-muted-foreground"
          >
            <Keyboard className="mr-1.5 size-4" aria-hidden="true" />
            Shortcuts
            <kbd className="ml-2 rounded-badge border border-border bg-muted px-1.5 py-0.5 text-2xs">
              ?
            </kbd>
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
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

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
      <header className="shrink-0 px-4 py-4 border-b border-border bg-background">
        {/* `Inbox`, exactly, and nothing appended: `e2e/admin-inbox-renders.spec.ts`
            matches { name: 'Inbox', exact: true } and is the ONLY regression guard for
            the unfiltered union, which was down for six weeks behind an error banner.
            A count in this string breaks it.

            The disable below must stay on the line IMMEDIATELY above the <h1> —
            `eslint-disable-next-line` means the next line, so a comment inserted
            between them silently un-suppresses the rule. */}
        {/* eslint-disable-next-line queerguide/admin-ui-primitives --
            The inbox is a full-height app shell, not a standard page: this
            header is a dense sticky bar (px-4 py-4, its own border) sitting
            above a split pane. AdminPageHeader's mb-6/pb-6 block layout would
            push the list below the fold. */}
        <h1 className="text-headline font-bold leading-tight">Inbox</h1>
        {/* The keyboard legend that used to live here is GONE, and so is the one in
            TriageView's empty state. There were three copies; the `?` dialog below is
            the only one that works when an item is selected — i.e. when a reviewer
            would want the reminder — so it is the one that survives. */}
        <p className="text-13 text-muted-foreground mt-1">
          Work across queues, sorted by priority. The card below separates what the nightly jobs
          clear from what is yours. Press{' '}
          <kbd className="px-1 border border-border bg-muted text-2xs">?</kbd> for shortcuts.
        </p>
      </header>
      {/* <AutomationStatusCard/> STAYS, and the attempt to remove it is worth recording.
          It was taken out as chrome above a decision surface — 110-150px on a pane whose
          action bar was below the fold. Two things overturned that:

          1. `AdminGovernance` now bounds the triage box, so this card costs pane height
             rather than pushing the action bar off-screen. The stronger half of the
             argument for removing it was fixed elsewhere.
          2. The replacement — a machine/human split on `TriageView`'s header row — was
             built and then deleted, because `needs_human` is a CROSS-QUEUE sum while
             that header's `total` is the FILTERED queue. It rendered "4,710 need you"
             beside a total of 3,997: two different denominators side by side, which is
             a worse number than the bare one it replaced.

          So the framing stays where both halves come from one population. Do not move
          this into the header without solving the denominator problem first. */}
      <div className="shrink-0 px-4 pt-4">
        <AutomationStatusCard />
      </div>
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

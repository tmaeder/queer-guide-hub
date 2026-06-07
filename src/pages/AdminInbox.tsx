/**
 * AdminInbox — Unified work surface (Phase β D2).
 * Renders the TriageView across all queues with SLA-bucket framing.
 * Default landing target for moderators; the dedicated /admin/review keeps
 * the per-queue lens.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { TriageView } from '@/components/admin/triage/TriageView';
import { useRegisterAdminCommandAction } from '@/components/admin/command-palette/useAdminCommandActions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'J / K', label: 'Next / previous item' },
  { keys: 'A', label: 'Approve' },
  { keys: 'R', label: 'Reject' },
  { keys: 'S', label: 'Skip' },
  { keys: 'F', label: 'Flag' },
  { keys: 'Space', label: 'Select / deselect' },
  { keys: '?', label: 'Show this help' },
];

export default function AdminInbox() {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);

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
    id: 'inbox.review',
    label: 'Open Review Queue',
    keywords: 'review triage moderation',
    perform: () => navigate('/admin/review'),
  });

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
      <header className="px-4 py-3 border-b border-border bg-background">
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
        <TriageView />
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

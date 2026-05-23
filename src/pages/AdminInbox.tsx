/**
 * AdminInbox — Unified work surface (Phase β D2).
 * Renders the TriageView across all queues with SLA-bucket framing.
 * Default landing target for moderators; the dedicated /admin/review keeps
 * the per-queue lens.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { TriageView } from '@/components/admin/triage/TriageView';
import { useRegisterAdminCommandAction } from '@/components/admin/command-palette/useAdminCommandActions';

export default function AdminInbox() {
  const navigate = useNavigate();

  useRegisterAdminCommandAction({
    id: 'inbox.review',
    label: 'Open Review Queue',
    keywords: 'review triage moderation',
    perform: () => navigate('/admin/review'),
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
          <kbd className="px-1 border border-border bg-muted text-2xs">R</kbd> reject.
        </p>
      </header>
      <div className="flex-1 min-h-0">
        <TriageView />
      </div>
    </div>
  );
}

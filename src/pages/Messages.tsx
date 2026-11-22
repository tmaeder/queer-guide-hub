import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { AuthGate } from '@/components/layout/AuthGate';
import { PageContainer } from '@/components/layout/PageContainer';
import { MessagingInterface } from '@/components/messaging/MessagingInterface';
import { InboxFilterChips } from '@/components/messaging/InboxFilterChips';
import { useMeta } from '@/hooks/useMeta';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import type { InboxFilter } from '@/hooks/useInboxFeed';

const FILTERS: InboxFilter[] = ['all', 'chats', 'mail', 'alerts', 'trips', 'matches', 'groups'];

function parseInboxFilter(value: string | null): InboxFilter {
  return FILTERS.includes(value as InboxFilter) ? (value as InboxFilter) : 'all';
}

/**
 * /messages — the inbox on its own page (moved out of /hub 2026-11-22).
 * Chats, mail, trip mail and alerts in one rail + reading pane. The active
 * filter lives in `?filter=` so refresh and back keep it; `?conversation=`,
 * `?email=`, `?tripmail=` and `?compose=` deep links are read by
 * MessagingInterface.
 */
export default function Messages() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseInboxFilter(searchParams.get('filter'));

  const navigate = useLocalizedNavigate();

  useMeta({ title: t('inbox.pageTitle', 'Messages'), noIndex: true });

  // Pre-2026-07 deep links: ?tab=people was the address book, now /hub/people.
  const wantsPeople = searchParams.get('tab') === 'people';
  useEffect(() => {
    if (wantsPeople) navigate('/hub/people', { replace: true });
  }, [wantsPeople, navigate]);

  const setFilter = (next: InboxFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('filter');
    else params.set('filter', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <PageContainer flush className="py-4 md:py-6">
      <AuthGate
        title={t('inbox.pageTitle', 'Messages')}
        description={t('inbox.signInDesc', 'Sign in to read your messages, mail and alerts.')}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h1 className="font-display text-headline leading-none">
              {t('inbox.pageTitle', 'Messages')}
            </h1>
            <InboxFilterChips value={filter} onChange={setFilter} />
          </div>
          {/* Fill the viewport below the pinned header; on phones also clear
              the floating dock. min-h keeps the split usable on short screens. */}
          <MessagingInterface
            filter={filter}
            className="h-[calc(100dvh-var(--header-pinned-bottom)-12rem)] min-h-[420px] md:h-[calc(100dvh-var(--header-pinned-bottom)-8rem)]"
          />
        </div>
      </AuthGate>
    </PageContainer>
  );
}

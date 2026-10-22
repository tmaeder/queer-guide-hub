import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';

interface Invitation {
  inviteId: string;
  token: string;
  group: { name: string };
}

/** Signed-in review destination; email contains only the generic groups URL. */
export function GroupInvitationReview() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [after, setAfter] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const list = useQuery({
    queryKey: ['group-invitation-review', user?.id, after],
    gcTime: 0,
    placeholderData: undefined,
    enabled: Boolean(user),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        `email-subscriptions?action=group_invitations${after ? `&after=${after}` : ''}`,
        { method: 'GET' },
      );
      if (
        error ||
        data?.userId !== user?.id ||
        !Array.isArray(data.invitations) ||
        data.invitations.length > 20 ||
        (data.next !== null &&
          (typeof data.next !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.next)))
      )
        throw new Error('Invitations unavailable');
      const invitations: Invitation[] = data.invitations;
      if (
        invitations.some(
          (i) =>
            !i ||
            typeof i.inviteId !== 'string' ||
            typeof i.token !== 'string' ||
            !i.token ||
            i.token.length > 4096 ||
            typeof i.group?.name !== 'string',
        )
      ) {
        throw new Error('Invalid invitation response');
      }
      return { invitations, next: data.next as string | null };
    },
  });
  if (!user) return null;
  return (
    <section
      aria-labelledby="group-invitation-review-heading"
      className="space-y-4 border-t border-border pt-6"
    >
      <h2 id="group-invitation-review-heading" className="text-headline font-semibold">
        {t('groups.invitationReview.title', 'Group invitations')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t(
          'groups.invitationReview.description',
          'Review an invitation before choosing to join. Opening this list does not accept an invitation.',
        )}
      </p>
      {list.isPending ? (
        <p role="status">{t('groups.invitationReview.loading', 'Loading invitations…')}</p>
      ) : list.isError ? (
        <div role="alert" className="space-y-4">
          <p>{t('groups.invitationReview.error', 'Invitations could not load.')}</p>
          <Button variant="outline" onClick={() => void list.refetch()}>
            {t('common.retry', 'Retry')}
          </Button>
        </div>
      ) : !list.data?.invitations.length ? (
        <p className="text-sm">
          {t('groups.invitationReview.empty', 'You have no pending group invitations.')}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {list.data.invitations.map((i) => (
              <li
                key={i.inviteId}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{i.group.name}</span>
                <Button variant="outline" asChild>
                  <LocalizedLink
                    to={`/hub/groups/invite/${encodeURIComponent(i.token)}`}
                    aria-label={t(
                      'groups.invitationReview.reviewNamed',
                      'Review invitation to {{name}}',
                      { name: i.group.name },
                    )}
                  >
                    {t('groups.invitationReview.review', 'Review invitation')}
                  </LocalizedLink>
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {(history.length > 0 || list.data?.next) && (
        <div className="flex flex-wrap gap-4">
          <Button
            variant="outline"
            disabled={!history.length || list.isFetching}
            onClick={() => {
              setAfter(history[history.length - 1]);
              setHistory(history.slice(0, -1));
            }}
          >
            {t('groups.invitationReview.previous', 'Previous invitations')}
          </Button>
          <Button
            variant="outline"
            disabled={!list.data?.next || list.isFetching || list.isError}
            onClick={() => {
              if (list.data?.next) {
                setHistory([...history, after]);
                setAfter(list.data.next);
              }
            }}
          >
            {t('groups.invitationReview.next', 'Next invitations')}
          </Button>
        </div>
      )}
    </section>
  );
}

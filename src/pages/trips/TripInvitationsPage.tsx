import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink as Link } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { qk } from '@/lib/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { changeTripInvitation, loadTripInvitations } from '@/lib/tripInvitations';
export default function TripInvitationsPage() {
  const { user, loading } = useAuth(),
    { t } = useTranslation(),
    { toast } = useToast(),
    client = useQueryClient(),
    navigate = useLocalizedNavigate();
  const key = qk.trip.invitationsFor(user?.id);
  const list = useQuery({
    queryKey: key,
    queryFn: () => loadTripInvitations(),
    enabled: !!user,
    retry: false,
  });
  const response = useMutation({
    mutationFn: async (input: { id: string; decision: 'accept' | 'decline' }) => {
      const result = (await changeTripInvitation({
        action: 'respond',
        invitation_id: input.id,
        decision: input.decision,
      })) as { trip_id: string; status: string };
      return result;
    },
    onSuccess: async (result) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: qk.trip.all() }),
      ]);
      if (result.status === 'accepted') navigate(`/trips/${result.trip_id}`);
    },
    onError: () => {
      void list.refetch();
      toast({
        title: t(
          'trips.invitations.expired',
          'This invitation is no longer available. Refresh and retry.',
        ),
        variant: 'destructive',
      });
    },
  });
  return (
    <PageContainer size="reading" className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('trips.invitations.title', 'Trip invitations')}</h1>
      <p className="text-muted-foreground">
        {t(
          'trips.invitations.review',
          'Choose whether to join a trip. Opening this page does not accept an invitation.',
        )}
      </p>
      {loading ? (
        <p role="status">{t('common.loading', 'Loading…')}</p>
      ) : !user ? (
        <Button asChild>
          <Link to="/auth?redirect=%2Ftrips%2Finvitations">
            {t('trips.invitations.signIn', 'Sign in to review invitations')}
          </Link>
        </Button>
      ) : list.isPending ? (
        <p role="status">{t('trips.invitations.loading', 'Loading invitations…')}</p>
      ) : list.isError ? (
        <div role="alert" className="space-y-4">
          <p>{t('trips.invitations.loadFailed', 'Invitations could not load.')}</p>
          <Button variant="outline" onClick={() => void list.refetch()}>
            {t('common.retry', 'Retry')}
          </Button>
        </div>
      ) : list.data.invitations.length === 0 ? (
        <p>{t('trips.invitations.empty', 'You have no pending trip invitations.')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.data.invitations.map((i) => (
            <li key={i.id} className="space-y-4 py-6">
              <div>
                <h2 className="break-words text-lg font-semibold">{i.trip_title}</h2>
                <p className="break-words text-sm text-muted-foreground">
                  {t('trips.invitations.from', 'Invited by {{name}}', { name: i.inviter_name })}
                </p>
                <p className="text-sm">
                  {i.role === 'editor'
                    ? t('trips.invitations.editor', 'Edit trip')
                    : t('trips.invitations.viewer', 'View trip')}
                </p>
              </div>
              <div className="flex flex-wrap gap-4">
                <Button
                  disabled={response.isPending || !i.actionable}
                  onClick={() => response.mutate({ id: i.id, decision: 'accept' })}
                >
                  {t('trips.invitations.accept', 'Accept invitation')}
                </Button>
                <Button
                  variant="outline"
                  disabled={response.isPending || !i.actionable}
                  onClick={() => response.mutate({ id: i.id, decision: 'decline' })}
                >
                  {t('trips.invitations.decline', 'Decline invitation')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button asChild variant="outline">
        <Link to="/hub/plans">{t('trips.invitations.plans', 'Open plans')}</Link>
      </Button>
    </PageContainer>
  );
}

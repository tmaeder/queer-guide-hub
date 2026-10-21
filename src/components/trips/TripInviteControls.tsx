import { useAuth } from '@/hooks/useAuth';
import { qk } from '@/lib/queryKeys';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeTripInvitation, loadTripInvitations } from '@/lib/tripInvitations';
import { useToast } from '@/hooks/use-toast';
export function TripInviteControls({ tripId, enabled }: { tripId: string; enabled: boolean }) {
  const { user } = useAuth();
  const { t } = useTranslation(),
    { toast } = useToast(),
    client = useQueryClient();
  const [username, setUsername] = useState(''),
    [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const key = [...qk.trip.facet(tripId, 'invitations'), user?.id];
  const list = useQuery({
    queryKey: key,
    queryFn: () => loadTripInvitations(tripId),
    enabled,
    retry: false,
  });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => changeTripInvitation(body),
    onSuccess: async () => {
      setUsername('');
      await client.invalidateQueries({ queryKey: key });
      toast({ title: t('trips.invitations.updated', 'Invitation updated') });
    },
    onError: (error) => {
      void list.refetch();
      toast({
        title:
          error.message === 'invitation_rate_limited'
            ? t(
                'trips.invitations.rateLimit',
                'You have reached the invitation limit. Try again in an hour.',
              )
            : t(
                'trips.invitations.failed',
                'Invitation unavailable. Check the username and your access, then retry.',
              ),
        variant: 'destructive',
      });
    },
  });
  if (!enabled) return null;
  if (list.isPending)
    return <p role="status">{t('trips.invitations.loading', 'Loading invitations…')}</p>;
  if (list.isError)
    return (
      <div role="alert">
        <p>{t('trips.invitations.loadFailed', 'Invitations could not load.')}</p>
        <Button variant="outline" onClick={() => void list.refetch()}>
          {t('common.retry', 'Retry')}
        </Button>
      </div>
    );
  if (!list.data.can_invite) return null;
  return (
    <section
      className="space-y-4 border-b border-border pb-6"
      aria-labelledby="trip-invite-heading"
    >
      <h3 id="trip-invite-heading" className="font-semibold">
        {t('trips.invitations.inviteMember', 'Invite a member')}
      </h3>
      <p className="text-sm text-muted-foreground">
        {t(
          'trips.invitations.explainer',
          'Invite an existing Queer Guide member by username. They choose whether to join. Email follows their preferences.',
        )}
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ action: 'create', trip_id: tripId, username: username.trim(), role });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="trip-invite-username">
            {t('trips.invitations.username', 'Member username')}
          </Label>
          <Input
            id="trip-invite-username"
            placeholder={t('trips.invitations.usernameExample', 'e.g. morgan')}
            value={username}
            maxLength={40}
            disabled={update.isPending}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="trip-invite-role">
            {t('trips.invitations.role', 'Access after acceptance')}
          </Label>
          <select
            id="trip-invite-role"
            className="h-10 w-full rounded-element border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={role}
            disabled={update.isPending}
            onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}
          >
            <option value="viewer">{t('trips.invitations.viewer', 'View trip')}</option>
            <option value="editor">{t('trips.invitations.editor', 'Edit trip')}</option>
          </select>
        </div>
        <Button type="submit" disabled={update.isPending || username.trim().length < 2}>
          {t('trips.invitations.send', 'Send invitation')}
        </Button>
      </form>
      {list.data.invitations.length > 0 && (
        <ul className="space-y-4">
          {list.data.invitations.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-4">
              <span className="min-w-0 break-words text-sm">
                {i.username ?? t('trips.invitations.member', 'Member')} ·{' '}
                {i.role === 'editor'
                  ? t('trips.invitations.editor', 'Edit trip')
                  : t('trips.invitations.viewer', 'View trip')}
                {!i.actionable &&
                  ` · ${t('trips.invitations.noLongerAvailable', 'No longer available')}`}
              </span>
              {i.can_revoke && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ action: 'revoke', invitation_id: i.id })}
                >
                  {t('trips.invitations.revoke', 'Revoke invitation')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

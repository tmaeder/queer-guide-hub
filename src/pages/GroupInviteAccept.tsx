import { useParams } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Users, UserPlus, Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useResolveGroupInvite, useGroupInvites } from '@/hooks/useGroupInvites';
import { useTranslation } from 'react-i18next';

export default function GroupInviteAccept() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { data: invite, isLoading } = useResolveGroupInvite(token);
  const { acceptInvite, isAccepting } = useGroupInvites();

  const handleAccept = async () => {
    if (!token || !invite) return;
    try {
      await acceptInvite(token);
      navigate(`/groups/${invite.group.id}`);
    } catch {
      /* toast handled in hook */
    }
  };

  return (
    <div className="container mx-auto max-w-xl py-12 md:py-20 px-4">
      {isLoading ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-32 rounded-element" />
          </CardContent>
        </Card>
      ) : !invite || invite.status !== 'pending' ? (
        <EmptyState
          icon={Lock}
          title={
            invite?.status === 'accepted'
              ? t('groups.inviteAccept.usedTitle', 'This invite was already used')
              : t('groups.inviteAccept.expiredTitle', 'This invite is no longer valid')
          }
          description={t(
            'groups.inviteAccept.expiredDescription',
            'Ask whoever invited you to send a fresh link, or browse groups to find your people.',
          )}
          mood="neutral"
          primaryAction={{
            label: t('groups.inviteAccept.browse', 'Browse groups'),
            onClick: () => navigate('/community/groups'),
          }}
        />
      ) : invite.alreadyMember ? (
        <EmptyState
          icon={Users}
          title={t('groups.inviteAccept.alreadyTitle', "You're already in this group")}
          description={invite.group.name}
          mood="neutral"
          primaryAction={{
            label: t('groups.inviteAccept.openGroup', 'Open group'),
            onClick: () => navigate(`/groups/${invite.group.id}`),
          }}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
            <Avatar className="h-16 w-16">
              <AvatarImage src={invite.group.imageUrl || undefined} />
              <AvatarFallback>{invite.group.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold">{invite.group.name}</h1>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <Users size={14} />
                {t('groups.inviteAccept.members', '{{count}} members', {
                  count: invite.group.memberCount,
                })}
              </p>
            </div>
            {invite.invitedBy.displayName && (
              <p className="text-sm text-muted-foreground">
                {t('groups.inviteAccept.invitedBy', '{{name}} invited you to join', {
                  name: invite.invitedBy.displayName,
                })}
              </p>
            )}
            {invite.group.description && (
              <p className="text-sm text-muted-foreground">{invite.group.description}</p>
            )}

            {user ? (
              <Button variant="accent" onClick={handleAccept} disabled={isAccepting}>
                <UserPlus size={16} className="mr-2" />
                {isAccepting
                  ? t('groups.inviteAccept.joining', 'Joining...')
                  : t('groups.inviteAccept.accept', 'Accept invite')}
              </Button>
            ) : (
              <Button
                variant="accent"
                onClick={() => navigate(`/auth?redirect=/groups/invite/${token}`)}
              >
                {t('groups.inviteAccept.signIn', 'Sign in to join')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

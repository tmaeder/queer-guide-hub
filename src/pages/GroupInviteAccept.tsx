import { useParams } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Users, UserPlus, Lock } from '@/components/icons';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useResolveGroupInvite, useGroupInvites } from '@/hooks/useGroupInvites';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { HubNavBar } from '@/components/hub/HubNavBar';

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
      navigate(`/hub/groups/${invite.group.id}`);
    } catch {
      /* toast handled in hook */
    }
  };

  return (
    <>
      <HubNavBar />
      <PageContainer>
        <div className="mx-auto max-w-xl">
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
                onClick: () => navigate('/hub/groups'),
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
                onClick: () => navigate(`/hub/groups/${invite.group.id}`),
              }}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-4 p-6">
                <header className="flex items-start justify-between gap-4">
                  <h1 className="min-w-0 break-words font-display text-headline leading-tight">
                    {invite.group.name}
                  </h1>
                  <Avatar className="size-16 shrink-0">
                    <AvatarImage src={invite.group.imageUrl || undefined} />
                    <AvatarFallback>{invite.group.name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </header>
                {invite.group.description && (
                  <p className="whitespace-pre-line text-body-lg leading-relaxed">{invite.group.description}</p>
                )}
                <p className="flex flex-wrap items-center gap-2 text-13 text-muted-foreground">
                  <Users size={14} aria-hidden="true" />
                  {t('groups.inviteAccept.members', '{{count}} members', { count: invite.group.memberCount })}
                  {invite.group.isPrivate && (
                    <span className="inline-flex items-center gap-2">
                      <Lock size={14} aria-hidden="true" />
                      {t('groups.inviteAccept.private', 'Private group')}
                    </span>
                  )}
                </p>
                {invite.invitedBy.displayName && (
                  <p className="text-13 text-muted-foreground">
                    {t('groups.inviteAccept.invitedBy', '{{name}} invited you to join', {
                      name: invite.invitedBy.displayName,
                    })}
                  </p>
                )}

                {user ? (
                  <Button className="self-start" onClick={handleAccept} disabled={isAccepting}>
                    <UserPlus size={16} className="mr-2" />
                    {isAccepting
                      ? t('groups.inviteAccept.joining', 'Joining...')
                      : t('groups.inviteAccept.accept', 'Accept invite')}
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    className="self-start"
                    onClick={() => navigate(`/auth?redirect=/hub/groups/invite/${token}`)}
                  >
                    {t('groups.inviteAccept.signIn', 'Sign in to join')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PageContainer>
    </>
  );
}

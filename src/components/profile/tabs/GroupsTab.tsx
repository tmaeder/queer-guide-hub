import { GroupCard } from '@/components/groups/GroupCard';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { Users } from 'lucide-react';
import { sectionVisible, type ProfileLens } from '@/lib/profileLens';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useUserGroups } from '@/hooks/useUserGroups';
import { useGroups, type Group } from '@/hooks/useGroups';
import { useTranslation } from 'react-i18next';

interface GroupsTabProps {
  userId: string;
  isOwnProfile: boolean;
  lens?: ProfileLens;
  privacySettings?: Record<string, unknown>;
}

/** Groups this user belongs to — also a discovery surface (viewers can join). */
export function GroupsTab({ userId, isOwnProfile, lens = 'you', privacySettings = {} }: GroupsTabProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { groups: userGroups, isLoading } = useUserGroups(userId);
  // Hydrate against the viewer's own group list so join/leave state is accurate.
  const { groups: viewerGroups, joinGroup, requestJoin, leaveGroup, isJoining, isRequesting, isLeaving } =
    useGroups();

  const visible = sectionVisible(
    privacySettings.groups_visibility as string | undefined,
    isOwnProfile ? lens : 'community',
    'public',
  );
  if (!visible) {
    return (
      <p className="py-8 text-center text-13 text-muted-foreground">
        {t('profile.groups.hidden', 'Groups hidden at this visibility.')}{' '}
        {isOwnProfile && (
          <LocalizedLink to="/settings?section=privacy" className="underline">
            {t('profile.privacySettings', 'Privacy settings')}
          </LocalizedLink>
        )}
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <GroupCard key={i} loading />
        ))}
      </div>
    );
  }

  if (userGroups.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={
          isOwnProfile
            ? t('profile.groups.ownEmptyTitle', "You haven't joined any groups yet")
            : t('profile.groups.emptyTitle', 'No groups yet')
        }
        description={
          isOwnProfile
            ? t('profile.groups.ownEmptyDescription', 'Find a community that fits you.')
            : t('profile.groups.emptyDescription', 'This member has not joined any public groups.')
        }
        mood={isOwnProfile ? 'encouraging' : 'neutral'}
        primaryAction={
          isOwnProfile
            ? {
                label: t('profile.groups.find', 'Find groups'),
                onClick: () => navigate('/community/groups'),
              }
            : undefined
        }
      />
    );
  }

  const viewerById = new Map(viewerGroups.map((g) => [g.id, g]));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {userGroups.map((ug) => {
        const hydrated = viewerById.get(ug.id) ?? ({
          ...ug,
          rules: null,
          created_by: '',
          created_at: ug.joinedAt ?? '',
          updated_at: '',
        } as Group);
        return (
          <GroupCard
            key={ug.id}
            group={hydrated}
            isAuthenticated={!!user}
            onJoin={joinGroup}
            onRequestJoin={(id) => requestJoin({ groupId: id })}
            onLeave={leaveGroup}
            isJoining={isJoining}
            isRequesting={isRequesting}
            isLeaving={isLeaving}
          />
        );
      })}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Flag, Share2, Shield, User } from 'lucide-react';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { OverviewTab } from '@/components/profile/tabs/OverviewTab';
import { ContributionsTab } from '@/components/profile/tabs/ContributionsTab';
import { TravelTab } from '@/components/profile/tabs/TravelTab';
import { ProgressTab } from '@/components/profile/tabs/ProgressTab';
import { StatusPicker } from '@/components/status/StatusPicker';
import { ViewAsToggle } from '@/components/profile/ViewAsToggle';
import type { ProfileLens } from '@/lib/profileLens';
import { useSecurePublicProfile } from '@/hooks/useSecurePublicProfile';
import { useAuth } from '@/hooks/useAuth';
import { useStatus } from '@/hooks/useStatus';
import { usePublicStatus } from '@/hooks/usePublicStatus';
import { useCommunityScore } from '@/hooks/useCommunityScore';
import { usePublicCommunityScore } from '@/hooks/usePublicCommunityScore';
import { useToast } from '@/hooks/use-toast';

const TABS = ['overview', 'travel', 'contributions', 'progress'] as const;
type ProfileTab = (typeof TABS)[number];

/**
 * Unified profile page. /me/:tab? renders the signed-in user; /user/:userId/:tab?
 * renders anyone (own mode when it's you). Progress is own-only.
 */
export default function ProfilePage() {
  const params = useParams<{ userId?: string; tab?: string }>();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const isMeRoute = !params.userId;
  const targetUserId = params.userId ?? user?.id;

  const { profile, loading, error, isOwnProfile } = useSecurePublicProfile(targetUserId);
  const { status: ownStatus } = useStatus();
  const { status: othersStatus } = usePublicStatus(isOwnProfile ? null : targetUserId ?? null);
  const status = isOwnProfile ? ownStatus : othersStatus;
  const { data: ownScore } = useCommunityScore();
  const { score: othersScore } = usePublicCommunityScore(isOwnProfile ? null : targetUserId ?? null);
  const score = isOwnProfile ? ownScore : othersScore;
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [lens, setLens] = useState<ProfileLens>('you');

  const requestedTab = (params.tab ?? 'overview') as ProfileTab;
  const ownView = isOwnProfile && lens === 'you';
  const tab: ProfileTab = TABS.includes(requestedTab)
    ? requestedTab === 'progress' && !ownView
      ? 'overview'
      : requestedTab
    : 'overview';

  useEffect(() => {
    if (isMeRoute && !user) navigate('/auth');
  }, [isMeRoute, user, navigate]);

  if (isMeRoute && !user) return null;

  const basePath = isMeRoute ? '/me' : `/user/${params.userId}`;
  const setTab = (next: string) => {
    navigate(next === 'overview' ? basePath : `${basePath}/${next}`, { replace: true });
  };

  const completionPct = (profile as Record<string, unknown> | null)
    ?.profile_completion_percentage as number | undefined;

  const handleShare = async () => {
    const url = window.location.href;
    const title = `${profile?.display_name}'s profile`;
    const text = profile?.bio || `${profile?.display_name} on queer.guide`;
    if (navigator.share && navigator.canShare && navigator.canShare({ title, text, url })) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // fall back to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: 'Profile link copied to clipboard' });
    } catch {
      toast({ title: 'Share this profile', description: url, duration: 5000 });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col gap-6 animate-pulse">
          <div className="h-8 bg-muted rounded-element w-1/4" />
          <div className="h-64 bg-muted rounded-container" />
          <div className="h-32 bg-muted rounded-container" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <User size={48} style={{ margin: '0 auto 16px' }} className="text-muted-foreground" />
          <p className="text-base font-medium mb-2">Profile not found</p>
          <p className="text-muted-foreground mb-4">
            This user profile doesn't exist or has been removed.
          </p>
          <Button onClick={() => navigate('/users')}>
            <ArrowLeft size={16} className="mr-2" />
            Back to directory
          </Button>
        </div>
      </div>
    );
  }

  const visibility =
    ((profile.privacy_settings as Record<string, unknown> | null)?.profile_visibility as
      | string
      | boolean
      | undefined) ?? 'public';
  if ((visibility === 'private' || visibility === false) && !isOwnProfile) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Shield size={48} style={{ margin: '0 auto 16px' }} className="text-muted-foreground" />
          <p className="text-base font-medium mb-2">Private profile</p>
          <p className="text-muted-foreground mb-4">This user has set their profile to private.</p>
          <Button onClick={() => navigate('/users')}>
            <ArrowLeft size={16} className="mr-2" />
            Back to directory
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 pb-24">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          {isMeRoute ? (
            <h1 className="sr-only">Your profile</h1>
          ) : (
            <Button variant="outline" onClick={() => navigate(-1)} className="rounded-element">
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {isOwnProfile && <ViewAsToggle lens={lens} onChange={setLens} />}
            <Button
              variant="outline"
              size="icon"
              onClick={handleShare}
              aria-label="Share profile"
              className="rounded-element"
            >
              <Share2 size={16} />
            </Button>
            {!isOwnProfile && (
              <Button
                variant="outline"
                size="icon"
                aria-label="Report user"
                className="rounded-element"
              >
                <Flag size={16} />
              </Button>
            )}
          </div>
        </div>

        <ProfileHeader
          profile={profile as unknown as Record<string, unknown>}
          isOwnProfile={ownView}
          status={status}
          score={score}
          completionPct={completionPct}
          onEditStatus={() => setStatusPickerOpen(true)}
        />

        <Tabs value={tab} onValueChange={setTab} style={{ width: '100%' }}>
          <TabsList className="h-auto gap-0 rounded-none border-0 border-b border-border bg-transparent p-0 backdrop-blur-none w-full justify-start">
            {(
              [
                ['overview', 'Overview'],
                ['travel', 'Travel'],
                ['contributions', 'Contributions'],
                ...(ownView ? ([['progress', 'Progress']] as const) : []),
              ] as ReadonlyArray<readonly [string, string]>
            ).map(([v, l]) => (
              <TabsTrigger
                key={v}
                value={v}
                className="h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-foreground data-[state=active]:shadow-none"
              >
                {l}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              profile={profile as unknown as Record<string, unknown>}
              isOwnProfile={isOwnProfile}
              lens={lens}
              completionPct={completionPct}
              onPostsClick={() => setTab('contributions')}
            />
          </TabsContent>

          <TabsContent value="travel">
            <TravelTab userId={profile.user_id} isOwnProfile={ownView} />
          </TabsContent>

          <TabsContent value="contributions">
            <ContributionsTab
              userId={profile.user_id}
              isOwnProfile={isOwnProfile}
              lens={lens}
              privacySettings={(profile.privacy_settings ?? {}) as Record<string, unknown>}
            />
          </TabsContent>

          {ownView && (
            <TabsContent value="progress">
              <ProgressTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
      {isOwnProfile && <StatusPicker open={statusPickerOpen} onOpenChange={setStatusPickerOpen} />}
    </div>
  );
}

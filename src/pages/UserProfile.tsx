import { useParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, MapPin, Calendar, Check, Shield, User, Share2, Flag } from 'lucide-react';
import { StartConversationButton } from '@/components/messaging/StartConversationButton';
import { UserModeBadge } from '@/components/profile/UserModeBadge';
import { TrustTierBadge } from '@/components/profile/TrustTierBadge';
import { UserRelationshipActions } from '@/components/profile/UserRelationshipActions';
import { PhotoGallery } from '@/components/profile/PhotoGallery';
import { UserPostsList } from '@/components/posts/UserPostsList';
import { SecureProfileViewer } from '@/components/profile/SecureProfileViewer';
import { useSecurePublicProfile } from '@/hooks/useSecurePublicProfile';
import { useAuth } from '@/hooks/useAuth';
import { useStatus } from '@/hooks/useStatus';
import { usePublicStatus } from '@/hooks/usePublicStatus';
import { StatusBar } from '@/components/status/StatusBar';
import { StatusPicker } from '@/components/status/StatusPicker';
import { ScoreLevelChip } from '@/components/score/ScoreLevelChip';
import { CompletionRing } from '@/components/profile/CompletionRing';
import { ActivityStrip } from '@/components/profile/ActivityStrip';
import { useCommunityScore } from '@/hooks/useCommunityScore';
import { usePublicCommunityScore } from '@/hooks/usePublicCommunityScore';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export default function UserProfile() {
  const { _t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useLocalizedNavigate();
  const { user: _currentUser } = useAuth();
  const { toast } = useToast();

  const { profile, loading: isLoading, error, isOwnProfile } = useSecurePublicProfile(userId);
  const { status: ownStatus } = useStatus();
  const { status: othersStatus } = usePublicStatus(isOwnProfile ? null : userId ?? null);
  const status = isOwnProfile ? ownStatus : othersStatus;
  const { data: ownScore } = useCommunityScore();
  const { score: othersScore } = usePublicCommunityScore(isOwnProfile ? null : userId ?? null);
  const score = isOwnProfile ? ownScore : othersScore;
  const completionPct =
    (profile as unknown as Record<string, unknown>)?.profile_completion_percentage as
      | number
      | undefined;
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    const title = `${profile?.display_name}'s Profile`;
    const text = profile?.bio || `Check out ${profile?.display_name}'s profile`;

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
      toast({
        title: 'Link copied!',
        description: 'Profile link copied to clipboard',
      });
    } catch (_error) {
      toast({
        title: 'Share this profile',
        description: `Copy this link: ${url}`,
        duration: 5000,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col gap-6 animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-64 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
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
            Back to Directory
          </Button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getProfileVisibility = () => {
    const privacy = profile.privacy_settings as Record<string, unknown> | null;
    return profile.profile_visibility || privacy?.profile_visibility || 'public';
  };

  if (getProfileVisibility() === 'private' && !isOwnProfile) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Shield size={48} style={{ margin: '0 auto 16px' }} className="text-muted-foreground" />
          <p className="text-base font-medium mb-2">Private Profile</p>
          <p className="text-muted-foreground mb-4">This user has set their profile to private.</p>
          <Button onClick={() => navigate('/users')}>
            <ArrowLeft size={16} className="mr-2" />
            Back to Directory
          </Button>
        </div>
      </div>
    );
  }

  // Friends-only profile, viewer is not an accepted friend — server returned a
  // locked stub, so only name/avatar are available. Offer the friend request.
  if (profile.locked && !isOwnProfile) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 flex flex-col items-center gap-4">
          <Avatar style={{ width: 96, height: 96 }}>
            <AvatarImage
              src={profile.avatar_url || undefined}
              alt={profile.display_name || 'Profile photo'}
            />
            <AvatarFallback className="text-2xl">
              {profile.display_name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-base font-medium mb-2">
              {profile.display_name || 'Anonymous User'}
            </p>
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Shield size={16} />
              <p className="text-sm">This profile is only visible to friends.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <UserRelationshipActions targetUserId={profile.user_id} />
            <Button variant="outline" onClick={() => navigate('/users')}>
              <ArrowLeft size={16} className="mr-2" />
              Back to Directory
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} className="mr-2" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={handleShare} aria-label="Share profile">
              <Share2 size={16} />
            </Button>
            {!isOwnProfile && (
              <Button variant="outline" size="icon" aria-label="Report user">
                <Flag size={16} />
              </Button>
            )}
          </div>
        </div>

        {/* Profile Header */}
        <Card>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="flex flex-col items-center text-center md:text-left">
                <Avatar style={{ width: 128, height: 128 }} className="mb-4">
                  <AvatarImage
                    src={profile.avatar_url || undefined}
                    alt={profile.display_name || 'Profile photo'}
                  />
                  <AvatarFallback className="text-2xl">
                    {profile.display_name?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {(profile as unknown as Record<string, unknown>)?.verified_identity && (
                  <Badge variant="secondary">
                    <Check size={12} className="mr-1" />
                    Verified
                  </Badge>
                )}
                {isOwnProfile && typeof completionPct === 'number' && completionPct < 100 && (
                  <CompletionRing
                    percent={completionPct}
                    size={56}
                    className="mt-4"
                    label={<span>profile complete</span>}
                  />
                )}
              </div>

              <div className="flex-1 flex flex-col gap-4">
                <div>
                  <div className="flex flex-col md:flex-row md:items-center gap-4 mb-2">
                    <h4 className="text-2xl font-bold">
                      {profile.display_name || 'Anonymous User'}
                    </h4>
                    {(profile as unknown as Record<string, unknown>)?.user_mode && (
                      <UserModeBadge
                        mode={(profile as unknown as Record<string, unknown>).user_mode}
                        size="lg"
                      />
                    )}
                    <TrustTierBadge userId={profile.user_id} showLabel />
                    {score && (
                      <ScoreLevelChip
                        compact
                        level={score.level}
                        tier={score.tier}
                        totalPoints={score.total_points}
                      />
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 text-muted-foreground mb-4">
                    {profile.pronouns && <p className="text-sm">{profile.pronouns}</p>}
                    {(profile as unknown as Record<string, unknown>)?.age_range && (
                      <>
                        {profile.pronouns && <p className="text-sm">&#8226;</p>}
                        <p className="text-sm">
                          {(profile as unknown as Record<string, unknown>).age_range}
                        </p>
                      </>
                    )}
                    {profile.location && (
                      <>
                        <p className="text-sm">&#8226;</p>
                        <div className="flex items-center gap-1">
                          <MapPin size={16} />
                          <p className="text-sm">{profile.location}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {profile.bio && (
                    <p className="text-muted-foreground mb-4 max-w-2xl">{profile.bio}</p>
                  )}

                  {(status || isOwnProfile) && (
                    <div className="mb-4 max-w-2xl">
                      <StatusBar
                        status={status}
                        onClick={isOwnProfile ? () => setStatusPickerOpen(true) : undefined}
                      />
                      {isOwnProfile && !status?.emoji && !status?.text && !status?.dndActive && !status?.travel && (
                        <button
                          type="button"
                          onClick={() => setStatusPickerOpen(true)}
                          className="text-sm text-muted-foreground hover:underline"
                        >
                          Set a status…
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Calendar size={16} />
                    <p className="text-sm text-muted-foreground">
                      Joined {formatDate(profile.created_at)}
                    </p>
                  </div>
                </div>

                {!isOwnProfile && (
                  <div className="flex gap-4">
                    <StartConversationButton
                      userId={profile.user_id}
                      userName={profile.display_name || 'User'}
                      variant="default"
                    />
                    <UserRelationshipActions targetUserId={profile.user_id} />
                  </div>
                )}

                {isOwnProfile && (
                  <Button onClick={() => navigate('/profile/settings')}>Edit Profile</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Content — line tabs */}
        <Tabs defaultValue="about" style={{ width: '100%' }}>
          <TabsList className="h-auto gap-0 rounded-none border-0 border-b border-border bg-transparent p-0 backdrop-blur-none w-full justify-start">
            {(
              [
                ['about', 'About'],
                ['posts', 'Posts'],
                ['photos', 'Photos'],
                ['identity', 'Identity'],
                ['contact', 'Contact'],
              ] as const
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

          <TabsContent value="about">
            <div className="flex flex-col gap-6">
              {isOwnProfile && <ActivityStrip />}
              <SecureProfileViewer profile={profile} isOwnProfile={isOwnProfile} />
            </div>
          </TabsContent>

          <TabsContent value="posts">
            <div className="flex flex-col gap-6">
              <UserPostsList userId={userId!} isOwnProfile={isOwnProfile} />
            </div>
          </TabsContent>

          <TabsContent value="photos">
            <div className="flex flex-col gap-6">
              <PhotoGallery userId={profile.user_id} isOwnProfile={isOwnProfile} />
            </div>
          </TabsContent>

          <TabsContent value="identity">
            <div className="flex flex-col gap-6">
              <div className="text-center py-8">
                <Shield
                  size={48}
                  style={{ margin: '0 auto 16px' }}
                  className="text-muted-foreground"
                />
                <p className="text-base font-medium mb-2">Protected Information</p>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Identity and personal details are protected by privacy settings. Only information
                  you've chosen to make public will be visible to others.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contact">
            <div className="flex flex-col gap-6">
              <div className="text-center py-8">
                <Shield
                  size={48}
                  style={{ margin: '0 auto 16px' }}
                  className="text-muted-foreground"
                />
                <p className="text-base font-medium mb-2">Contact Privacy</p>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Contact details are protected. Only users who have made their contact information
                  public will have it displayed here.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      {isOwnProfile && (
        <StatusPicker open={statusPickerOpen} onOpenChange={setStatusPickerOpen} />
      )}
    </div>
  );
}

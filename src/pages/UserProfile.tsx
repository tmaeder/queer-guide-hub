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
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export default function UserProfile() {
  const { _t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useLocalizedNavigate();
  const { user: _currentUser } = useAuth();
  const { toast } = useToast();

  const { profile, loading: isLoading, error, isOwnProfile } = useSecurePublicProfile(userId);

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
          <User
            style={{
              width: 48,
              height: 48,
              margin: '0 auto 16px',
              color: 'var(--muted-foreground)',
            }}
          />
          <p className="text-base font-medium mb-2">Profile not found</p>
          <p className="text-muted-foreground mb-4">
            This user profile doesn't exist or has been removed.
          </p>
          <Button onClick={() => navigate('/users')}>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
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
    return privacy?.profile_visibility || 'public';
  };

  if (getProfileVisibility() === 'private' && !isOwnProfile) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Shield
            style={{
              width: 48,
              height: 48,
              margin: '0 auto 16px',
              color: 'var(--muted-foreground)',
            }}
          />
          <p className="text-base font-medium mb-2">Private Profile</p>
          <p className="text-muted-foreground mb-4">
            This user has set their profile to private.
          </p>
          <Button onClick={() => navigate('/users')}>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Directory
          </Button>
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
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={handleShare} aria-label="Share profile">
              <Share2 style={{ width: 16, height: 16 }} />
            </Button>
            {!isOwnProfile && (
              <Button variant="outline" size="icon" aria-label="Report user">
                <Flag style={{ width: 16, height: 16 }} />
              </Button>
            )}
          </div>
        </div>

        {/* Profile Header */}
        <Card>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="flex flex-col items-center text-center md:text-left">
                <Avatar style={{ width: 128, height: 128, marginBottom: 16 }}>
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback style={{ fontSize: '1.5rem' }}>
                    {profile.display_name?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {(profile as unknown as Record<string, unknown>)?.verified_identity && (
                  <Badge variant="secondary">
                    <Check style={{ width: 12, height: 12, marginRight: 4 }} />
                    Verified
                  </Badge>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-4">
                <div>
                  <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                      {profile.display_name || 'Anonymous User'}
                    </h1>
                    {(profile as unknown as Record<string, unknown>)?.user_mode && (
                      <UserModeBadge
                        mode={(profile as unknown as Record<string, unknown>).user_mode}
                        size="lg"
                      />
                    )}
                    <TrustTierBadge userId={profile.user_id} showLabel />
                  </div>

                  <div className="flex flex-wrap gap-3 text-muted-foreground mb-3">
                    {profile.pronouns && (
                      <p className="text-sm">{profile.pronouns}</p>
                    )}
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
                          <MapPin style={{ width: 16, height: 16 }} />
                          <p className="text-sm">{profile.location}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {profile.bio && (
                    <p className="text-muted-foreground mb-4 max-w-2xl">
                      {profile.bio}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <Calendar style={{ width: 16, height: 16 }} />
                    <p className="text-sm text-muted-foreground">
                      Joined {formatDate(profile.created_at)}
                    </p>
                  </div>
                </div>

                {!isOwnProfile && (
                  <div className="flex gap-3">
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

        {/* Profile Content */}
        <Tabs defaultValue="about" style={{ width: '100%' }}>
          <TabsList
            style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(5, 1fr)' }}
          >
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="identity">Identity</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
          </TabsList>

          <TabsContent value="about">
            <div className="flex flex-col gap-6">
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
                  style={{
                    width: 48,
                    height: 48,
                    margin: '0 auto 16px',
                    color: 'var(--muted-foreground)',
                  }}
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
                  style={{
                    width: 48,
                    height: 48,
                    margin: '0 auto 16px',
                    color: 'var(--muted-foreground)',
                  }}
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
    </div>
  );
}

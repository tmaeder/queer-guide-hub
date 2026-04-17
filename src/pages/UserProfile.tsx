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
import { UserRelationshipActions } from '@/components/profile/UserRelationshipActions';
import { PhotoGallery } from '@/components/profile/PhotoGallery';
import { UserPostsList } from '@/components/posts/UserPostsList';
import { SecureProfileViewer } from '@/components/profile/SecureProfileViewer';
import { useSecurePublicProfile } from '@/hooks/useSecurePublicProfile';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

export default function UserProfile() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useLocalizedNavigate();
  const { user: _currentUser } = useAuth();
  const { toast } = useToast();

  // Use the new secure profile hook
  const { profile, loading: isLoading, error, isOwnProfile } = useSecurePublicProfile(userId);

  const handleShare = async () => {
    const url = window.location.href;
    const title = `${profile?.display_name}'s Profile`;
    const text = profile?.bio || `Check out ${profile?.display_name}'s profile`;

    // Check if Web Share API is available and supported
    if (navigator.share && navigator.canShare && navigator.canShare({ title, text, url })) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        // If share fails or is cancelled, fall back to clipboard
        console.log('Share cancelled or failed:', error);
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: 'Link copied!',
        description: 'Profile link copied to clipboard',
      });
    } catch (_error) {
      // Final fallback: manual copy instruction
      toast({
        title: 'Share this profile',
        description: `Copy this link: ${url}`,
        duration: 5000,
      });
    }
  };

  if (isLoading) {
    return (
      <Container sx={{ p: 3 }}>
        <Box
          sx={{ display: 'flex', flexDirection: 'column', gap: 3, animation: 'pulse 2s infinite' }}
        >
          <Box sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '25%' }} />
          <Box sx={{ height: 256, bgcolor: 'action.hover', borderRadius: 1 }} />
          <Box sx={{ height: 128, bgcolor: 'action.hover', borderRadius: 1 }} />
        </Box>
      </Container>
    );
  }

  if (error || !profile) {
    return (
      <Container sx={{ p: 3 }}>
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <User
            style={{
              width: 48,
              height: 48,
              margin: '0 auto 16px',
              color: 'var(--muted-foreground)',
            }}
          />
          <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>
            Profile not found
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            This user profile doesn't exist or has been removed.
          </Typography>
          <Button onClick={() => navigate('/users')}>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Directory
          </Button>
        </Box>
      </Container>
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

  // Check if profile is private and user doesn't have access
  if (getProfileVisibility() === 'private' && !isOwnProfile) {
    return (
      <Container sx={{ p: 3 }}>
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Shield
            style={{
              width: 48,
              height: 48,
              margin: '0 auto 16px',
              color: 'var(--muted-foreground)',
            }}
          />
          <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>
            Private Profile
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            This user has set their profile to private.
          </Typography>
          <Button onClick={() => navigate('/users')}>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Directory
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outline" size="icon" onClick={handleShare} aria-label="Share profile">
              <Share2 style={{ width: 16, height: 16 }} />
            </Button>
            {!isOwnProfile && (
              <Button variant="outline" size="icon" aria-label="Report user">
                <Flag style={{ width: 16, height: 16 }} />
              </Button>
            )}
          </Box>
        </Box>

        {/* Profile Header */}
        <Card>
          <CardContent>
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                gap: 3,
                alignItems: 'flex-start',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: { xs: 'center', md: 'left' },
                }}
              >
                <Avatar style={{ width: 128, height: 128, marginBottom: 16 }}>
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback style={{ fontSize: '1.5rem' }}>
                    {profile.display_name?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {(profile as Record<string, unknown>)?.verified_identity && (
                  <Badge variant="secondary">
                    <Check style={{ width: 12, height: 12, marginRight: 4 }} />
                    Verified
                  </Badge>
                )}
              </Box>

              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', md: 'row' },
                      alignItems: { md: 'center' },
                      gap: 1.5,
                      mb: 1,
                    }}
                  >
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                      {profile.display_name || 'Anonymous User'}
                    </Typography>
                    {(profile as Record<string, unknown>)?.user_mode && (
                      <UserModeBadge
                        mode={(profile as Record<string, unknown>).user_mode}
                        size="lg"
                      />
                    )}
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1.5,
                      color: 'text.secondary',
                      mb: 1.5,
                    }}
                  >
                    {profile.pronouns && (
                      <Typography variant="body2">{profile.pronouns}</Typography>
                    )}
                    {(profile as Record<string, unknown>)?.age_range && (
                      <>
                        {profile.pronouns && <Typography variant="body2">&#8226;</Typography>}
                        <Typography variant="body2">
                          {(profile as Record<string, unknown>).age_range}
                        </Typography>
                      </>
                    )}
                    {profile.location && (
                      <>
                        <Typography variant="body2">&#8226;</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <MapPin style={{ width: 16, height: 16 }} />
                          <Typography variant="body2">{profile.location}</Typography>
                        </Box>
                      </>
                    )}
                  </Box>

                  {profile.bio && (
                    <Typography color="text.secondary" sx={{ mb: 2, maxWidth: '42rem' }}>
                      {profile.bio}
                    </Typography>
                  )}

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Calendar style={{ width: 16, height: 16 }} />
                    <Typography variant="body2" color="text.secondary">
                      Joined {formatDate(profile.created_at)}
                    </Typography>
                  </Box>
                </Box>

                {!isOwnProfile && (
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <StartConversationButton
                      userId={profile.user_id}
                      userName={profile.display_name || 'User'}
                      variant="default"
                    />
                    <UserRelationshipActions targetUserId={profile.user_id} />
                  </Box>
                )}

                {isOwnProfile && (
                  <Button onClick={() => navigate('/profile/settings')}>Edit Profile</Button>
                )}
              </Box>
            </Box>
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <SecureProfileViewer profile={profile} isOwnProfile={isOwnProfile} />
            </Box>
          </TabsContent>

          <TabsContent value="posts">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <UserPostsList userId={userId!} isOwnProfile={isOwnProfile} />
            </Box>
          </TabsContent>

          <TabsContent value="photos">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <PhotoGallery userId={profile.user_id} isOwnProfile={isOwnProfile} />
            </Box>
          </TabsContent>

          <TabsContent value="identity">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Identity information is now handled securely in SecureProfileViewer */}
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Shield
                  style={{
                    width: 48,
                    height: 48,
                    margin: '0 auto 16px',
                    color: 'var(--muted-foreground)',
                  }}
                />
                <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>
                  Protected Information
                </Typography>
                <Typography color="text.secondary" sx={{ maxWidth: '28rem', mx: 'auto' }}>
                  Identity and personal details are protected by privacy settings. Only information
                  you've chosen to make public will be visible to others.
                </Typography>
              </Box>
            </Box>
          </TabsContent>

          <TabsContent value="contact">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Contact information is now handled securely in SecureProfileViewer */}
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Shield
                  style={{
                    width: 48,
                    height: 48,
                    margin: '0 auto 16px',
                    color: 'var(--muted-foreground)',
                  }}
                />
                <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>
                  Contact Privacy
                </Typography>
                <Typography color="text.secondary" sx={{ maxWidth: '28rem', mx: 'auto' }}>
                  Contact details are protected. Only users who have made their contact information
                  public will have it displayed here.
                </Typography>
              </Box>
            </Box>
          </TabsContent>
        </Tabs>
      </Box>
    </Container>
  );
}

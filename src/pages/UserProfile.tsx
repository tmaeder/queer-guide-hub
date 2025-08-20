import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  MapPin, 
  Calendar, 
  Check,
  Shield,
  User,
  Share2,
  Flag
} from 'lucide-react';
import { StartConversationButton } from '@/components/messaging/StartConversationButton';
import { UserModeBadge } from '@/components/profile/UserModeBadge';
import { UserRelationshipActions } from '@/components/profile/UserRelationshipActions';
import { SocialLinksDisplay } from '@/components/profile/SocialLinksDisplay';
import { PhotoGallery } from '@/components/profile/PhotoGallery';
import { UserPostsList } from '@/components/posts/UserPostsList';
import { SecureProfileViewer } from '@/components/profile/SecureProfileViewer';
import { useSecurePublicProfile } from '@/hooks/useSecurePublicProfile';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  // Use the new secure profile hook
  const { 
    profile, 
    loading: isLoading, 
    error, 
    isOwnProfile,
    canViewSensitiveField
  } = useSecurePublicProfile(userId);

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
        title: "Link copied!",
        description: "Profile link copied to clipboard",
      });
    } catch (error) {
      // Final fallback: manual copy instruction
      toast({
        title: "Share this profile",
        description: `Copy this link: ${url}`,
        duration: 5000,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <User className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Profile not found</h3>
          <p className="text-muted-foreground mb-4">
            This user profile doesn't exist or has been removed.
          </p>
          <Button onClick={() => navigate('/users')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
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
      day: 'numeric'
    });
  };

  const getProfileVisibility = () => {
    const privacy = profile.privacy_settings as any;
    return privacy?.profile_visibility || 'public';
  };

  // Check if profile is private and user doesn't have access
  if (getProfileVisibility() === 'private' && !isOwnProfile) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Private Profile</h3>
          <p className="text-muted-foreground mb-4">
            This user has set their profile to private.
          </p>
          <Button onClick={() => navigate('/users')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Directory
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
          </Button>
          {!isOwnProfile && (
            <Button variant="outline" size="icon">
              <Flag className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="flex flex-col items-center text-center md:text-left">
              <Avatar className="h-32 w-32 mb-4">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-2xl">
                  {profile.display_name?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              {(profile as any)?.verified_identity && (
                <Badge variant="secondary" className="mb-2">
                  <Check className="h-3 w-3 mr-1" />
                  Verified
                </Badge>
              )}
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold">
                    {profile.display_name || "Anonymous User"}
                  </h1>
                  {(profile as any)?.user_mode && (
                    <UserModeBadge mode={(profile as any).user_mode} size="lg" />
                  )}
                </div>
                
                <div className="flex flex-wrap gap-3 text-muted-foreground mb-3">
                  {profile.pronouns && <span>{profile.pronouns}</span>}
                  {(profile as any)?.age_range && (
                    <>
                      {profile.pronouns && <span>•</span>}
                      <span>{(profile as any).age_range}</span>
                    </>
                  )}
                  {profile.location && (
                    <>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {profile.location}
                      </div>
                    </>
                  )}
                </div>

                {profile.bio && (
                  <p className="text-muted-foreground mb-4 max-w-2xl">
                    {profile.bio}
                  </p>
                )}

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Joined {formatDate(profile.created_at)}</span>
                </div>
              </div>

              {!isOwnProfile && (
                <div className="flex gap-3">
                  <StartConversationButton
                    userId={profile.user_id}
                    userName={profile.display_name || "User"}
                    variant="default"
                  />
                  <UserRelationshipActions targetUserId={profile.user_id} />
                </div>
              )}

              {isOwnProfile && (
                <Button onClick={() => navigate('/profile/settings')}>
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Content */}
      <Tabs defaultValue="about" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
        </TabsList>

        <TabsContent value="about" className="space-y-6">
          <SecureProfileViewer 
            profile={profile}
            isOwnProfile={isOwnProfile}
          />
        </TabsContent>

        <TabsContent value="posts" className="space-y-6">
          <UserPostsList userId={userId!} isOwnProfile={isOwnProfile} />
        </TabsContent>

        <TabsContent value="photos" className="space-y-6">
          <PhotoGallery userId={profile.user_id} isOwnProfile={isOwnProfile} />
        </TabsContent>

        <TabsContent value="identity" className="space-y-6">
          {/* Identity information is now handled securely in SecureProfileViewer */}
          <div className="text-center py-8">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Protected Information</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Identity and personal details are protected by privacy settings. 
              Only information you've chosen to make public will be visible to others.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="contact" className="space-y-6">
          {/* Contact information is now handled securely in SecureProfileViewer */}
          <div className="text-center py-8">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Contact Privacy</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Contact details are protected. Only users who have made their contact information 
              public will have it displayed here.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
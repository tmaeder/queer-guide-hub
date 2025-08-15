import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Calendar, MapPin, Briefcase, Users, Eye, Star, Share2, Heart, Verified } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { usePersonalities, type Personality } from '@/hooks/usePersonalities';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { SocialLinksDisplay } from '@/components/profile/SocialLinksDisplay';

export default function PersonalityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [personality, setPersonality] = useState<Personality | null>(null);
  const [loading, setLoading] = useState(true);
  const { incrementViews } = usePersonalities();

  useEffect(() => {
    if (!id) {
      navigate('/personalities');
      return;
    }

    const fetchPersonality = async () => {
      try {
        setLoading(true);
        
        // Fetch from Supabase
        const { supabase } = await import('@/integrations/supabase/client');
        const { data, error } = await supabase
          .from('personalities')
          .select('*')
          .eq('id', id)
          .eq('visibility', 'public')
          .maybeSingle();

        if (error) {
          console.error('Error fetching personality:', error);
          toast({
            title: "Error",
            description: "Failed to load personality details",
            variant: "destructive"
          });
          navigate('/personalities');
          return;
        }

        if (!data) {
          toast({
            title: "Not Found",
            description: "Personality not found",
            variant: "destructive"
          });
          navigate('/personalities');
          return;
        }

        // Transform data to match interface
        const transformedData: Personality = {
          ...data,
          fields: Array.isArray(data.fields) ? data.fields as string[] : [],
          achievements: Array.isArray(data.achievements) ? data.achievements as string[] : [],
          social_links: (data.social_links as Record<string, any>) || {},
          tags: data.tags || [],
          verification_status: (data.verification_status as 'pending' | 'verified' | 'disputed') || 'pending',
          visibility: (data.visibility as 'public' | 'private' | 'draft') || 'public'
        };

        setPersonality(transformedData);

        // Set page title for SEO
        document.title = `${transformedData.name} - Queer Guide`;
        
        // Set meta description
        const metaDescription = transformedData.description || transformedData.bio?.substring(0, 160) || `Learn about ${transformedData.name}, a notable LGBTQ+ personality.`;
        const existingMeta = document.querySelector('meta[name="description"]');
        if (existingMeta) {
          existingMeta.setAttribute('content', metaDescription);
        } else {
          const meta = document.createElement('meta');
          meta.name = 'description';
          meta.content = metaDescription;
          document.head.appendChild(meta);
        }

      } catch (error) {
        console.error('Unexpected error:', error);
        toast({
          title: "Error",
          description: "Failed to load personality details",
          variant: "destructive"
        });
        navigate('/personalities');
      } finally {
        setLoading(false);
      }
    };

    fetchPersonality();
  }, [id, navigate]);

  // Separate effect for incrementing views to avoid infinite loops
  useEffect(() => {
    if (personality?.id) {
      incrementViews(personality.id);
    }
  }, [personality?.id, incrementViews]);

  const calculateAge = (birthDate: string, deathDate?: string) => {
    const birth = new Date(birthDate);
    const end = deathDate ? new Date(deathDate) : new Date();
    const age = end.getFullYear() - birth.getFullYear();
    const monthDiff = end.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
      return age - 1;
    }
    return age;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getVerificationIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <Verified className="h-5 w-5 text-blue-500 fill-current" />;
      case 'disputed':
        return <div className="h-5 w-5 rounded-full bg-destructive" />;
      default:
        return null;
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: personality?.name,
          text: personality?.description || `Learn about ${personality?.name}`,
          url: window.location.href,
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link Copied",
        description: "Profile link copied to clipboard"
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="mb-6">
            <Skeleton className="h-10 w-32 mb-4" />
          </div>
          <div className="space-y-8">
            {/* Hero Section Skeleton */}
            <div className="relative">
              <div className="h-48 md:h-64 bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl mb-6" />
              <Card className="relative -mt-32 mx-4 md:mx-8">
                <CardContent className="pt-8 pb-6">
                  <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
                    <Skeleton className="h-32 w-32 rounded-full border-4 border-background shadow-xl" />
                    <div className="flex-1 space-y-4 text-center md:text-left">
                      <Skeleton className="h-10 w-64 mx-auto md:mx-0" />
                      <Skeleton className="h-4 w-32 mx-auto md:mx-0" />
                      <Skeleton className="h-20 w-full" />
                      <div className="flex gap-2 justify-center md:justify-start">
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <Skeleton className="h-80 w-full rounded-xl" />
              <Skeleton className="h-80 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!personality) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5">
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Navigation */}
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/personalities')}
            className="gap-2 hover:bg-accent/50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Personalities
          </Button>
        </div>

        {/* Hero Section with Background */}
        <div className="relative mb-8">
          {/* Hero Background */}
          <div className="h-48 md:h-64 bg-gradient-to-r from-primary/10 via-accent/10 to-secondary/10 rounded-2xl mb-6 relative overflow-hidden">
            <div className="absolute inset-0 opacity-30" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='grain' width='20' height='20' patternUnits='userSpaceOnUse'%3E%3Ccircle cx='1' cy='1' r='1' fill='currentColor' opacity='0.05'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23grain)'/%3E%3C/svg%3E")`
            }} />
          </div>
          
          {/* Profile Card Overlay */}
          <Card className="relative -mt-32 mx-4 md:mx-8 shadow-2xl border-0 bg-card/95 backdrop-blur-sm">
            <CardContent className="pt-8 pb-6">
              <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
                {/* Avatar */}
                <div className="relative">
                  <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
                    <AvatarImage src={personality.image_url || ''} alt={personality.name} />
                    <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-primary to-accent text-primary-foreground">
                      {getInitials(personality.name)}
                    </AvatarFallback>
                  </Avatar>
                  {/* Verification Badge */}
                  {personality.verification_status === 'verified' && (
                    <div className="absolute -bottom-2 -right-2 bg-background rounded-full p-1 shadow-lg">
                      {getVerificationIcon(personality.verification_status)}
                    </div>
                  )}
                </div>
                
                {/* Profile Info */}
                <div className="flex-1 text-center md:text-left">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
                          {personality.name}
                        </h1>
                        {personality.is_featured && (
                          <Badge className="gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                            <Star className="h-3 w-3 fill-current" />
                            Featured
                          </Badge>
                        )}
                      </div>
                      
                      {personality.pronouns && (
                        <p className="text-muted-foreground mb-3 text-lg">({personality.pronouns})</p>
                      )}
                      
                      {personality.description && (
                        <p className="text-lg text-muted-foreground mb-4 leading-relaxed max-w-2xl">
                          {personality.description}
                        </p>
                      )}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={handleShare}
                        className="shadow-sm"
                        title="Share this personality"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Fields Tags */}
                  <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-4">
                    {personality.fields.map((field, index) => (
                      <Badge 
                        key={index} 
                        variant="secondary" 
                        className="bg-accent/50 hover:bg-accent text-accent-foreground"
                      >
                        {field}
                      </Badge>
                    ))}
                  </div>
                  
                  {/* Stats and Links */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground justify-center md:justify-start">
                    <div className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      <span className="font-medium">{personality.view_count.toLocaleString()}</span> views
                    </div>
                    
                    {/* Social Links */}
                    {personality.social_links && Object.keys(personality.social_links).length > 0 && (
                      <>
                        <Separator orientation="vertical" className="h-4" />
                        <div className="flex items-center gap-2">
                          <SocialLinksDisplay 
                            socialLinks={personality.social_links} 
                            size="sm"
                          />
                        </div>
                      </>
                    )}
                    
                    {personality.website_url && (
                      <>
                        <Separator orientation="vertical" className="h-4" />
                        <Button variant="link" size="sm" asChild className="p-0 h-auto text-primary">
                          <a href={personality.website_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Official Website
                          </a>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Biography */}
            {personality.bio && (
              <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <div className="h-1 w-8 bg-gradient-to-r from-primary to-accent rounded-full" />
                    Biography
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-lg dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
                    {personality.bio.split('\n').map((paragraph, index) => (
                      paragraph.trim() && (
                        <p key={index} className="mb-4 last:mb-0">
                          {paragraph}
                        </p>
                      )
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Achievements */}
            {personality.achievements.length > 0 && (
              <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <div className="h-1 w-8 bg-gradient-to-r from-accent to-secondary rounded-full" />
                    Notable Achievements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {personality.achievements.map((achievement, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-accent/20 border border-accent/30">
                        <div className="h-2 w-2 rounded-full bg-accent mt-2 flex-shrink-0" />
                        <span className="text-muted-foreground leading-relaxed">{achievement}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Personal Information */}
            <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <div className="h-1 w-6 bg-gradient-to-r from-secondary to-primary rounded-full" />
                  Personal Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {personality.profession && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
                    <Briefcase className="h-5 w-5 text-secondary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">Profession</p>
                      <p className="font-medium">{personality.profession}</p>
                    </div>
                  </div>
                )}
                
                {personality.birth_place && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/20">
                    <MapPin className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-medium">{personality.birth_place}</p>
                      {personality.nationality && personality.nationality !== personality.birth_place && (
                        <p className="text-sm text-muted-foreground">{personality.nationality}</p>
                      )}
                    </div>
                  </div>
                )}
                
                {personality.birth_date && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/20">
                    <Calendar className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">Birth Date</p>
                      <p className="font-medium">
                        {new Date(personality.birth_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                      {personality.is_living ? (
                        <p className="text-sm text-muted-foreground">Age {calculateAge(personality.birth_date)}</p>
                      ) : personality.death_date && (
                        <p className="text-sm text-muted-foreground">
                          Died {new Date(personality.death_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Users className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${personality.is_living ? 'bg-green-500' : 'bg-gray-400'}`} />
                      <p className="font-medium">{personality.is_living ? 'Living' : 'Deceased'}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tags */}
            {personality.tags && personality.tags.length > 0 && (
              <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <div className="h-1 w-6 bg-gradient-to-r from-primary to-secondary rounded-full" />
                    Tags
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {personality.tags.map((tag, index) => (
                      <Badge 
                        key={index} 
                        variant="outline" 
                        className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20 hover:from-primary/20 hover:to-accent/20 transition-all duration-200"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
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

        // Transform data to match interface, preserving raw fields data for external links
        const rawFields = data.fields as Record<string, any> || {};
        const transformedData: Personality = {
          ...data,
          fields: Array.isArray(data.fields) ? data.fields as string[] : [],
          achievements: Array.isArray(data.achievements) ? data.achievements as string[] : [],
          social_links: (data.social_links as Record<string, any>) || {},
          tags: data.tags || [],
          verification_status: (data.verification_status as 'pending' | 'verified' | 'disputed') || 'pending',
          visibility: (data.visibility as 'public' | 'private' | 'draft') || 'public'
        };

        // Store raw fields data for external links
        (transformedData as any).rawFields = rawFields;

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
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-primary/5 animate-fade-in">
      {/* Header with improved navigation */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 max-w-5xl">
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              onClick={() => navigate('/personalities')}
              className="gap-2 hover:bg-accent/50 hover-scale transition-all duration-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Personalities
            </Button>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleShare}
                className="gap-2 hover-scale transition-all duration-200"
                title="Share this personality"
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Hero Section with improved design */}
        <section className="relative mb-12 animate-scale-in">
          {/* Hero Background with better gradients */}
          <div className="h-56 md:h-72 bg-gradient-to-r from-primary/20 via-accent/15 to-secondary/20 rounded-3xl mb-8 relative overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
            <div className="absolute inset-0 opacity-30" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='currentColor' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }} />
          </div>
          
          {/* Profile Card with enhanced styling */}
          <Card className="relative -mt-36 mx-4 md:mx-8 shadow-2xl border-0 bg-card/95 backdrop-blur-md ring-1 ring-border/50 hover:ring-primary/20 transition-all duration-500 animate-fade-in">
            <CardContent className="pt-10 pb-8">
              <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start">
                {/* Enhanced Avatar */}
                <div className="relative group">
                  <Avatar className="h-40 w-40 border-4 border-background shadow-2xl ring-4 ring-primary/10 group-hover:ring-primary/20 transition-all duration-300">
                    <AvatarImage 
                      src={personality.image_url || ''} 
                      alt={personality.name}
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <AvatarFallback className="text-3xl font-bold bg-gradient-to-br from-primary via-primary/80 to-accent text-primary-foreground">
                      {getInitials(personality.name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  {/* Enhanced Verification Badge */}
                  {personality.verification_status === 'verified' && (
                    <div className="absolute -bottom-2 -right-2 bg-background rounded-full p-2 shadow-xl ring-2 ring-background animate-pulse">
                      {getVerificationIcon(personality.verification_status)}
                    </div>
                  )}
                  
                  {/* Living Status Indicator */}
                  <div className="absolute -top-2 -left-2">
                    {personality.is_living ? (
                      <div className="flex items-center gap-1 bg-green-500/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-lg animate-pulse">
                        <Heart className="h-3 w-3" />
                        Living
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 bg-muted/90 text-muted-foreground px-3 py-1 rounded-full text-xs font-medium shadow-lg">
                        <Calendar className="h-3 w-3" />
                        Historical
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Enhanced Profile Info */}
                <div className="flex-1 text-center lg:text-left space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-center lg:justify-start gap-3 flex-wrap">
                      <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent leading-tight">
                        {personality.name}
                      </h1>
                      {personality.is_featured && (
                        <Badge className="gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg animate-pulse">
                          <Star className="h-4 w-4 fill-current" />
                          Featured
                        </Badge>
                      )}
                    </div>
                    
                    {personality.pronouns && (
                      <p className="text-muted-foreground text-xl font-medium">({personality.pronouns})</p>
                    )}
                    
                    {personality.description && (
                      <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl mx-auto lg:mx-0">
                        {personality.description}
                      </p>
                    )}
                  </div>
                  
                  {/* Enhanced Fields Tags */}
                  {personality.fields.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
                      {personality.fields.map((field, index) => (
                        <Badge 
                          key={index} 
                          variant="secondary" 
                          className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors duration-200 hover-scale"
                        >
                          {field}
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  {/* Enhanced Stats and Links */}
                  <div className="flex flex-wrap items-center gap-6 text-sm justify-center lg:justify-start pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-full">
                      <Eye className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{personality.view_count.toLocaleString()}</span>
                      <span className="text-muted-foreground">views</span>
                    </div>
                    
                    {/* Enhanced Social Links */}
                    {personality.social_links && Object.keys(personality.social_links).length > 0 && (
                      <div className="flex items-center gap-2">
                        <SocialLinksDisplay 
                          socialLinks={personality.social_links} 
                          size="sm"
                        />
                      </div>
                    )}
                    
                    {personality.website_url && (
                      <Button variant="outline" size="sm" asChild className="hover-scale transition-all duration-200">
                        <a href={personality.website_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Official Website
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Enhanced Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content with improved cards */}
          <div className="lg:col-span-2 space-y-8">
            {/* Enhanced Biography */}
            {personality.bio && (
              <Card className="shadow-xl border-0 bg-card/80 backdrop-blur-sm ring-1 ring-border/50 hover:ring-primary/20 transition-all duration-300 animate-fade-in">
                <CardHeader className="pb-6">
                  <CardTitle className="text-2xl flex items-center gap-3">
                    <div className="h-2 w-12 bg-gradient-to-r from-primary to-accent rounded-full" />
                    Biography
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-lg dark:prose-invert max-w-none text-muted-foreground leading-relaxed space-y-4">
                    {personality.bio.split('\n').map((paragraph, index) => (
                      paragraph.trim() && (
                        <p key={index} className="text-base leading-relaxed">
                          {paragraph}
                        </p>
                      )
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Enhanced Achievements */}
            {personality.achievements.length > 0 && (
              <Card className="shadow-xl border-0 bg-card/80 backdrop-blur-sm ring-1 ring-border/50 hover:ring-primary/20 transition-all duration-300 animate-fade-in">
                <CardHeader className="pb-6">
                  <CardTitle className="text-2xl flex items-center gap-3">
                    <div className="h-2 w-12 bg-gradient-to-r from-accent to-secondary rounded-full" />
                    Notable Achievements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {personality.achievements.map((achievement, index) => (
                      <div key={index} className="group flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/10 hover:border-primary/20 transition-all duration-200 hover-scale">
                        <div className="h-3 w-3 rounded-full bg-gradient-to-r from-primary to-accent mt-1.5 flex-shrink-0 group-hover:scale-125 transition-transform duration-200" />
                        <span className="text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors duration-200">{achievement}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Enhanced Sidebar */}
          <div className="space-y-6">
            {/* Enhanced Personal Information */}
            <Card className="shadow-xl border-0 bg-card/80 backdrop-blur-sm ring-1 ring-border/50 hover:ring-primary/20 transition-all duration-300 animate-fade-in">
              <CardHeader className="pb-6">
                <CardTitle className="text-xl flex items-center gap-3">
                  <div className="h-2 w-8 bg-gradient-to-r from-secondary to-primary rounded-full" />
                  Personal Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {personality.profession && (
                  <div className="group flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-secondary/10 to-secondary/5 border border-secondary/20 hover:border-secondary/30 transition-all duration-200 hover-scale">
                    <Briefcase className="h-5 w-5 text-secondary mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform duration-200" />
                    <div>
                      <p className="text-sm text-muted-foreground font-medium">Profession</p>
                      <p className="font-semibold text-foreground group-hover:text-secondary transition-colors duration-200">{personality.profession}</p>
                    </div>
                  </div>
                )}
                
                {personality.birth_place && (
                  <div className="group flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-accent/10 to-accent/5 border border-accent/20 hover:border-accent/30 transition-all duration-200 hover-scale">
                    <MapPin className="h-5 w-5 text-accent mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform duration-200" />
                    <div>
                      <p className="text-sm text-muted-foreground font-medium">Location</p>
                      <p className="font-semibold text-foreground group-hover:text-accent transition-colors duration-200">{personality.birth_place}</p>
                      {personality.nationality && personality.nationality !== personality.birth_place && (
                        <p className="text-sm text-muted-foreground mt-1">{personality.nationality}</p>
                      )}
                    </div>
                  </div>
                )}
                
                {personality.birth_date && (
                  <div className="group flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/30 transition-all duration-200 hover-scale">
                    <Calendar className="h-5 w-5 text-primary mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform duration-200" />
                    <div>
                      <p className="text-sm text-muted-foreground font-medium">Birth Date</p>
                      <p className="font-semibold text-foreground group-hover:text-primary transition-colors duration-200">
                        {new Date(personality.birth_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                      {personality.is_living ? (
                        <p className="text-sm text-muted-foreground mt-1">Age {calculateAge(personality.birth_date)}</p>
                      ) : personality.death_date && (
                        <p className="text-sm text-muted-foreground mt-1">
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
                
                <div className="group flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-muted/50 to-muted/30 border border-muted/40 hover:border-muted/60 transition-all duration-200 hover-scale">
                  <Users className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform duration-200" />
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">Status</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`h-3 w-3 rounded-full shadow-lg ${personality.is_living ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                      <p className="font-semibold text-foreground">{personality.is_living ? 'Living' : 'Deceased'}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Enhanced External Links */}
            {(personality as any).rawFields?.pornhub_profile && (
              <Card className="shadow-xl border-0 bg-card/80 backdrop-blur-sm ring-1 ring-border/50 hover:ring-primary/20 transition-all duration-300 animate-fade-in">
                <CardHeader className="pb-6">
                  <CardTitle className="text-xl flex items-center gap-3">
                    <div className="h-2 w-8 bg-gradient-to-r from-pink-500 to-red-500 rounded-full" />
                    External Profiles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-pink-500/10 to-red-500/10 border border-pink-500/20 hover:border-pink-500/30 transition-all duration-200 hover-scale">
                      <ExternalLink className="h-5 w-5 text-pink-500 flex-shrink-0 group-hover:scale-110 transition-transform duration-200" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground font-medium">Pornhub Profile</p>
                        <Button variant="link" size="sm" asChild className="p-0 h-auto text-pink-500 hover:text-pink-600 font-semibold">
                          <a href={(personality as any).rawFields.pornhub_profile} target="_blank" rel="noopener noreferrer">
                            View Profile
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Enhanced Tags */}
            {personality.tags && personality.tags.length > 0 && (
              <Card className="shadow-xl border-0 bg-card/80 backdrop-blur-sm ring-1 ring-border/50 hover:ring-primary/20 transition-all duration-300 animate-fade-in">
                <CardHeader className="pb-6">
                  <CardTitle className="text-xl flex items-center gap-3">
                    <div className="h-2 w-8 bg-gradient-to-r from-primary to-secondary rounded-full" />
                    Tags
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {personality.tags.map((tag, index) => (
                      <Badge 
                        key={index} 
                        variant="outline" 
                        className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20 hover:from-primary/20 hover:to-accent/20 hover:border-primary/30 transition-all duration-200 hover-scale font-medium"
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
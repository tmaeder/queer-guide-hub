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

  const getVerificationBadge = () => {
    switch (personality?.verification_status) {
      case 'verified':
        return <Badge variant="secondary" className="gap-1"><Verified className="h-3 w-3" />Verified</Badge>;
      case 'disputed':
        return <Badge variant="secondary" className="gap-1 bg-yellow-500/10 text-yellow-700">Disputed</Badge>;
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
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-64 bg-muted rounded"></div>
              <div className="h-48 bg-muted rounded"></div>
            </div>
            <div className="space-y-6">
              <div className="h-32 bg-muted rounded"></div>
              <div className="h-48 bg-muted rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!personality) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Personality Not Found</h1>
        <p className="text-muted-foreground mb-6">The personality you're looking for doesn't exist.</p>
        <Button onClick={() => navigate('/personalities')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Personalities
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/personalities')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Personalities
        </Button>
        
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-24 w-24">
              <AvatarImage 
                src={personality.image_url || ''} 
                alt={personality.name}
                className="object-cover"
              />
              <AvatarFallback className="text-xl font-semibold">
                {getInitials(personality.name)}
              </AvatarFallback>
            </Avatar>
            
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">{personality.name}</h1>
                {personality.is_featured && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="h-3 w-3" />
                    Featured
                  </Badge>
                )}
                {getVerificationBadge()}
              </div>
              
              {personality.pronouns && (
                <p className="text-muted-foreground mb-2">({personality.pronouns})</p>
              )}
              
              <div className="flex items-center gap-4 text-muted-foreground mb-3">
                {personality.profession && (
                  <div className="flex items-center gap-1">
                    <Briefcase className="h-4 w-4" />
                    <span>{personality.profession}</span>
                  </div>
                )}
                {personality.nationality && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span>{personality.nationality}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  {personality.is_living ? (
                    <>
                      <Heart className="h-4 w-4 text-green-600" />
                      <span>Living</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4" />
                      <span>Historical</span>
                    </>
                  )}
                </div>
              </div>
              
              {personality.birth_date && (
                <p className="text-sm text-muted-foreground mb-3">
                  Age: {calculateAge(personality.birth_date, personality.death_date || undefined)}
                  {personality.is_living ? ' years old' : ' years'}
                </p>
              )}

              {personality.fields.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {personality.fields.map((field, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {field}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Eye className="h-4 w-4" />
              <span className="text-sm">{personality.view_count.toLocaleString()}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            {personality.website_url && (
              <Button variant="outline" size="sm" asChild>
                <a href={personality.website_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Website
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {personality.description && (
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{personality.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Biography */}
          {personality.bio && (
            <Card>
              <CardHeader>
                <CardTitle>Biography</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {personality.bio.split('\n').map((paragraph, index) => (
                    paragraph.trim() && (
                      <p key={index} className="text-muted-foreground">
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
            <Card>
              <CardHeader>
                <CardTitle>Notable Achievements</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {personality.achievements.map((achievement, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <div className="h-2 w-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                      <span className="text-muted-foreground">{achievement}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {personality.birth_date && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Born</p>
                    <p className="font-medium">
                      {new Date(personality.birth_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
              {personality.death_date && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Died</p>
                    <p className="font-medium">
                      {new Date(personality.death_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
              {personality.nationality && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Nationality</p>
                    <p className="font-medium">{personality.nationality}</p>
                  </div>
                </div>
              )}
              {personality.profession && (
                <div className="flex items-center gap-3">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Profession</p>
                    <p className="font-medium">{personality.profession}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Social Links */}
          {personality.social_links && Object.keys(personality.social_links).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Social Links</CardTitle>
              </CardHeader>
              <CardContent>
                <SocialLinksDisplay 
                  socialLinks={personality.social_links} 
                  size="sm"
                />
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {personality.tags && personality.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {personality.tags.map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* View Count */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Eye className="h-4 w-4" />
                <span className="text-sm">
                  {personality.view_count.toLocaleString()} profile views
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
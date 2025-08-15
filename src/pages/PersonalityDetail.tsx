import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Calendar, MapPin, Briefcase, Users, Eye, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { usePersonalities, type Personality } from '@/hooks/usePersonalities';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';

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

        // Increment view count
        incrementViews(id);

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
  }, [id, navigate, incrementViews]);

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
        return <Star className="h-4 w-4 text-yellow-500" />;
      case 'disputed':
        return <div className="h-4 w-4 rounded-full bg-red-500" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <Skeleton className="h-10 w-32 mb-4" />
        </div>
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-6">
                <Skeleton className="h-32 w-32 rounded-full mx-auto md:mx-0" />
                <div className="flex-1 space-y-4">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!personality) {
    return null;
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Back Button */}
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/personalities')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Personalities
        </Button>
      </div>

      {/* Header Section */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-shrink-0 mx-auto md:mx-0">
              <Avatar className="h-32 w-32">
                <AvatarImage src={personality.image_url || ''} alt={personality.name} />
                <AvatarFallback className="text-2xl">
                  {getInitials(personality.name)}
                </AvatarFallback>
              </Avatar>
            </div>
            
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                <h1 className="text-3xl font-bold">{personality.name}</h1>
                {getVerificationIcon(personality.verification_status)}
                {personality.is_featured && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="h-3 w-3" />
                    Featured
                  </Badge>
                )}
              </div>
              
              {personality.pronouns && (
                <p className="text-muted-foreground mb-2">({personality.pronouns})</p>
              )}
              
              {personality.description && (
                <p className="text-lg text-muted-foreground mb-4">{personality.description}</p>
              )}
              
              <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-4">
                {personality.fields.map((field, index) => (
                  <Badge key={index} variant="outline">
                    {field}
                  </Badge>
                ))}
              </div>
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground justify-center md:justify-start">
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {personality.view_count} views
                </div>
                {personality.website_url && (
                  <Button variant="link" size="sm" asChild className="p-0 h-auto">
                    <a href={personality.website_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Learn More
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details Grid */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Personal Information */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Personal Information</h2>
            <div className="space-y-3">
              {personality.profession && (
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <span>{personality.profession}</span>
                </div>
              )}
              
              {personality.birth_place && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{personality.birth_place}</span>
                  {personality.nationality && personality.nationality !== personality.birth_place && (
                    <span className="text-muted-foreground">• {personality.nationality}</span>
                  )}
                </div>
              )}
              
              {personality.birth_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {new Date(personality.birth_date).toLocaleDateString()}
                    {personality.is_living ? (
                      <span className="text-muted-foreground"> (Age {calculateAge(personality.birth_date)})</span>
                    ) : personality.death_date ? (
                      <span className="text-muted-foreground"> - {new Date(personality.death_date).toLocaleDateString()}</span>
                    ) : null}
                  </span>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{personality.is_living ? 'Living' : 'Deceased'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Achievements */}
        {personality.achievements.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Achievements</h2>
              <ul className="space-y-2">
                {personality.achievements.map((achievement, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <span>{achievement}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Biography */}
      {personality.bio && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Biography</h2>
            <div className="prose prose-gray dark:prose-invert max-w-none">
              {personality.bio.split('\n').map((paragraph, index) => (
                <p key={index} className="mb-4 last:mb-0">
                  {paragraph}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
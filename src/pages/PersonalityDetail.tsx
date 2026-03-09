import { useParams, useNavigate, Link } from 'react-router';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  MapPin,
  Briefcase,
  Star,
  Share2,
  Heart,
  Verified,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePersonalities, type Personality } from '@/hooks/usePersonalities';
import { toast } from '@/hooks/use-toast';
import { SocialLinksDisplay } from '@/components/profile/SocialLinksDisplay';
import { api } from '@/integrations/api/client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface SimilarPersonality {
  id: string;
  name: string;
  profession: string | null;
  nationality: string | null;
  image_url: string | null;
  is_living: boolean;
  birth_date: string | null;
  death_date: string | null;
  description: string | null;
  similarity: number;
}

export default function PersonalityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [personality, setPersonality] = useState<Personality | null>(null);
  const [loading, setLoading] = useState(true);
  const [similarPersonalities, setSimilarPersonalities] = useState<SimilarPersonality[]>([]);
  const [countryId, setCountryId] = useState<string | null>(null);
  const { incrementViews } = usePersonalities();

  useEffect(() => {
    if (!id) {
      navigate('/personalities');
      return;
    }

    const fetchPersonality = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from('personalities')
          .select('*')
          .eq('id', id)
          .eq('visibility', 'public')
          .maybeSingle();

        if (error) {
          console.error('Error fetching personality:', error);
          toast({
            title: 'Error',
            description: 'Failed to load personality details',
            variant: 'destructive',
          });
          navigate('/personalities');
          return;
        }

        if (!data) {
          toast({
            title: 'Not Found',
            description: 'Personality not found',
            variant: 'destructive',
          });
          navigate('/personalities');
          return;
        }

        const transformedData: Personality = {
          ...data,
          fields: Array.isArray(data.fields) ? (data.fields as string[]) : [],
          achievements: Array.isArray(data.achievements) ? (data.achievements as string[]) : [],
          social_links: (data.social_links as Record<string, any>) || {},
          tags: data.tags || [],
          verification_status:
            (data.verification_status as 'pending' | 'verified' | 'disputed') || 'pending',
          visibility: (data.visibility as 'public' | 'private' | 'draft') || 'public',
        };

        setPersonality(transformedData);

        document.title = `${transformedData.name} - Queer Guide`;
        const metaDescription =
          transformedData.description ||
          transformedData.bio?.substring(0, 160) ||
          `Learn about ${transformedData.name}, a notable LGBTQ+ personality.`;
        const existingMeta = document.querySelector('meta[name="description"]');
        if (existingMeta) {
          existingMeta.setAttribute('content', metaDescription);
        } else {
          const meta = document.createElement('meta');
          meta.name = 'description';
          meta.content = metaDescription;
          document.head.appendChild(meta);
        }

        // Look up country ID for nationality link
        if (transformedData.nationality) {
          const { data: countryData } = await supabase
            .from('countries')
            .select('id')
            .eq('name', transformedData.nationality)
            .maybeSingle();
          if (countryData) setCountryId(countryData.id);
        }

        // Fetch similar personalities via embedding similarity
        const { data: similarData } = await api.rpc('get_similar_personalities', {
          personality_uuid: id,
          result_limit: 6,
          min_similarity: 0.3,
        });
        if (similarData) setSimilarPersonalities(similarData);
      } catch (error) {
        console.error('Unexpected error:', error);
        toast({
          title: 'Error',
          description: 'Failed to load personality details',
          variant: 'destructive',
        });
        navigate('/personalities');
      } finally {
        setLoading(false);
      }
    };

    fetchPersonality();
  }, [id, navigate]);

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
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getVerificationBadge = () => {
    switch (personality?.verification_status) {
      case 'verified':
        return (
          <Badge variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Verified style={{ height: 12, width: 12 }} />
            Verified
          </Badge>
        );
      case 'disputed':
        return (
          <Badge
            variant="secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#fef9e7',
              color: '#a16207',
            }}
          >
            Disputed
          </Badge>
        );
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
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: 'Link Copied',
        description: 'Profile link copied to clipboard',
      });
    }
  };

  if (loading) {
    return (
      <Box sx={{ maxWidth: 'lg', mx: 'auto', px: 2, py: 4 }}>
        <div style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
          <Box sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '33%', mb: 3 }} />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' },
              gap: 4,
            }}
          >
            <Box
              sx={{
                gridColumn: { lg: 'span 2' },
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              <Box sx={{ height: 256, bgcolor: 'action.hover', borderRadius: 1 }} />
              <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 1 }} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ height: 128, bgcolor: 'action.hover', borderRadius: 1 }} />
              <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 1 }} />
            </Box>
          </Box>
        </div>
      </Box>
    );
  }

  if (!personality) {
    return (
      <Box sx={{ maxWidth: 'lg', mx: 'auto', px: 2, py: 4, textAlign: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, mb: 2 }}>
          Personality Not Found
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3 }}>
          The personality you're looking for doesn't exist.
        </Typography>
        <Button onClick={() => navigate('/personalities')}>
          <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
          Back to Personalities
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1152, mx: 'auto', px: 2, py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Button
          variant="ghost"
          onClick={() => navigate('/personalities')}
          style={{ marginBottom: '16px' }}
        >
          <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
          Back to Personalities
        </Button>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { md: 'flex-start' },
            justifyContent: { md: 'space-between' },
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <Avatar style={{ height: 96, width: 96 }}>
              <AvatarImage
                src={personality.image_url || ''}
                alt={personality.name}
                style={{ objectFit: 'cover' }}
              />
              <AvatarFallback style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                {getInitials(personality.name)}
              </AvatarFallback>
            </Avatar>

            <div>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Typography
                  variant="h4"
                  component="h1"
                  sx={{ fontSize: '1.875rem', fontWeight: 700 }}
                >
                  {personality.name}
                </Typography>
                {personality.is_featured && (
                  <Badge
                    variant="secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Star style={{ height: 12, width: 12 }} />
                    Featured
                  </Badge>
                )}
                {getVerificationBadge()}
              </Box>

              {personality.pronouns && (
                <Typography sx={{ color: 'text.secondary', mb: 1 }}>
                  ({personality.pronouns})
                </Typography>
              )}

              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  color: 'text.secondary',
                  mb: 1.5,
                  flexWrap: 'wrap',
                }}
              >
                {personality.profession && (
                  <Box
                    component="a"
                    href={`/personalities?profession=${encodeURIComponent(personality.profession)}`}
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      navigate(
                        `/personalities?profession=${encodeURIComponent(personality.profession!)}`,
                      );
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      color: 'primary.main',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    <Briefcase style={{ height: 16, width: 16 }} />
                    <span>{personality.profession}</span>
                  </Box>
                )}
                {personality.nationality &&
                  (countryId ? (
                    <Box
                      component={Link}
                      to={`/country/${countryId}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: 'primary.main',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      <MapPin style={{ height: 16, width: 16 }} />
                      <span>{personality.nationality}</span>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <MapPin style={{ height: 16, width: 16 }} />
                      <span>{personality.nationality}</span>
                    </Box>
                  ))}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {personality.is_living ? (
                    <>
                      <Heart style={{ height: 16, width: 16, color: '#16a34a' }} />
                      <span>Living</span>
                    </>
                  ) : (
                    <>
                      <Calendar style={{ height: 16, width: 16 }} />
                      <span>Historical</span>
                    </>
                  )}
                </Box>
              </Box>

              {personality.birth_date && (
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1.5 }}>
                  Age: {calculateAge(personality.birth_date, personality.death_date || undefined)}
                  {personality.is_living ? ' years old' : ' years'}
                </Typography>
              )}

              {personality.fields.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {personality.fields.map((field, index) => (
                    <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                      {field}
                    </Badge>
                  ))}
                </Box>
              )}
            </div>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ReportButton
              contentType="personalities"
              contentId={personality.id}
              contentName={personality.name}
            />
            <AdminEditButton
              contentType="personalities"
              contentId={personality.id}
              contentName={personality.name}
              currentData={personality as Record<string, unknown>}
              onSaved={() => window.location.reload()}
            />
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 style={{ height: 16, width: 16, marginRight: 8 }} />
              Share
            </Button>
            {personality.website_url && (
              <Button variant="outline" size="sm" asChild>
                <a href={personality.website_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink style={{ height: 16, width: 16, marginRight: 8 }} />
                  Website
                </a>
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      <Box
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 4 }}
      >
        {/* Main Content */}
        <Box
          sx={{ gridColumn: { lg: 'span 2' }, display: 'flex', flexDirection: 'column', gap: 3 }}
        >
          {/* Description */}
          {personality.description && (
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <CardContent>
                <p style={{ color: '#999999' }}>{personality.description}</p>
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
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {personality.bio.split('\n').map(
                    (paragraph, index) =>
                      paragraph.trim() && (
                        <p key={index} style={{ color: '#999999' }}>
                          {paragraph}
                        </p>
                      ),
                  )}
                </Box>
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
                <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {personality.achievements.map((achievement, index) => (
                    <Box
                      component="li"
                      key={index}
                      sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}
                    >
                      <Box
                        sx={{
                          height: 8,
                          width: 8,
                          bgcolor: 'primary.main',
                          borderRadius: '50%',
                          mt: 1,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color: '#999999' }}>{achievement}</span>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Similar Personalities */}
          {similarPersonalities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Similar Personalities</CardTitle>
              </CardHeader>
              <CardContent>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                    gap: 2,
                  }}
                >
                  {similarPersonalities.map((similar) => (
                    <Box
                      key={similar.id}
                      component={Link}
                      to={`/personalities/${similar.id}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        p: 1.5,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        textDecoration: 'none',
                        color: 'inherit',
                        transition: 'all 0.2s',
                        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                      }}
                    >
                      <Avatar style={{ height: 40, width: 40, flexShrink: 0 }}>
                        <AvatarImage
                          src={similar.image_url || ''}
                          alt={similar.name}
                          style={{ objectFit: 'cover' }}
                        />
                        <AvatarFallback style={{ fontSize: '0.75rem' }}>
                          {similar.name
                            .split(' ')
                            .map((w) => w[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {similar.name}
                        </Typography>
                        {similar.profession && (
                          <Typography
                            sx={{
                              fontSize: '0.75rem',
                              color: 'text.secondary',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {similar.profession}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>

        {/* Sidebar */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {personality.birth_date && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Calendar style={{ height: 16, width: 16, color: '#999999' }} />
                  <div>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      Born
                    </Typography>
                    <Typography sx={{ fontWeight: 500 }}>
                      {new Date(personality.birth_date).toLocaleDateString()}
                    </Typography>
                  </div>
                </Box>
              )}
              {personality.death_date && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Calendar style={{ height: 16, width: 16, color: '#999999' }} />
                  <div>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      Died
                    </Typography>
                    <Typography sx={{ fontWeight: 500 }}>
                      {new Date(personality.death_date).toLocaleDateString()}
                    </Typography>
                  </div>
                </Box>
              )}
              {personality.nationality && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <MapPin style={{ height: 16, width: 16, color: '#999999' }} />
                  <div>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      Nationality
                    </Typography>
                    {countryId ? (
                      <Typography
                        component={Link}
                        to={`/country/${countryId}`}
                        sx={{
                          fontWeight: 500,
                          color: 'primary.main',
                          textDecoration: 'none',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        {personality.nationality}
                      </Typography>
                    ) : (
                      <Typography sx={{ fontWeight: 500 }}>{personality.nationality}</Typography>
                    )}
                  </div>
                </Box>
              )}
              {personality.profession && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Briefcase style={{ height: 16, width: 16, color: '#999999' }} />
                  <div>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      Profession
                    </Typography>
                    <Typography
                      component={Link}
                      to={`/personalities?profession=${encodeURIComponent(personality.profession)}`}
                      sx={{
                        fontWeight: 500,
                        color: 'primary.main',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      {personality.profession}
                    </Typography>
                  </div>
                </Box>
              )}
              {personality.birth_place && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <MapPin style={{ height: 16, width: 16, color: '#999999' }} />
                  <div>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      Birth Place
                    </Typography>
                    <Typography sx={{ fontWeight: 500 }}>{personality.birth_place}</Typography>
                  </div>
                </Box>
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
                <SocialLinksDisplay socialLinks={personality.social_links} size="sm" />
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {personality.tags && personality.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Tag style={{ height: 16, width: 16 }} />
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {personality.tags.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      style={{ fontSize: '0.75rem', cursor: 'pointer' }}
                      onClick={() => navigate(`/resources/${encodeURIComponent(tag)}`)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      </Box>
    </Box>
  );
}

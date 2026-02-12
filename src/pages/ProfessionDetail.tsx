import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, MapPin, Calendar, User } from "lucide-react";
import { PersonalityCard } from "@/components/personalities/PersonalityCard";
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

interface ProfessionData {
  name: string;
  personalities: any[];
  totalCount: number;
}

export default function ProfessionDetail() {
  const { professionName } = useParams<{ professionName: string }>();
  const navigate = useNavigate();
  const [professionData, setProfessionData] = useState<ProfessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!professionName) return;

    const loadProfessionData = async () => {
      try {
        const decodedProfession = decodeURIComponent(professionName);

        const { data: personalities, error: personalitiesError } = await supabase
          .from('personalities')
          .select('*')
          .not('profession', 'is', null)
          .order('name');

        if (personalitiesError) throw personalitiesError;

        const filteredPersonalities = personalities?.filter(p =>
          p.profession && p.profession.split(',')
            .map((prof: string) => prof.trim().toLowerCase())
            .includes(decodedProfession.toLowerCase())
        ) || [];

        setProfessionData({
          name: decodedProfession,
          personalities: filteredPersonalities,
          totalCount: filteredPersonalities.length
        });

      } catch (err) {
        console.error('Error loading profession data:', err);
        setError('Failed to load profession data');
      } finally {
        setLoading(false);
      }
    };

    loadProfessionData();
  }, [professionName]);

  const handleBack = () => {
    navigate('/resources');
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Skeleton style={{ height: 40, width: 96 }} />
            <Skeleton style={{ height: 32, width: 256 }} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 3 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} style={{ overflow: 'hidden' }}>
                <Skeleton style={{ aspectRatio: '1/1', width: '100%' }} />
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Skeleton style={{ height: 16, width: '100%' }} />
                  <Skeleton style={{ height: 12, width: 64 }} />
                </Box>
              </Card>
            ))}
          </Box>
        </Box>
      </Container>
    );
  }

  if (error || !professionData) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Card style={{ borderColor: 'var(--destructive)' }}>
          <CardContent style={{ padding: 24, textAlign: 'center' }}>
            <Typography color="error">{error || 'Profession not found'}</Typography>
            <Button variant="outline" onClick={handleBack} style={{ marginTop: 16 }}>
              <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
              Back to Resources
            </Button>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="outline" onClick={handleBack} style={{ flexShrink: 0 }}>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <User style={{ width: 32, height: 32, color: 'var(--primary)' }} />
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{professionData.name}</Typography>
            <Badge variant="secondary">
              {professionData.totalCount} {professionData.totalCount === 1 ? 'person' : 'people'}
            </Badge>
          </Box>
        </Box>

        {/* Stats Overview */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          <Card>
            <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
              <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Total People</CardTitle>
              <Users style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
            </CardHeader>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{professionData.totalCount}</Typography>
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
              <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Locations</CardTitle>
              <MapPin style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
            </CardHeader>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {new Set(professionData.personalities.map(p => p.birth_place).filter(Boolean)).size}
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
              <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Age Range</CardTitle>
              <Calendar style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
            </CardHeader>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {(() => {
                  const ages = professionData.personalities
                    .map(p => p.birth_date ? new Date().getFullYear() - new Date(p.birth_date).getFullYear() : null)
                    .filter(Boolean);
                  if (ages.length === 0) return 'N/A';
                  const min = Math.min(...ages);
                  const max = Math.max(...ages);
                  return min === max ? `${min}` : `${min}-${max}`;
                })()}
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* People Grid */}
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>People in {professionData.name}</Typography>
          {professionData.personalities.length > 0 ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 3 }}>
              {professionData.personalities.map((personality) => (
                <PersonalityCard key={personality.id} personality={personality} />
              ))}
            </Box>
          ) : (
            <Card>
              <CardContent style={{ padding: 24, textAlign: 'center' }}>
                <Typography color="text.secondary">No people found for this profession.</Typography>
              </CardContent>
            </Card>
          )}
        </Box>
      </Box>
    </Container>
  );
}

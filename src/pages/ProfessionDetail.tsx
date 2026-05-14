import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { usePersonalitiesByProfession } from '@/hooks/usePageFetchers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Users, MapPin, Calendar, User } from 'lucide-react';
import { PersonalityCard } from '@/components/personalities/PersonalityCard';

interface ProfessionData {
  name: string;
  personalities: Record<string, unknown>[];
  totalCount: number;
}

export default function ProfessionDetail() {
  const { professionName } = useParams<{ professionName: string }>();
  const navigate = useLocalizedNavigate();
  const [professionData, setProfessionData] = useState<ProfessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: personalities, isLoading: loading, error: queryError } = usePersonalitiesByProfession();

  useEffect(() => {
    if (!professionName) return;
    if (queryError) {
      setError('Failed to load profession data');
      return;
    }
    if (!personalities) return;
    const decodedProfession = decodeURIComponent(professionName);
    const filtered = (personalities as Array<{ profession?: string | null }>)
      .filter(
        (p) =>
          p.profession &&
          p.profession
            .split(',')
            .map((prof: string) => prof.trim().toLowerCase())
            .includes(decodedProfession.toLowerCase()),
      ) as Record<string, unknown>[];
    setProfessionData({
      name: decodedProfession,
      personalities: filtered,
      totalCount: filtered.length,
    });
  }, [professionName, personalities, queryError]);

  const handleBack = () => {
    navigate('/resources');
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Skeleton style={{ height: 40, width: 96 }} />
            <Skeleton style={{ height: 32, width: 256 }} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} style={{ overflow: 'hidden' }}>
                <Skeleton style={{ aspectRatio: '1/1', width: '100%' }} />
                <div className="p-4 flex flex-col gap-2">
                  <Skeleton style={{ height: 16, width: '100%' }} />
                  <Skeleton style={{ height: 12, width: 64 }} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !professionData) {
    return (
      <div className="container mx-auto py-6 px-4">
        <Card style={{ borderColor: 'var(--destructive)' }}>
          <CardContent style={{ padding: 24, textAlign: 'center' }}>
            <p className="text-destructive">{error || 'Profession not found'}</p>
            <Button variant="outline" onClick={handleBack} style={{ marginTop: 16 }}>
              <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
              Back to Resources
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={handleBack} style={{ flexShrink: 0 }}>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <User style={{ width: 32, height: 32, color: 'var(--primary)' }} />
            <h4 className="text-2xl font-bold">{professionData.name}</h4>
            <Badge variant="secondary">
              {professionData.totalCount} {professionData.totalCount === 1 ? 'person' : 'people'}
            </Badge>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total People</CardTitle>
              <Users style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{professionData.totalCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Locations</CardTitle>
              <MapPin style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">
                {
                  new Set(professionData.personalities.map((p) => p.birth_place).filter(Boolean))
                    .size
                }
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Age Range</CardTitle>
              <Calendar style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">
                {(() => {
                  const ages = professionData.personalities
                    .map((p) =>
                      p.birth_date
                        ? new Date().getFullYear() - new Date(p.birth_date).getFullYear()
                        : null,
                    )
                    .filter(Boolean);
                  if (ages.length === 0) return 'N/A';
                  const min = Math.min(...ages);
                  const max = Math.max(...ages);
                  return min === max ? `${min}` : `${min}-${max}`;
                })()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* People Grid */}
        <div>
          <h6 className="text-base font-semibold mb-4">People in {professionData.name}</h6>
          {professionData.personalities.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {professionData.personalities.map((personality) => (
                <PersonalityCard key={personality.id} personality={personality} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent style={{ padding: 24, textAlign: 'center' }}>
                <p className="text-muted-foreground">No people found for this profession.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

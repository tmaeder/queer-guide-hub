import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, MapPin, Calendar, User } from "lucide-react";
import { PersonalityCard } from "@/components/personalities/PersonalityCard";

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
        
        // Get personalities with this profession (including comma-separated)
        const { data: personalities, error: personalitiesError } = await supabase
          .from('personalities')
          .select('*')
          .not('profession', 'is', null)
          .order('name');

        if (personalitiesError) throw personalitiesError;

        // Filter personalities that have this profession in their comma-separated list
        const filteredPersonalities = personalities?.filter(p => 
          p.profession && p.profession.split(',').map(prof => prof.trim()).includes(decodedProfession)
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
    navigate('/ressources');
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-square w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !professionData) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardContent className="p-6 text-center">
            <p className="text-destructive">{error || 'Profession not found'}</p>
            <Button variant="outline" onClick={handleBack} className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Resources
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={handleBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <User className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">{professionData.name}</h1>
          <Badge variant="secondary">
            {professionData.totalCount} {professionData.totalCount === 1 ? 'person' : 'people'}
          </Badge>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total People</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{professionData.totalCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Locations</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(professionData.personalities.map(p => p.birth_place).filter(Boolean)).size}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Age Range</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(() => {
                const ages = professionData.personalities
                  .map(p => p.birth_date ? new Date().getFullYear() - new Date(p.birth_date).getFullYear() : null)
                  .filter(Boolean);
                if (ages.length === 0) return 'N/A';
                const min = Math.min(...ages);
                const max = Math.max(...ages);
                return min === max ? `${min}` : `${min}-${max}`;
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* People Grid */}
      <div>
        <h2 className="text-xl font-semibold mb-4">People in {professionData.name}</h2>
        {professionData.personalities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {professionData.personalities.map((personality) => (
              <PersonalityCard key={personality.id} personality={personality} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No people found for this profession.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
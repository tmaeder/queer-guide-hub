import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonalityCard } from "@/components/personalities/PersonalityCard";
import { PersonalitiesFilters } from "@/components/personalities/PersonalitiesFilters";
import { AddPersonalityDialog } from "@/components/personalities/AddPersonalityDialog";
import { usePersonalities, PersonalityFilters } from "@/hooks/usePersonalities";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Plus } from "lucide-react";

export default function Personalities() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Get profession from URL parameters
  const professionFromUrl = searchParams.get('profession');
  
  const [filters, setFilters] = useState<PersonalityFilters>({ 
    page: 1, 
    limit: 100,
    profession: professionFromUrl || undefined
  });
  const [selectedPersonality, setSelectedPersonality] = useState(null);
  
  // Update filters when URL changes
  useEffect(() => {
    const profession = searchParams.get('profession');
    if (profession !== filters.profession) {
      setFilters(prev => ({ ...prev, profession: profession || undefined, page: 1 }));
    }
  }, [searchParams, filters.profession]);
  
  const { personalities, totalCount, loading, error } = usePersonalities(filters);

  // Randomize the order of personalities on each render
  const randomizedPersonalities = useMemo(() => {
    if (!personalities || personalities.length === 0) return [];
    
    const shuffled = [...personalities];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [personalities]);


  const handlePersonalityClick = (personality: any) => {
    setSelectedPersonality(personality);
    // Here you would typically navigate to a detail page or open a modal
    console.log('Selected personality:', personality);
  };

  const handleFiltersChange = (newFilters: PersonalityFilters) => {
    setFilters({ ...newFilters, page: 1, limit: 100 }); // Reset to page 1 when filters change
  };


  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error Loading Personalities</h3>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <Card className="mb-8">
          <CardContent className="p-8 text-center">
            <h1 className="text-5xl font-bold text-foreground mb-4">
              Personalities
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Discover inspiring LGBTQ+ personalities who have made significant contributions to society
            </p>
            {user && (
              <div className="mt-6">
                <AddPersonalityDialog onSuccess={() => window.location.reload()} />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mb-8">
          <PersonalitiesFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
          />
        </div>

        {/* Results */}
        {!loading && personalities.length > 0 && (
          <div className="flex items-center justify-between mb-6 p-4 bg-card rounded-lg border">
            <div className="flex items-center gap-4">
              <p className="text-muted-foreground font-medium">
                Found {personalities.length} result{personalities.length !== 1 ? 's' : ''}
              </p>
              {filters.search && (
                <Badge variant="secondary">
                  Searching: "{filters.search}"
                </Badge>
              )}
              {filters.profession && (
                <Badge variant="secondary">
                  Profession: "{filters.profession}"
                </Badge>
              )}
            </div>
          </div>
        )}

        {randomizedPersonalities.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No personalities found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your search criteria or filters.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {randomizedPersonalities.map((personality) => (
              <PersonalityCard
                key={personality.id}
                personality={personality}
                onClick={() => handlePersonalityClick(personality)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
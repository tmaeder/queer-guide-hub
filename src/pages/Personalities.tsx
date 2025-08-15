import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PersonalityCard } from "@/components/personalities/PersonalityCard";
import { PersonalitiesFilters } from "@/components/personalities/PersonalitiesFilters";
import { usePersonalities, PersonalityFilters } from "@/hooks/usePersonalities";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Star, Plus, Search } from "lucide-react";

export default function Personalities() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<PersonalityFilters>({});
  const [selectedPersonality, setSelectedPersonality] = useState(null);
  
  const { personalities, loading, error } = usePersonalities(filters);
  const { personalities: featuredPersonalities } = usePersonalities({ 
    featured_only: true, 
    limit: 6 
  });

  const handlePersonalityClick = (personality: any) => {
    setSelectedPersonality(personality);
    // Here you would typically navigate to a detail page or open a modal
    console.log('Selected personality:', personality);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-80 w-full" />
              ))}
            </div>
          </div>
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
    <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-muted/20">
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Users className="h-4 w-4" />
            Queer Personalities Directory
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Celebrating{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              LGBTQ+ Icons
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Discover inspiring stories from LGBTQ+ personalities who have made significant contributions 
            to arts, activism, politics, and society throughout history and today.
          </p>
          
          {user && (
            <Button size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              Add Personality
            </Button>
          )}
        </div>

        <Tabs defaultValue="all" className="space-y-8">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-3">
            <TabsTrigger value="all" className="gap-2">
              <Search className="h-4 w-4" />
              Browse All
            </TabsTrigger>
            <TabsTrigger value="featured" className="gap-2">
              <Star className="h-4 w-4" />
              Featured
            </TabsTrigger>
            <TabsTrigger value="recent" className="gap-2">
              <Users className="h-4 w-4" />
              Recently Added
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Filters Sidebar */}
              <div className="lg:col-span-1">
                <PersonalitiesFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                />
              </div>

              {/* Results */}
              <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold">
                      {personalities.length} Personalities
                    </h2>
                    {filters.search && (
                      <Badge variant="secondary">
                        Searching: "{filters.search}"
                      </Badge>
                    )}
                  </div>
                </div>

                {personalities.length === 0 ? (
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
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {personalities.map((personality) => (
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
          </TabsContent>

          <TabsContent value="featured" className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Featured Personalities</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Highlighted personalities who have made exceptional contributions to LGBTQ+ rights and representation.
              </p>
            </div>

            {featuredPersonalities.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No featured personalities yet</h3>
                    <p className="text-muted-foreground">
                      Featured personalities will appear here once they are selected by our team.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {featuredPersonalities.map((personality) => (
                  <PersonalityCard
                    key={personality.id}
                    personality={personality}
                    onClick={() => handlePersonalityClick(personality)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="recent" className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Recently Added</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                The latest additions to our growing directory of LGBTQ+ personalities.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {personalities
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 12)
                .map((personality) => (
                  <PersonalityCard
                    key={personality.id}
                    personality={personality}
                    onClick={() => handlePersonalityClick(personality)}
                  />
                ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
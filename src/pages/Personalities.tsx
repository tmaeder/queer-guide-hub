import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PersonalityCard } from "@/components/personalities/PersonalityCard";
import { PersonalitiesFilters } from "@/components/personalities/PersonalitiesFilters";
import { AddPersonalityDialog } from "@/components/personalities/AddPersonalityDialog";
import { usePersonalities, PersonalityFilters } from "@/hooks/usePersonalities";
import { usePersonalityStats } from "@/hooks/usePersonalityStats";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Star, Plus, Search, CheckCircle, Heart, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Personalities() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<PersonalityFilters>({ page: 1, limit: 100 });
  const [selectedPersonality, setSelectedPersonality] = useState(null);
  
  const { personalities, totalCount, loading, error } = usePersonalities(filters);
  const { personalities: featuredPersonalities } = usePersonalities({ 
    featured_only: true, 
    limit: 6 
  });
  const { stats, loading: statsLoading } = usePersonalityStats();

  const totalPages = Math.ceil(totalCount / (filters.limit || 100));
  const currentPage = filters.page || 1;

  const handlePersonalityClick = (personality: any) => {
    setSelectedPersonality(personality);
    // Here you would typically navigate to a detail page or open a modal
    console.log('Selected personality:', personality);
  };

  const handleFiltersChange = (newFilters: PersonalityFilters) => {
    setFilters({ ...newFilters, page: 1, limit: 100 }); // Reset to page 1 when filters change
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
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
    <div className="min-h-screen">
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
            <AddPersonalityDialog onSuccess={() => window.location.reload()} />
          )}
        </div>

        {/* Stats Section */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
            <Card className="text-center">
              <CardContent className="py-4">
                <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Personalities</div>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="py-4">
                <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
                <div className="text-2xl font-bold">{stats.verified.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Verified</div>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="py-4">
                <Star className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
                <div className="text-2xl font-bold">{stats.featured.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Featured</div>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="py-4">
                <Heart className="h-6 w-6 mx-auto mb-2 text-red-500" />
                <div className="text-2xl font-bold">{stats.living.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Living</div>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="py-4">
                <Users className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <div className="text-2xl font-bold">{stats.deceased.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Historical</div>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="py-4">
                <Clock className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                <div className="text-2xl font-bold">{stats.recentlyAdded.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Added This Month</div>
              </CardContent>
            </Card>
          </div>
        )}

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
                  onFiltersChange={handleFiltersChange}
                />
              </div>

              {/* Results */}
              <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold">
                      {personalities.length} Results
                      {stats && totalCount > 0 && (
                        <span className="text-lg font-normal text-muted-foreground ml-2">
                          of {totalCount.toLocaleString()} total (Page {currentPage} of {totalPages})
                        </span>
                      )}
                    </h2>
                    {filters.search && (
                      <Badge variant="secondary">
                        Searching: "{filters.search}"
                      </Badge>
                    )}
                  </div>
                  
                  {/* Items per page selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Per page:</span>
                    <Select 
                      value={(filters.limit || 100).toString()} 
                      onValueChange={(value) => setFilters(prev => ({ ...prev, limit: parseInt(value), page: 1 }))}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
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
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {personalities.map((personality) => (
                        <PersonalityCard
                          key={personality.id}
                          personality={personality}
                          onClick={() => handlePersonalityClick(personality)}
                        />
                      ))}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-8">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                          >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
                          </span>
                          <Select
                            value={currentPage.toString()}
                            onValueChange={(value) => handlePageChange(parseInt(value))}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => (
                                <SelectItem key={i + 1} value={(i + 1).toString()}>
                                  {i + 1}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </>
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
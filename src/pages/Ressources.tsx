import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useCentralizedTags } from "@/hooks/useCentralizedTags";
import { DirectorySearch } from "@/components/directory/DirectorySearch";
import { supabase } from "@/integrations/supabase/client";
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Tag, Users, Calendar, MapPin, ShoppingBag, Heart, Brain, Upload, Search, Grid3X3, List, Filter, TrendingUp, Sparkles, Eye, Clock, BarChart3, Briefcase } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
type ViewMode = "overview" | "category" | "subcategory" | "search" | "tag-detail" | "professions";
type DisplayMode = "grid" | "list";
type SortOption = "alphabetical" | "usage" | "recent" | "popular";
export default function Ressources() {
  const {
    tagName
  } = useParams<{
    tagName: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    allTags,
    tagsByCategory,
    loading,
    error,
    searchTags
  } = useCentralizedTags();
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("grid");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("alphabetical");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [processingImages, setProcessingImages] = useState(false);
  const [categorizingTags, setCategorizingTags] = useState(false);
  const [tagUsageCounts, setTagUsageCounts] = useState<Record<string, number>>({});
  const [professions, setProfessions] = useState<string[]>([]);
  const [selectedProfession, setSelectedProfession] = useState<string>("");

  // Load professions from personalities
  useEffect(() => {
    const loadProfessions = async () => {
      try {
        const {
          data
        } = await supabase.from('personalities').select('profession').not('profession', 'is', null);
        if (data) {
          const uniqueProfessions = [...new Set(data.map(p => p.profession).filter(Boolean))].sort();
          setProfessions(uniqueProfessions);
        }
      } catch (error) {
        console.error('Error loading professions:', error);
      }
    };
    loadProfessions();
  }, []);

  // Handle profession filtering from URL params
  useEffect(() => {
    const profession = searchParams.get('profession');
    if (profession) {
      setSelectedProfession(profession);
      setViewMode("search");
      setSearchQuery(profession);
    }
  }, [searchParams]);

  // Calculate real usage counts for tags
  useEffect(() => {
    const calculateUsageCounts = async () => {
      if (allTags.length === 0) return;
      const usageCounts: Record<string, number> = {};
      try {
        const {
          data: venues
        } = await supabase.from('venues').select('tags').not('tags', 'is', null);
        const {
          data: groups
        } = await supabase.from('community_groups').select('tags').not('tags', 'is', null);
        const {
          data: events
        } = await supabase.from('events').select('target_groups').not('target_groups', 'is', null);
        for (const tag of allTags) {
          let count = 0;
          if (venues) {
            count += venues.filter(venue => venue.tags && venue.tags.includes(tag.name)).length;
          }
          if (groups) {
            count += groups.filter(group => group.tags && group.tags.includes(tag.name)).length;
          }
          if (events) {
            count += events.filter(event => event.target_groups && event.target_groups.includes(tag.name)).length;
          }
          usageCounts[tag.name] = count;
        }
        setTagUsageCounts(usageCounts);
      } catch (error) {
        console.error('Error calculating tag usage:', error);
      }
    };
    calculateUsageCounts();
  }, [allTags]);

  // Handle route parameter for individual tag pages
  useEffect(() => {
    if (tagName && allTags.length > 0) {
      const decodedTagName = decodeURIComponent(tagName);
      const foundTag = allTags.find(tag => tag.name.toLowerCase() === decodedTagName.toLowerCase());
      if (foundTag) {
        setSelectedTag(foundTag);
        setViewMode("tag-detail");
      }
    }
  }, [tagName, allTags]);

  // Memoized filtered and sorted tags
  const filteredAndSortedTags = useMemo(() => {
    // Ensure all dependencies are initialized
    if (!allTags || !Array.isArray(allTags)) return [];
    if (!Array.isArray(searchResults)) return [];
    if (!tagUsageCounts || typeof tagUsageCounts !== 'object') return [];

    let filtered = viewMode === "search" ? searchResults : allTags;

    // Filter by category
    if (filterCategory !== "all") {
      filtered = filtered.filter(tag => tag.category === filterCategory);
    }

    // Sort tags
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "usage":
          return (tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0);
        case "popular":
          return (tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0);
        case "recent":
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case "alphabetical":
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [allTags, searchResults, filterCategory, sortBy, tagUsageCounts, viewMode]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = [...new Set(allTags.map(tag => tag.category).filter(Boolean))];
    return cats.sort();
  }, [allTags]);

  // Define subcategories for better organization
  const subcategories = useMemo(() => {
    const subCats: Record<string, Record<string, string[]>> = {};

    categories.forEach(category => {
      const categoryTags = allTags.filter(tag => tag.category === category);
      subCats[category] = {};

      // Create semantic subcategories based on tag names
      categoryTags.forEach(tag => {
        const name = tag.name.toLowerCase();
        let subCategory = 'Other';

        // Define subcategory rules based on category
        switch (category) {
          case 'Identity':
            if (name.includes('gay') || name.includes('lesbian') || name.includes('bisexual') || name.includes('heterosexual') || name.includes('pansexual') || name.includes('asexual') || name.includes('demisexual') || name.includes('queer') || name.includes('questioning')) {
              subCategory = 'Sexual Orientation';
            } else if (name.includes('trans') || name.includes('non-binary') || name.includes('gender') || name.includes('agender') || name.includes('genderfluid') || name.includes('bigender')) {
              subCategory = 'Gender Identity';
            } else if (name.includes('pronoun') || name.includes('he/') || name.includes('she/') || name.includes('they/')) {
              subCategory = 'Pronouns';
            } else if (name.includes('relationship') || name.includes('polyamor') || name.includes('monogam') || name.includes('aromantic')) {
              subCategory = 'Relationship Style';
            }
            break;

          case 'Health':
            if (name.includes('mental') || name.includes('therapy') || name.includes('depression') || name.includes('anxiety') || name.includes('counseling')) {
              subCategory = 'Mental Health';
            } else if (name.includes('sexual') || name.includes('std') || name.includes('hiv') || name.includes('prep') || name.includes('reproductive')) {
              subCategory = 'Sexual Health';
            } else if (name.includes('hormone') || name.includes('transition') || name.includes('surgery') || name.includes('medical')) {
              subCategory = 'Medical Care';
            }
            break;

          case 'Events':
            if (name.includes('pride') || name.includes('parade') || name.includes('march') || name.includes('rally')) {
              subCategory = 'Pride & Activism';
            } else if (name.includes('party') || name.includes('club') || name.includes('dance') || name.includes('music')) {
              subCategory = 'Social & Entertainment';
            } else if (name.includes('workshop') || name.includes('education') || name.includes('seminar') || name.includes('conference')) {
              subCategory = 'Educational';
            } else if (name.includes('support') || name.includes('group') || name.includes('meeting')) {
              subCategory = 'Support Groups';
            }
            break;

          case 'Venues':
            if (name.includes('bar') || name.includes('club') || name.includes('pub') || name.includes('nightlife')) {
              subCategory = 'Nightlife';
            } else if (name.includes('restaurant') || name.includes('cafe') || name.includes('food') || name.includes('dining')) {
              subCategory = 'Food & Dining';
            } else if (name.includes('shop') || name.includes('store') || name.includes('retail') || name.includes('market')) {
              subCategory = 'Shopping';
            } else if (name.includes('gym') || name.includes('sport') || name.includes('fitness') || name.includes('recreation')) {
              subCategory = 'Recreation & Sports';
            } else if (name.includes('hotel') || name.includes('accommodation') || name.includes('lodging')) {
              subCategory = 'Accommodation';
            }
            break;

          case 'Community':
            if (name.includes('advocacy') || name.includes('activism') || name.includes('rights') || name.includes('political')) {
              subCategory = 'Advocacy & Rights';
            } else if (name.includes('support') || name.includes('help') || name.includes('crisis') || name.includes('counseling')) {
              subCategory = 'Support Services';
            } else if (name.includes('youth') || name.includes('teen') || name.includes('young') || name.includes('student')) {
              subCategory = 'Youth & Students';
            } else if (name.includes('senior') || name.includes('elder') || name.includes('older')) {
              subCategory = 'Seniors';
            }
            break;

          default:
            // No alphabetical grouping - keep all in "Other" category
            subCategory = 'Other';
            break;
        }

        if (!subCats[category][subCategory]) {
          subCats[category][subCategory] = [];
        }
        subCats[category][subCategory].push(tag.name);
      });
    });

    return subCats;
  }, [allTags, categories]);
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      const results = await searchTags(query);
      setSearchResults(results);
      setViewMode("search");
    } else {
      setViewMode("overview");
      setSearchResults([]);
    }
  };
  const handleTagClick = (tag: any) => {
    setSelectedTag(tag);
    setViewMode("tag-detail");
    navigate(`/resources/${encodeURIComponent(tag.name)}`);
  };
  const handleBack = () => {
    if (viewMode === "tag-detail") {
      setViewMode(selectedSubcategory ? "subcategory" : selectedCategory ? "category" : "overview");
      navigate('/resources');
    } else if (viewMode === "subcategory") {
      setViewMode("category");
      setSelectedSubcategory("");
    } else if (viewMode === "category") {
      setViewMode("overview");
      setSelectedCategory("");
    } else if (viewMode === "professions") {
      setViewMode("overview");
    } else if (viewMode === "search") {
      setViewMode("overview");
      setSearchQuery("");
      setSearchResults([]);
    }
  };
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "events":
        return Calendar;
      case "venues":
        return MapPin;
      case "marketplace":
        return ShoppingBag;
      case "community":
        return Users;
      case "gender-identity":
        return Heart;
      case "health":
        return Brain;
      case "sexuality":
        return Heart;
      case "relationships":
        return Users;
      case "activism":
        return Tag;
      case "support":
        return Users;
      case "lifestyle":
        return Tag;
      case "dating":
        return Heart;
      case "family":
        return Users;
      case "workplace":
        return Tag;
      case "legal":
        return Tag;
      case "education":
        return Tag;
      case "arts":
        return Tag;
      case "sports":
        return Tag;
      case "technology":
        return Tag;
      case "travel":
        return MapPin;
      case "fashion":
        return Tag;
      case "content":
        return Tag;
      default:
        return Tag;
    }
  };
  const storeTagImages = async () => {
    if (allTags.length === 0) return;
    setProcessingImages(true);
    toast({
      title: "Processing Started",
      description: `Processing images for ${allTags.length} tags. This may take a while...`
    });
    try {
      let successCount = 0;
      let errorCount = 0;
      for (let i = 0; i < allTags.length; i++) {
        const tag = allTags[i];
        try {
          const {
            data,
            error
          } = await supabase.functions.invoke('store-tag-images', {
            body: {
              tagId: tag.id,
              tagName: tag.name
            }
          });
          if (error) {
            errorCount++;
          } else if (data?.success) {
            successCount++;
          } else {
            errorCount++;
          }
          if ((i + 1) % 10 === 0 || i === allTags.length - 1) {
            toast({
              title: "Processing Progress",
              description: `Processed ${i + 1}/${allTags.length} tags (${successCount} successful)`
            });
          }
        } catch (err) {
          errorCount++;
        }
      }
      toast({
        title: "Processing Complete",
        description: `Processed ${allTags.length} tags. ${successCount} successful, ${errorCount} failed.`,
        variant: errorCount > 0 ? "destructive" : "default"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Error processing tag images",
        variant: "destructive"
      });
    } finally {
      setProcessingImages(false);
    }
  };
  const categorizeAllTags = async () => {
    setCategorizingTags(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('categorize-tags');
      if (error) {
        toast({
          title: "Categorization failed",
          description: `Failed to categorize tags: ${error.message}`,
          variant: "destructive"
        });
      } else if (data?.success) {
        toast({
          title: "Tags categorized",
          description: `Successfully categorized ${data.categorized_count} tags! Refreshing...`
        });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        toast({
          title: "Unexpected response",
          description: "Received unexpected response from categorization service",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to categorize tags",
        variant: "destructive"
      });
    } finally {
      setCategorizingTags(false);
    }
  };
  if (loading) {
    return <Container maxWidth="lg" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Skeleton style={{ height: 32, width: 192 }} />
            <Skeleton style={{ height: 40, width: 128 }} />
          </Box>
          <Skeleton style={{ height: 48, width: '100%' }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 2 }}>
            {Array.from({
            length: 12
          }).map((_, i) => <Card key={i} style={{ overflow: 'hidden' }}>
                <Skeleton style={{ aspectRatio: '4/3', width: '100%' }} />
                <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Skeleton style={{ height: 16, width: '100%' }} />
                  <Skeleton style={{ height: 12, width: 64 }} />
                </Box>
              </Card>)}
          </Box>
        </Box>
      </Container>;
  }
  if (error) {
    return <Container maxWidth="lg" sx={{ p: 3 }}>
        <Card style={{ borderColor: 'var(--destructive)' }}>
          <CardContent style={{ padding: 24, textAlign: 'center' }}>
            <Typography color="error">Something went wrong while loading resources. Please try again later.</Typography>
          </CardContent>
        </Card>
      </Container>;
  }

  // Render Tag Detail View
  if (viewMode === "tag-detail" && selectedTag) {
    return <Container maxWidth="lg" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button variant="outline" onClick={handleBack} style={{ flexShrink: 0 }}>
              <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
              Back
            </Button>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0 }} style={{ backgroundColor: selectedTag.color }} />
              <Typography variant="h4" sx={{ fontWeight: 700 }}>#{selectedTag.name}</Typography>
              <Badge variant="secondary">
                {tagUsageCounts[selectedTag.name] || 0} uses
              </Badge>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {selectedTag.image_url && <Card style={{ overflow: 'hidden' }}>
                  <Box sx={{ aspectRatio: '16/9' }}>
                    <Box
                      component="img"
                      src={selectedTag.image_url}
                      alt={`${selectedTag.name} themed image`}
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </Box>
                </Card>}

              {selectedTag.description && <Card>
                  <CardHeader>
                    <CardTitle>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Eye style={{ width: 20, height: 20 }} />
                        Description
                      </Box>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Typography color="text.secondary">{selectedTag.description}</Typography>
                  </CardContent>
                </Card>}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <BarChart3 style={{ width: 20, height: 20 }} />
                      Usage Statistics
                    </Box>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Total Usage</Typography>
                      <Badge variant="outline">{tagUsageCounts[selectedTag.name] || 0}</Badge>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Category</Typography>
                      <Badge variant="secondary">{selectedTag.category || 'Uncategorized'}</Badge>
                    </Box>
                    {selectedTag.created_at && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2">Created</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(selectedTag.created_at).toLocaleDateString()}
                        </Typography>
                      </Box>}
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </Box>
        </Box>
      </Container>;
  }
  return <Box sx={{ minHeight: '100vh' }}>
      <Container maxWidth="xl" sx={{ px: 2, py: 4 }}>
        {/* Header */}
        <Card style={{ marginBottom: 32 }}>
          <CardContent style={{ padding: 32, textAlign: 'center' }}>
            <Typography variant="h3" sx={{ fontWeight: 700, mb: 2, color: 'text.primary' }}>
              Resources
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ mb: 4, maxWidth: '42rem', mx: 'auto' }}>
              Discover and explore LGBTQ+ community tags, resources, and professions
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <Badge variant="outline">
                {allTags.length} Total Tags
              </Badge>
              <Badge variant="outline">
                {categories.length} Categories
              </Badge>
            </Box>
          </CardContent>
        </Card>

        {/* Content */}
        <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Categories Overview */}
            {viewMode === "overview" && (
              <Card style={{ marginBottom: 32 }}>
                <CardHeader>
                  <CardTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Grid3X3 style={{ width: 24, height: 24, color: '#333333' }} />
                      <Typography variant="h5" component="span">Browse by Category</Typography>
                    </Box>
                  </CardTitle>
                  <Typography color="text.secondary">
                    Explore tags organized by different categories
                  </Typography>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
                    {categories.map((category, index) => {
                      const Icon = getCategoryIcon(category);
                      const categoryTags = allTags.filter(tag => tag.category === category);
                      return (
                        <Card
                          key={category}
                          style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                          onClick={() => {
                            setFilterCategory(category);
                            setViewMode("category");
                            setSelectedCategory(category);
                          }}
                        >
                          <CardContent style={{ padding: 24, textAlign: 'center' }}>
                            <Box sx={{ mb: 2 }}>
                              <Icon style={{ width: 48, height: 48, margin: '0 auto', color: '#333333' }} />
                            </Box>
                            <Typography sx={{ fontWeight: 600, fontSize: '1rem', mb: 1, textTransform: 'capitalize', transition: 'color 0.2s' }}>
                              {category}
                            </Typography>
                            <Badge variant="secondary">
                              {categoryTags.length} tags
                            </Badge>
                          </CardContent>
                        </Card>
                      );
                    })}

                    {/* Professions Category */}
                    <Card
                      style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                      onClick={() => {
                        setViewMode("professions");
                      }}
                    >
                      <CardContent style={{ padding: 24, textAlign: 'center' }}>
                        <Box sx={{ mb: 2 }}>
                          <Briefcase style={{ width: 48, height: 48, margin: '0 auto', color: '#333333' }} />
                        </Box>
                        <Typography sx={{ fontWeight: 600, fontSize: '1rem', mb: 1, textTransform: 'capitalize', transition: 'color 0.2s' }}>
                          Professions
                        </Typography>
                        <Badge variant="secondary">
                          {professions.length} professions
                        </Badge>
                      </CardContent>
                    </Card>
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Category View with Subcategories */}
            {viewMode === "category" && selectedCategory && (
              <Card style={{ marginBottom: 32 }}>
                <CardHeader>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Button variant="outline" onClick={handleBack}>
                      <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
                      Back
                    </Button>
                    <Box>
                      <CardTitle>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'capitalize' }}>
                          {(() => {
                            const IconComponent = getCategoryIcon(selectedCategory);
                            return <IconComponent style={{ width: 24, height: 24, color: '#333333' }} />;
                          })()}
                          <Typography variant="h5" component="span">{selectedCategory} Subcategories</Typography>
                        </Box>
                      </CardTitle>
                      <Typography color="text.secondary">
                        Browse subcategories within {selectedCategory}
                      </Typography>
                    </Box>
                  </Box>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
                    {Object.entries(subcategories[selectedCategory] || {}).map(([subCategory, tagNames]) => (
                      <Card
                        key={subCategory}
                        style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                        onClick={() => {
                          setSelectedSubcategory(subCategory);
                          setViewMode("subcategory");
                        }}
                      >
                        <CardContent style={{ padding: 24 }}>
                          <Typography sx={{ fontWeight: 600, fontSize: '1.125rem', mb: 1, transition: 'color 0.2s' }}>
                            {subCategory}
                          </Typography>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Badge variant="secondary">
                              {tagNames.length} tags
                            </Badge>
                            <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {tagNames.slice(0, 3).join(", ")}
                              {tagNames.length > 3 && ` and ${tagNames.length - 3} more...`}
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Subcategory View */}
            {viewMode === "subcategory" && selectedCategory && selectedSubcategory && (
              <Card style={{ marginBottom: 32 }}>
                <CardHeader>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Button variant="outline" onClick={handleBack}>
                      <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
                      Back
                    </Button>
                    <Box>
                      <CardTitle>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Tag style={{ width: 24, height: 24, color: '#333333' }} />
                          <Typography variant="h5" component="span">{selectedSubcategory}</Typography>
                        </Box>
                      </CardTitle>
                      <Typography color="text.secondary">
                        Tags in {selectedCategory} &rarr; {selectedSubcategory}
                      </Typography>
                    </Box>
                  </Box>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
                    {(subcategories[selectedCategory]?.[selectedSubcategory] || []).map((tagName) => {
                      const tag = allTags.find(t => t.name === tagName);
                      if (!tag) return null;

                      return (
                        <Card
                          key={tag.id}
                          style={{ cursor: 'pointer', transition: 'all 0.3s', overflow: 'hidden' }}
                          onClick={() => handleTagClick(tag)}
                        >
                          <Box sx={{ aspectRatio: '4/3', width: '100%', overflow: 'hidden', position: 'relative' }}>
                            {tag.image_url ? (
                              <Box
                                component="img"
                                src={tag.image_url}
                                alt={`${tag.name} themed image`}
                                sx={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.2s' }}
                                onError={(e: any) => {
                                  e.currentTarget.src = '/placeholder.svg';
                                }}
                              />
                            ) : (
                              <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                                <Tag style={{ width: 48, height: 48, opacity: 0.6, color: '#999999' }} />
                              </Box>
                            )}
                            <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.2), transparent)', opacity: 0, transition: 'opacity 0.2s' }} />
                          </Box>
                          <CardContent style={{ padding: 16 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                              <Box
                                sx={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, transition: 'transform 0.2s' }}
                                style={{ backgroundColor: tag.color }}
                              />
                              <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.2s' }}>
                                {tag.name}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                {selectedSubcategory}
                              </Typography>
                              {tagUsageCounts[tag.name] > 0 && (
                                <Badge variant="outline" style={{ transition: 'color 0.2s, background-color 0.2s' }}>
                                  {tagUsageCounts[tag.name]} uses
                                </Badge>
                              )}
                            </Box>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Professions View */}
            {viewMode === "professions" && (
              <Card style={{ marginBottom: 32 }}>
                <CardHeader>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Button variant="outline" onClick={handleBack}>
                      <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
                      Back
                    </Button>
                    <Box>
                      <CardTitle>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Briefcase style={{ width: 24, height: 24, color: '#333333' }} />
                          <Typography variant="h5" component="span">LGBTQ+ Personalities by Profession</Typography>
                        </Box>
                      </CardTitle>
                      <Typography color="text.secondary">
                        Explore different professions represented by LGBTQ+ personalities in our directory
                      </Typography>
                    </Box>
                  </Box>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 2 }}>
                    {professions.map((profession, index) => (
                      <Button
                        key={profession}
                        variant={selectedProfession === profession ? "default" : "outline"}
                        style={{ height: 'auto', padding: 16, textAlign: 'left', justifyContent: 'flex-start', transition: 'all 0.3s', animationDelay: `${index * 30}ms` }}
                        onClick={() => {
                          if (selectedProfession === profession) {
                            setSelectedProfession("");
                            navigate('/personalities');
                          } else {
                            setSelectedProfession(profession);
                            navigate(`/personalities?profession=${encodeURIComponent(profession)}`);
                          }
                        }}
                      >
                        <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, transition: 'color 0.2s' }}>
                          {profession}
                        </Box>
                      </Button>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Search and Filters */}
            <Card style={{ marginBottom: 32 }}>
              <CardContent style={{ padding: 24 }}>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
                  <Box sx={{ position: 'relative', flex: 1 }}>
                    <Search style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, color: '#999999' }} />
                    <Input
                      placeholder="Search tags, categories, descriptions..."
                      value={searchQuery}
                      onChange={e => handleSearch(e.target.value)}
                      style={{ paddingLeft: 48, height: 48, fontSize: '1rem' }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                      <SelectTrigger style={{ width: 192, height: 48 }}>
                        <Filter style={{ width: 16, height: 16, marginRight: 8 }} />
                        <SelectValue placeholder="Filter by category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map(category => (
                          <SelectItem key={category} value={category} style={{ textTransform: 'capitalize' }}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
                      <SelectTrigger style={{ width: 192, height: 48 }}>
                        <TrendingUp style={{ width: 16, height: 16, marginRight: 8 }} />
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alphabetical">Alphabetical</SelectItem>
                        <SelectItem value="usage">Most Used</SelectItem>
                        <SelectItem value="popular">Popular</SelectItem>
                        <SelectItem value="recent">Recent</SelectItem>
                      </SelectContent>
                    </Select>
                  </Box>
                </Box>
              </CardContent>
            </Card>
            </Box>
        </Box>

        {/* Admin Controls with enhanced design */}
        {viewMode === "overview" && (
          <Card style={{ border: 0, boxShadow: '0px 3px 5px -1px rgba(0,0,0,0.2), 0px 6px 10px 0px rgba(0,0,0,0.14), 0px 1px 18px 0px rgba(0,0,0,0.12)' }}>
            <CardHeader>
              <CardTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Brain style={{ width: 24, height: 24, color: '#333333' }} />
                  <Typography variant="h6" component="span">Admin Controls</Typography>
                </Box>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                <Button
                  onClick={storeTagImages}
                  disabled={processingImages}
                  variant="outline"
                  size="lg"
                  style={{ transition: 'all 0.2s' }}
                >
                  <Upload style={{ width: 16, height: 16, marginRight: 8 }} />
                  {processingImages ? 'Processing...' : 'Reimport All Images'}
                </Button>
                <Button
                  onClick={categorizeAllTags}
                  disabled={categorizingTags}
                  variant="outline"
                  size="lg"
                  style={{ transition: 'all 0.2s' }}
                >
                  <Brain style={{ width: 16, height: 16, marginRight: 8 }} />
                  {categorizingTags ? 'Categorizing...' : 'AI Auto-Categorize'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Enhanced Results Info */}
        {(viewMode === "search" || (viewMode === "overview" && (searchQuery || filterCategory !== "all"))) && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {viewMode === "search" ? "Search Results" : filterCategory !== "all" ? `${filterCategory} Tags` : "All Tags"}
              </Typography>
              <Badge variant="secondary">
                {filteredAndSortedTags.length} tags
              </Badge>
            </Box>
          </Box>
        )}

        {/* Enhanced Tags Display */}
        <Box sx={displayMode === "grid" ? { display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 3 } : { display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredAndSortedTags.map((tag, index) => (
            <Card
              key={`${tag.id}-${index}`}
              style={{
                cursor: 'pointer',
                transition: 'all 0.3s',
                animationDelay: `${index * 20}ms`,
                overflow: displayMode === "grid" ? 'hidden' : undefined,
                ...(displayMode === "list" ? { display: 'flex', alignItems: 'center', padding: 16 } : {})
              }}
              onClick={() => handleTagClick(tag)}
            >
              {displayMode === "grid" ? (
                <>
                  <Box sx={{ aspectRatio: '4/3', width: '100%', overflow: 'hidden', position: 'relative' }}>
                    {tag.image_url ? (
                      <Box
                        component="img"
                        src={tag.image_url}
                        alt={`${tag.name} themed image`}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.2s' }}
                        onError={(e: any) => {
                          e.currentTarget.src = '/placeholder.svg';
                        }}
                      />
                    ) : (
                      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                        <Tag style={{ width: 48, height: 48, opacity: 0.6, color: '#999999' }} />
                      </Box>
                    )}
                    <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.2), transparent)', opacity: 0, transition: 'opacity 0.2s' }} />
                  </Box>
                  <CardContent style={{ padding: 16 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Box
                        sx={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, transition: 'transform 0.2s' }}
                        style={{ backgroundColor: tag.color }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.2s' }}>
                        {tag.name}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize', fontWeight: 500 }}>
                        {tag.category || 'Uncategorized'}
                      </Typography>
                      {tagUsageCounts[tag.name] > 0 && (
                        <Badge variant="outline" style={{ transition: 'color 0.2s, background-color 0.2s' }}>
                          {tagUsageCounts[tag.name]} uses
                        </Badge>
                      )}
                    </Box>
                  </CardContent>
                </>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                  <Box sx={{ width: 80, height: 80, borderRadius: 2, overflow: 'hidden', flexShrink: 0, transition: 'transform 0.2s', bgcolor: 'action.hover' }}>
                    {tag.image_url ? (
                      <Box
                        component="img"
                        src={tag.image_url}
                        alt={`${tag.name} themed image`}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Tag style={{ width: 32, height: 32, opacity: 0.6, color: '#999999' }} />
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box
                        sx={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0 }}
                        style={{ backgroundColor: tag.color }}
                      />
                      <Typography sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1rem', transition: 'color 0.2s' }}>
                        {tag.name}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tag.description || tag.category || 'No description'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                    <Badge variant="outline" style={{ textTransform: 'capitalize' }}>
                      {tag.category || 'Uncategorized'}
                    </Badge>
                    {tagUsageCounts[tag.name] > 0 && (
                      <Badge variant="secondary">
                        {tagUsageCounts[tag.name]} uses
                      </Badge>
                    )}
                  </Box>
                </Box>
              )}
            </Card>
          ))}
        </Box>

        {filteredAndSortedTags.length === 0 && (
          <Card style={{ borderWidth: 2, borderStyle: 'dashed' }}>
            <CardContent style={{ padding: 64, textAlign: 'center' }}>
              <Box sx={{ mx: 'auto', mb: 3, width: 80, height: 80, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Tag style={{ width: 40, height: 40, opacity: 0.5, color: '#999999' }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 1.5 }} color="text.secondary">No tags found</Typography>
              <Typography color="text.secondary" sx={{ maxWidth: '28rem', mx: 'auto' }}>
                {viewMode === "search"
                  ? "Try adjusting your search terms or filters to find what you're looking for"
                  : "No tags are available yet. Check back later or contact support if this seems incorrect"}
              </Typography>
            </CardContent>
          </Card>
        )}
      </Container>
    </Box>;
}

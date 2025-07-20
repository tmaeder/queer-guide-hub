import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Search, X, Filter, MapPin, Loader, Calendar, Tag, Building, Heart } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

type NewsCategory = Tables<'news_categories'>;
type NewsSource = Tables<'news_sources'>;

interface NewsFiltersProps {
  categories: NewsCategory[];
  onFiltersChange: (filters: {
    category?: string;
    search?: string;
    sentiment?: string;
    tags?: string[];
    source?: string;
    nearMe?: boolean;
    userLocation?: { lat: number; lng: number; };
    dateRange?: string;
  }) => void;
  trendingTags?: { tag: string; count: number; }[];
  sources?: NewsSource[];
}

export const NewsFilters = ({
  categories,
  onFiltersChange,
  trendingTags = [],
  sources = []
}: NewsFiltersProps) => {
  const { toast } = useToast();
  const [category, setCategory] = useState<string>("");
  const [sentiment, setSentiment] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [dateRange, setDateRange] = useState<string>("");

  const triggerFiltersChange = () => {
    onFiltersChange({
      category: category || undefined,
      sentiment: sentiment || undefined,
      source: source || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      nearMe,
      userLocation: userLocation || undefined,
      dateRange: dateRange || undefined
    });
  };

  const handleCategoryChange = (value: string) => {
    const newCategory = value === "all" ? "" : value;
    setCategory(newCategory);
    setTimeout(triggerFiltersChange, 0);
  };

  const handleSentimentChange = (value: string) => {
    const newSentiment = value === "all" ? "" : value;
    setSentiment(newSentiment);
    setTimeout(triggerFiltersChange, 0);
  };

  const handleSourceChange = (value: string) => {
    const newSource = value === "all" ? "" : value;
    setSource(newSource);
    setTimeout(triggerFiltersChange, 0);
  };

  const handleTagToggle = (tag: string) => {
    const newTags = selectedTags.includes(tag) 
      ? selectedTags.filter(t => t !== tag) 
      : [...selectedTags, tag];
    setSelectedTags(newTags);
    setTimeout(triggerFiltersChange, 0);
  };

  const handleNearMe = async () => {
    if (!nearMe) {
      setLocationLoading(true);
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(location);
        setNearMe(true);
        setTimeout(triggerFiltersChange, 0);
        toast({
          title: "Location found",
          description: "Showing news relevant to your location"
        });
      } catch (error) {
        toast({
          title: "Location Error",
          description: "Unable to get your location. Please allow location access.",
          variant: "destructive"
        });
      } finally {
        setLocationLoading(false);
      }
    } else {
      setNearMe(false);
      setUserLocation(null);
      setTimeout(triggerFiltersChange, 0);
    }
  };

  const handleDateRangeChange = (value: string) => {
    const newDateRange = value === "all" ? "" : value;
    setDateRange(newDateRange);
    setTimeout(triggerFiltersChange, 0);
  };

  const clearFilters = () => {
    setCategory("");
    setSentiment("");
    setSource("");
    setSelectedTags([]);
    setNearMe(false);
    setUserLocation(null);
    setDateRange("");
    onFiltersChange({});
  };

  const hasActiveFilters = category || sentiment || source || selectedTags.length > 0 || nearMe || dateRange;

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Filter className="h-5 w-5" />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Near Me */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span className="text-sm font-medium">Location</span>
            </div>
            <Switch
              checked={nearMe}
              onCheckedChange={handleNearMe}
              disabled={locationLoading}
            />
          </div>
          {nearMe && (
            <p className="text-xs text-muted-foreground">
              Showing news relevant to your location
            </p>
          )}
        </div>

        <Separator />

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              <span className="text-sm font-medium">Category</span>
            </div>
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.slug}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Source Filter */}
        {sources.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              <span className="text-sm font-medium">Source</span>
            </div>
            <Select value={source} onValueChange={handleSourceChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((src) => (
                  <SelectItem key={src.id} value={src.id}>
                    {src.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Sentiment Filter */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            <span className="text-sm font-medium">Sentiment</span>
          </div>
          <Select value={sentiment} onValueChange={handleSentimentChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All sentiments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sentiments</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="negative">Negative</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date Range Filter */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="text-sm font-medium">Published Date</span>
          </div>
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All dates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="year">This year</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2023">2023</SelectItem>
              <SelectItem value="2022">2022</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Trending Tags */}
        {trendingTags.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <span className="text-sm font-medium">Trending Tags</span>
              <div className="flex flex-wrap gap-2">
                {trendingTags.slice(0, 8).map(({ tag, count }) => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs"
                    onClick={() => handleTagToggle(tag)}
                  >
                    {tag} ({count})
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Selected Tags */}
        {selectedTags.length > 0 && (
          <div className="space-y-3">
            <span className="text-sm font-medium">Selected Tags</span>
            <div className="flex flex-wrap gap-2">
              {selectedTags.map(tag => (
                <Badge
                  key={tag}
                  variant="default"
                  className="cursor-pointer text-xs"
                  onClick={() => handleTagToggle(tag)}
                >
                  {tag}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <>
            <Separator />
            <Button variant="outline" onClick={clearFilters} className="w-full">
              Clear All Filters
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, X, Filter, MapPin, Loader } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
type NewsCategory = Tables<'news_categories'>;
interface NewsFiltersProps {
  categories: NewsCategory[];
  onFiltersChange: (filters: {
    category?: string;
    search?: string;
    sentiment?: string;
    tags?: string[];
    nearMe?: boolean;
    userLocation?: {
      lat: number;
      lng: number;
    };
  }) => void;
  trendingTags?: {
    tag: string;
    count: number;
  }[];
}
export const NewsFilters = ({
  categories,
  onFiltersChange,
  trendingTags = []
}: NewsFiltersProps) => {
  const {
    toast
  } = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [sentiment, setSentiment] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const handleSearchChange = (value: string) => {
    setSearch(value);
    onFiltersChange({
      category: category || undefined,
      search: value || undefined,
      sentiment: sentiment || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      nearMe,
      userLocation: userLocation || undefined
    });
  };
  const handleCategoryChange = (value: string) => {
    const newCategory = value === "all" ? "" : value;
    setCategory(newCategory);
    onFiltersChange({
      category: newCategory || undefined,
      search: search || undefined,
      sentiment: sentiment || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      nearMe,
      userLocation: userLocation || undefined
    });
  };
  const handleSentimentChange = (value: string) => {
    const newSentiment = value === "all" ? "" : value;
    setSentiment(newSentiment);
    onFiltersChange({
      category: category || undefined,
      search: search || undefined,
      sentiment: newSentiment || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      nearMe,
      userLocation: userLocation || undefined
    });
  };
  const handleTagToggle = (tag: string) => {
    const newTags = selectedTags.includes(tag) ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag];
    setSelectedTags(newTags);
    onFiltersChange({
      category: category || undefined,
      search: search || undefined,
      sentiment: sentiment || undefined,
      tags: newTags.length > 0 ? newTags : undefined,
      nearMe,
      userLocation: userLocation || undefined
    });
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
        onFiltersChange({
          category: category || undefined,
          search: search || undefined,
          sentiment: sentiment || undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          nearMe: true,
          userLocation: location
        });
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
      onFiltersChange({
        category: category || undefined,
        search: search || undefined,
        sentiment: sentiment || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined
      });
    }
  };
  const clearFilters = () => {
    setSearch("");
    setCategory("");
    setSentiment("");
    setSelectedTags([]);
    setNearMe(false);
    setUserLocation(null);
    onFiltersChange({});
  };
  const hasActiveFilters = search || category || sentiment || selectedTags.length > 0 || nearMe;
  return <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filter News
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search articles..." value={search} onChange={e => handleSearchChange(e.target.value)} className="pl-10" />
        </div>

        {/* Near Me Button */}
        <Button onClick={handleNearMe} variant={nearMe ? "default" : "outline"} disabled={locationLoading} className="w-full gap-2">
          {locationLoading ? <Loader className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {nearMe ? "Showing Local News" : "Near Me"}
        </Button>

        {/* Category Filter */}
        

        {/* Sentiment Filter */}
        

        {/* Trending Tags */}
        {trendingTags.length > 0 && <div className="space-y-2">
            <label className="text-sm font-medium">Trending Tags</label>
            <div className="flex flex-wrap gap-2">
              {trendingTags.slice(0, 10).map(({
            tag,
            count
          }) => <Badge key={tag} variant={selectedTags.includes(tag) ? "default" : "outline"} className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors" onClick={() => handleTagToggle(tag)}>
                  {tag} ({count})
                </Badge>)}
            </div>
          </div>}

        {/* Selected Tags */}
        {selectedTags.length > 0 && <div className="space-y-2">
            <label className="text-sm font-medium">Selected Tags</label>
            <div className="flex flex-wrap gap-2">
              {selectedTags.map(tag => <Badge key={tag} variant="default" className="cursor-pointer" onClick={() => handleTagToggle(tag)}>
                  {tag}
                  <X className="h-3 w-3 ml-1" />
                </Badge>)}
            </div>
          </div>}

        {/* Clear Filters */}
        {hasActiveFilters && <Button variant="outline" onClick={clearFilters} className="w-full">
            Clear All Filters
          </Button>}
      </CardContent>
    </Card>;
};
import { useState } from "react";
import { Search, X, Filter, ChevronDown, SortAsc, SortDesc, Navigation, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export interface PlacesFilters {
  continent: string;
  populationRange: string;
  isCapital: string;
  isMajorCity: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

interface PlacesSearchProps {
  onSearch: (query: string) => void;
  onFiltersChange: (filters: PlacesFilters) => void;
  onNearMeSearch?: (userLocation: { latitude: number; longitude: number }) => void;
  placeholder?: string;
}

export const PlacesSearch = ({
  onSearch,
  onFiltersChange,
  onNearMeSearch,
  placeholder = "Search countries, cities..."
}: PlacesSearchProps) => {
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [filters, setFilters] = useState<PlacesFilters>({
    continent: "all",
    populationRange: "all",
    isCapital: "all",
    isMajorCity: "all",
    sortBy: "name",
    sortOrder: "asc"
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  const handleClear = () => {
    setQuery("");
    onSearch("");
  };

  const handleFilterChange = (key: keyof PlacesFilters, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleSortOrderToggle = () => {
    const newOrder = filters.sortOrder === "asc" ? "desc" : "asc";
    handleFilterChange("sortOrder", newOrder);
  };

  const clearAllFilters = () => {
    const defaultFilters: PlacesFilters = {
      continent: "all",
      populationRange: "all",
      isCapital: "all",
      isMajorCity: "all",
      sortBy: "name",
      sortOrder: "asc"
    };
    setFilters(defaultFilters);
    onFiltersChange(defaultFilters);
  };

  const getActiveFilterCount = () => {
    return Object.values(filters).filter(value => value !== "all" && value !== "name" && value !== "asc").length;
  };

  const detectLocation = async () => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser');
      return;
    }

    if (!onNearMeSearch) {
      console.error('onNearMeSearch callback not provided');
      return;
    }

    setIsDetectingLocation(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes
        });
      });

      const { latitude, longitude } = position.coords;
      onNearMeSearch({ latitude, longitude });
    } catch (error) {
      console.error('Error detecting location:', error);
    } finally {
      setIsDetectingLocation(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box component="form" onSubmit={handleSubmit} sx={{ position: 'relative' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box sx={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
            <Input
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 40, paddingRight: 40 }}
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', height: 32, width: 32, padding: 0 }}
              >
                <X style={{ height: 16, width: 16 }} />
              </Button>
            )}
          </Box>

          {onNearMeSearch && (
            <Button
              type="button"
              variant="outline"
              onClick={detectLocation}
              disabled={isDetectingLocation}
              size="icon"
            >
              {isDetectingLocation ? (
                <Loader2 style={{ height: 16, width: 16, animation: 'spin 1s linear infinite' }} />
              ) : (
                <Navigation style={{ height: 16, width: 16 }} />
              )}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            size="icon"
            style={{ position: 'relative' }}
          >
            <Filter style={{ height: 16, width: 16 }} />
            {getActiveFilterCount() > 0 && (
              <Badge variant="secondary" style={{ position: 'absolute', top: -8, right: -8, height: 20, width: 20, padding: 0, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {getActiveFilterCount()}
              </Badge>
            )}
          </Button>
        </Box>
      </Box>

      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>Advanced Filters</Typography>
              {getActiveFilterCount() > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  style={{ fontSize: '0.75rem' }}
                >
                  Clear All
                </Button>
              )}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography component="label" variant="caption" sx={{ fontWeight: 500, color: 'var(--muted-foreground)' }}>Continent</Typography>
                <Select value={filters.continent} onValueChange={(value) => handleFilterChange("continent", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Continents" />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: 'var(--background)', zIndex: 50 }}>
                    <SelectItem value="all">All Continents</SelectItem>
                    <SelectItem value="africa">Africa</SelectItem>
                    <SelectItem value="asia">Asia</SelectItem>
                    <SelectItem value="europe">Europe</SelectItem>
                    <SelectItem value="north-america">North America</SelectItem>
                    <SelectItem value="south-america">South America</SelectItem>
                    <SelectItem value="oceania">Oceania</SelectItem>
                    <SelectItem value="antarctica">Antarctica</SelectItem>
                  </SelectContent>
                </Select>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography component="label" variant="caption" sx={{ fontWeight: 500, color: 'var(--muted-foreground)' }}>Population Range</Typography>
                <Select value={filters.populationRange} onValueChange={(value) => handleFilterChange("populationRange", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Sizes" />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: 'var(--background)', zIndex: 50 }}>
                    <SelectItem value="all">All Sizes</SelectItem>
                    <SelectItem value="small">Small (&lt; 100K)</SelectItem>
                    <SelectItem value="medium">Medium (100K - 1M)</SelectItem>
                    <SelectItem value="large">Large (1M - 5M)</SelectItem>
                    <SelectItem value="mega">Mega (&gt; 5M)</SelectItem>
                  </SelectContent>
                </Select>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography component="label" variant="caption" sx={{ fontWeight: 500, color: 'var(--muted-foreground)' }}>Capital Cities</Typography>
                <Select value={filters.isCapital} onValueChange={(value) => handleFilterChange("isCapital", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Cities" />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: 'var(--background)', zIndex: 50 }}>
                    <SelectItem value="all">All Cities</SelectItem>
                    <SelectItem value="true">Capital Cities Only</SelectItem>
                    <SelectItem value="false">Non-Capital Cities</SelectItem>
                  </SelectContent>
                </Select>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography component="label" variant="caption" sx={{ fontWeight: 500, color: 'var(--muted-foreground)' }}>Major Cities</Typography>
                <Select value={filters.isMajorCity} onValueChange={(value) => handleFilterChange("isMajorCity", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Cities" />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: 'var(--background)', zIndex: 50 }}>
                    <SelectItem value="all">All Cities</SelectItem>
                    <SelectItem value="true">Major Cities Only</SelectItem>
                    <SelectItem value="false">Non-Major Cities</SelectItem>
                  </SelectContent>
                </Select>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography component="label" variant="caption" sx={{ fontWeight: 500, color: 'var(--muted-foreground)' }}>Sort By</Typography>
                <Select value={filters.sortBy} onValueChange={(value) => handleFilterChange("sortBy", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sort by..." />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: 'var(--background)', zIndex: 50 }}>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="population">Population</SelectItem>
                    <SelectItem value="created_at">Date Added</SelectItem>
                  </SelectContent>
                </Select>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography component="label" variant="caption" sx={{ fontWeight: 500, color: 'var(--muted-foreground)' }}>Sort Order</Typography>
                <Button
                  variant="outline"
                  onClick={handleSortOrderToggle}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  {filters.sortOrder === "asc" ? (
                    <>
                      <SortAsc style={{ height: 16, width: 16, marginRight: 8 }} />
                      Ascending
                    </>
                  ) : (
                    <>
                      <SortDesc style={{ height: 16, width: 16, marginRight: 8 }} />
                      Descending
                    </>
                  )}
                </Button>
              </Box>
            </Box>

            {getActiveFilterCount() > 0 && (
              <Box sx={{ pt: 1 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>Active filters:</Typography>
                  {filters.continent !== "all" && (
                    <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                      Continent: {filters.continent}
                    </Badge>
                  )}
                  {filters.populationRange !== "all" && (
                    <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                      Size: {filters.populationRange}
                    </Badge>
                  )}
                  {filters.isCapital !== "all" && (
                    <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                      Capital: {filters.isCapital === "true" ? "Yes" : "No"}
                    </Badge>
                  )}
                  {filters.isMajorCity !== "all" && (
                    <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                      Major: {filters.isMajorCity === "true" ? "Yes" : "No"}
                    </Badge>
                  )}
                  {filters.sortBy !== "name" && (
                    <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                      Sort: {filters.sortBy}
                    </Badge>
                  )}
                  {filters.sortOrder !== "asc" && (
                    <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                      Order: {filters.sortOrder}
                    </Badge>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </CollapsibleContent>
      </Collapsible>
    </Box>
  );
};

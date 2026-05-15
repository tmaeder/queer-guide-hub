import { useState } from "react";
import { Search, X, Filter, SortAsc, SortDesc, Navigation, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

export interface DirectoryFilters {
  continent: string;
  populationRange: string;
  isCapital: string;
  isMajorCity: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

interface DirectorySearchProps {
  onSearch: (query: string) => void;
  onFiltersChange: (filters: DirectoryFilters) => void;
  onNearMeSearch?: (userLocation: { latitude: number; longitude: number }) => void;
  placeholder?: string;
}

export const DirectorySearch = ({
  onSearch,
  onFiltersChange,
  onNearMeSearch,
  placeholder = "Search countries, cities..."
}: DirectorySearchProps) => {
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [filters, setFilters] = useState<DirectoryFilters>({
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

  const handleFilterChange = (key: keyof DirectoryFilters, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleSortOrderToggle = () => {
    const newOrder = filters.sortOrder === "asc" ? "desc" : "asc";
    handleFilterChange("sortOrder", newOrder);
  };

  const clearAllFilters = () => {
    const defaultFilters: DirectoryFilters = {
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
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {onNearMeSearch && (
            <Button
              type="button"
              variant="outline"
              onClick={detectLocation}
              disabled={isDetectingLocation}
              size="icon"
            >
              {isDetectingLocation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Navigation className="h-4 w-4" />
              )}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            size="icon"
            className="relative"
          >
            <Filter className="h-4 w-4" />
            {getActiveFilterCount() > 0 && (
              <Badge variant="secondary" className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                {getActiveFilterCount()}
              </Badge>
            )}
          </Button>
        </div>
      </form>

      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleContent>
          <div className="flex flex-col gap-4">
            <div className="bg-muted/50 p-4 rounded-element flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Advanced Filters</p>
                {getActiveFilterCount() > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="text-xs"
                  >
                    Clear All
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">Continent</Label>
                  <Select value={filters.continent} onValueChange={(value) => handleFilterChange("continent", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Continents" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
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
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">Population Range</Label>
                  <Select value={filters.populationRange} onValueChange={(value) => handleFilterChange("populationRange", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Sizes" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="all">All Sizes</SelectItem>
                      <SelectItem value="small">Small (&lt; 100K)</SelectItem>
                      <SelectItem value="medium">Medium (100K - 1M)</SelectItem>
                      <SelectItem value="large">Large (1M - 5M)</SelectItem>
                      <SelectItem value="mega">Mega (&gt; 5M)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">Capital Cities</Label>
                  <Select value={filters.isCapital} onValueChange={(value) => handleFilterChange("isCapital", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Cities" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="all">All Cities</SelectItem>
                      <SelectItem value="true">Capital Cities Only</SelectItem>
                      <SelectItem value="false">Non-Capital Cities</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">Major Cities</Label>
                  <Select value={filters.isMajorCity} onValueChange={(value) => handleFilterChange("isMajorCity", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Cities" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="all">All Cities</SelectItem>
                      <SelectItem value="true">Major Cities Only</SelectItem>
                      <SelectItem value="false">Non-Major Cities</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">Sort By</Label>
                  <Select value={filters.sortBy} onValueChange={(value) => handleFilterChange("sortBy", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="population">Population</SelectItem>
                      <SelectItem value="created_at">Date Added</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">Sort Order</Label>
                  <Button
                    variant="outline"
                    onClick={handleSortOrderToggle}
                    className="w-full justify-start"
                  >
                    {filters.sortOrder === "asc" ? (
                      <>
                        <SortAsc className="h-4 w-4 mr-2" />
                        Ascending
                      </>
                    ) : (
                      <>
                        <SortDesc className="h-4 w-4 mr-2" />
                        Descending
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {getActiveFilterCount() > 0 && (
                <div className="pt-2">
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">Active filters:</span>
                    {filters.continent !== "all" && (
                      <Badge variant="secondary" className="text-xs">
                        Continent: {filters.continent}
                      </Badge>
                    )}
                    {filters.populationRange !== "all" && (
                      <Badge variant="secondary" className="text-xs">
                        Size: {filters.populationRange}
                      </Badge>
                    )}
                    {filters.isCapital !== "all" && (
                      <Badge variant="secondary" className="text-xs">
                        Capital: {filters.isCapital === "true" ? "Yes" : "No"}
                      </Badge>
                    )}
                    {filters.isMajorCity !== "all" && (
                      <Badge variant="secondary" className="text-xs">
                        Major: {filters.isMajorCity === "true" ? "Yes" : "No"}
                      </Badge>
                    )}
                    {filters.sortBy !== "name" && (
                      <Badge variant="secondary" className="text-xs">
                        Sort: {filters.sortBy}
                      </Badge>
                    )}
                    {filters.sortOrder !== "asc" && (
                      <Badge variant="secondary" className="text-xs">
                        Order: {filters.sortOrder}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

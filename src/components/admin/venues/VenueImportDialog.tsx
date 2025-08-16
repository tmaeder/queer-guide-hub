import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, MapPin, Search, Settings } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

interface VenueImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: 'foursquare' | 'google-places' | 'tomtom' | 'tripadvisor';
  onImport: (config: ImportConfig) => void;
  isImporting: boolean;
}

interface ImportConfig {
  locations: string[];
  searchTerms: string[];
  categories: string[];
  limit: number;
  radius: number;
  includeImages: boolean;
  includeReviews: boolean;
  isReimport: boolean;
  filters: {
    minRating?: number;
    priceRange?: string[];
    openNow?: boolean;
  };
}

const DEFAULT_SEARCH_TERMS = {
  foursquare: [
    'LGBTQ friendly bar',
    'gay bar',
    'lesbian bar',
    'queer friendly restaurant',
    'pride friendly cafe',
    'LGBTQ community center'
  ],
  'google-places': [
    'LGBTQ friendly bar',
    'gay bar',
    'lesbian bar',
    'queer friendly restaurant',
    'pride friendly cafe',
    'LGBTQ community center'
  ],
  tomtom: [
    'LGBTQ friendly',
    'gay bar',
    'lesbian bar',
    'queer restaurant',
    'pride cafe',
    'LGBTQ center'
  ],
  tripadvisor: [
    'LGBTQ friendly',
    'gay bar',
    'lesbian bar',
    'queer restaurant',
    'pride cafe'
  ]
};

const DEFAULT_LOCATIONS = [
  'New York, NY',
  'San Francisco, CA',
  'Los Angeles, CA',
  'Chicago, IL',
  'London, UK',
  'Berlin, Germany',
  'Amsterdam, Netherlands',
  'Toronto, Canada',
  'Sydney, Australia',
  'Paris, France'
];

const CATEGORIES = {
  foursquare: ['Gay Bar', 'LGBTQ Organization', 'Restaurant', 'Cafe', 'Community Center'],
  'google-places': ['bar', 'restaurant', 'cafe', 'community_center', 'lgbtq_organization'],
  tomtom: ['Entertainment', 'Restaurant', 'Community', 'Shopping', 'Health'],
  tripadvisor: ['Bars & Clubs', 'Restaurants', 'Attractions', 'Shopping', 'Spas & Wellness']
};

export function VenueImportDialog({ 
  open, 
  onOpenChange, 
  provider, 
  onImport, 
  isImporting 
}: VenueImportDialogProps) {
  const [config, setConfig] = useState<ImportConfig>({
    locations: ['New York, NY'],
    searchTerms: DEFAULT_SEARCH_TERMS[provider].slice(0, 3),
    categories: [],
    limit: 10,
    radius: 10000,
    includeImages: true,
    includeReviews: false,
    isReimport: false,
    filters: {}
  });

  const [newLocation, setNewLocation] = useState('');
  const [newSearchTerm, setNewSearchTerm] = useState('');

  const addLocation = () => {
    if (newLocation.trim() && !config.locations.includes(newLocation.trim())) {
      setConfig(prev => ({
        ...prev,
        locations: [...prev.locations, newLocation.trim()]
      }));
      setNewLocation('');
    }
  };

  const removeLocation = (location: string) => {
    setConfig(prev => ({
      ...prev,
      locations: prev.locations.filter(l => l !== location)
    }));
  };

  const addSearchTerm = () => {
    if (newSearchTerm.trim() && !config.searchTerms.includes(newSearchTerm.trim())) {
      setConfig(prev => ({
        ...prev,
        searchTerms: [...prev.searchTerms, newSearchTerm.trim()]
      }));
      setNewSearchTerm('');
    }
  };

  const removeSearchTerm = (term: string) => {
    setConfig(prev => ({
      ...prev,
      searchTerms: prev.searchTerms.filter(t => t !== term)
    }));
  };

  const addDefaultLocation = (location: string) => {
    if (!config.locations.includes(location)) {
      setConfig(prev => ({
        ...prev,
        locations: [...prev.locations, location]
      }));
    }
  };

  const addDefaultSearchTerm = (term: string) => {
    if (!config.searchTerms.includes(term)) {
      setConfig(prev => ({
        ...prev,
        searchTerms: [...prev.searchTerms, term]
      }));
    }
  };

  const handleImport = () => {
    onImport(config);
  };

  const getProviderIcon = () => {
    switch (provider) {
      case 'foursquare': return '🏢';
      case 'google-places': return '🗺️';
      case 'tomtom': return '🛣️';
      case 'tripadvisor': return '✈️';
      default: return '📍';
    }
  };

  const getProviderName = () => {
    switch (provider) {
      case 'foursquare': return 'Foursquare';
      case 'google-places': return 'Google Places';
      case 'tomtom': return 'TomTom';
      case 'tripadvisor': return 'TripAdvisor';
      default: return provider;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{getProviderIcon()}</span>
            Import from {getProviderName()}
          </DialogTitle>
          <DialogDescription>
            Configure import settings to fetch venues from {getProviderName()} with customizable search terms and locations.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic Settings</TabsTrigger>
            <TabsTrigger value="search">Search Configuration</TabsTrigger>
            <TabsTrigger value="advanced">Advanced Options</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Locations
                </CardTitle>
                <CardDescription>
                  Select cities and regions to search for venues
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {config.locations.map((location) => (
                    <Badge key={location} variant="secondary" className="gap-1">
                      {location}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 hover:bg-transparent"
                        onClick={() => removeLocation(location)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Add location (e.g., Miami, FL)"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addLocation()}
                  />
                  <Button onClick={addLocation} disabled={!newLocation.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Quick Add Popular Locations:</Label>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_LOCATIONS
                      .filter(loc => !config.locations.includes(loc))
                      .slice(0, 5)
                      .map((location) => (
                        <Button
                          key={location}
                          variant="outline"
                          size="sm"
                          onClick={() => addDefaultLocation(location)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {location}
                        </Button>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Import Limits</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="limit">Venues per Location (Optional)</Label>
                    <Select
                      value={config.limit?.toString() || "default"}
                      onValueChange={(value) => setConfig(prev => ({ 
                        ...prev, 
                        limit: value === "default" ? undefined : parseInt(value) 
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No limit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">No limit</SelectItem>
                        <SelectItem value="5">5 venues</SelectItem>
                        <SelectItem value="10">10 venues</SelectItem>
                        <SelectItem value="20">20 venues</SelectItem>
                        <SelectItem value="50">50 venues</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="radius">Search Radius (Optional)</Label>
                    <Select
                      value={config.radius?.toString() || "default"}
                      onValueChange={(value) => setConfig(prev => ({ 
                        ...prev, 
                        radius: value === "default" ? undefined : parseInt(value) 
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No radius" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">No radius</SelectItem>
                        <SelectItem value="5000">5 km</SelectItem>
                        <SelectItem value="10000">10 km</SelectItem>
                        <SelectItem value="25000">25 km</SelectItem>
                        <SelectItem value="50000">50 km</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Import Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="reimport"
                      checked={config.isReimport}
                      onCheckedChange={(checked) => 
                        setConfig(prev => ({ ...prev, isReimport: checked as boolean }))
                      }
                    />
                    <Label htmlFor="reimport">Update existing venues</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="images"
                      checked={config.includeImages}
                      onCheckedChange={(checked) => 
                        setConfig(prev => ({ ...prev, includeImages: checked as boolean }))
                      }
                    />
                    <Label htmlFor="images">Include images</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="reviews"
                      checked={config.includeReviews}
                      onCheckedChange={(checked) => 
                        setConfig(prev => ({ ...prev, includeReviews: checked as boolean }))
                      }
                    />
                    <Label htmlFor="reviews">Include review data</Label>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Search Terms
                </CardTitle>
                <CardDescription>
                  Customize search queries to find specific types of venues
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {config.searchTerms.map((term) => (
                    <Badge key={term} variant="secondary" className="gap-1">
                      {term}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 hover:bg-transparent"
                        onClick={() => removeSearchTerm(term)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Add search term (e.g., drag bar, queer bookstore)"
                    value={newSearchTerm}
                    onChange={(e) => setNewSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addSearchTerm()}
                  />
                  <Button onClick={addSearchTerm} disabled={!newSearchTerm.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Popular LGBTQ+ Search Terms:</Label>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_SEARCH_TERMS[provider]
                      .filter(term => !config.searchTerms.includes(term))
                      .map((term) => (
                        <Button
                          key={term}
                          variant="outline"
                          size="sm"
                          onClick={() => addDefaultSearchTerm(term)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {term}
                        </Button>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {CATEGORIES[provider] && (
              <Card>
                <CardHeader>
                  <CardTitle>Categories</CardTitle>
                  <CardDescription>
                    Filter results by specific venue categories
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {CATEGORIES[provider].map((category) => (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox
                          id={`category-${category}`}
                          checked={config.categories.includes(category)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setConfig(prev => ({
                                ...prev,
                                categories: [...prev.categories, category]
                              }));
                            } else {
                              setConfig(prev => ({
                                ...prev,
                                categories: prev.categories.filter(c => c !== category)
                              }));
                            }
                          }}
                        />
                        <Label htmlFor={`category-${category}`} className="text-sm">
                          {category}
                        </Label>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Filters & Quality Controls
                </CardTitle>
                <CardDescription>
                  Apply quality filters to import only the best venues
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minRating">Minimum Rating</Label>
                    <Select
                      value={config.filters.minRating?.toString() || ''}
                      onValueChange={(value) => 
                        setConfig(prev => ({
                          ...prev,
                          filters: { ...prev.filters, minRating: value ? parseFloat(value) : undefined }
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any rating" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Any rating</SelectItem>
                        <SelectItem value="3.0">3.0+</SelectItem>
                        <SelectItem value="3.5">3.5+</SelectItem>
                        <SelectItem value="4.0">4.0+</SelectItem>
                        <SelectItem value="4.5">4.5+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="openNow"
                        checked={config.filters.openNow || false}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({
                            ...prev,
                            filters: { ...prev.filters, openNow: checked as boolean }
                          }))
                        }
                      />
                      <Label htmlFor="openNow">Only venues open now</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Separator />

        <div className="flex justify-between">
          <div className="text-sm text-muted-foreground">
            This will search {config.locations.length} location(s) with {config.searchTerms.length} search term(s)
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={isImporting || config.locations.length === 0}>
              {isImporting ? 'Importing...' : 'Start Import'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
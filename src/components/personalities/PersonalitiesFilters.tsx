import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Filter, X } from "lucide-react";
import { PersonalityFilters } from "@/hooks/usePersonalities";

interface PersonalitiesFiltersProps {
  filters: PersonalityFilters;
  onFiltersChange: (filters: PersonalityFilters) => void;
}

const FIELD_OPTIONS = [
  'activism',
  'arts',
  'politics',
  'sports',
  'entertainment',
  'literature',
  'science',
  'business',
  'education',
  'healthcare',
  'technology',
  'journalism',
  'military',
  'religion'
];

export function PersonalitiesFilters({ filters, onFiltersChange }: PersonalitiesFiltersProps) {
  const [searchTerm, setSearchTerm] = useState(filters.search || '');
  const [selectedFields, setSelectedFields] = useState<string[]>(filters.fields || []);
  const [professions, setProfessions] = useState<string[]>([]);
  const [loadingProfessions, setLoadingProfessions] = useState(false);
  const [showAllFilters, setShowAllFilters] = useState(false);

  // Load professions from database
  useEffect(() => {
    const fetchProfessions = async () => {
      setLoadingProfessions(true);
      try {
        const { data, error } = await supabase
          .from('personalities')
          .select('profession')
          .not('profession', 'is', null)
          .neq('profession', '')
          .eq('visibility', 'public');

        if (error) {
          console.error('Error fetching professions:', error);
          return;
        }

        // Extract unique professions and handle comma-separated values
        const uniqueProfessions = new Set<string>();
        
        data?.forEach(item => {
          if (item.profession) {
            // Split by comma and clean up each profession
            const professionList = item.profession.split(',').map(p => p.trim());
            professionList.forEach(profession => {
              if (profession) {
                uniqueProfessions.add(profession);
              }
            });
          }
        });

        setProfessions(Array.from(uniqueProfessions).sort());
      } catch (error) {
        console.error('Error fetching professions:', error);
      } finally {
        setLoadingProfessions(false);
      }
    };

    fetchProfessions();
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    onFiltersChange({ ...filters, search: value || undefined });
  };

  const handleSearch = () => {
    onFiltersChange({ ...filters, search: searchTerm || undefined });
  };

  const handleFieldToggle = (field: string) => {
    const newFields = selectedFields.includes(field)
      ? selectedFields.filter(f => f !== field)
      : [...selectedFields, field];
    
    setSelectedFields(newFields);
    onFiltersChange({ ...filters, fields: newFields.length > 0 ? newFields : undefined });
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedFields([]);
    onFiltersChange({});
  };

  const hasActiveFilters = searchTerm || selectedFields.length > 0 || filters.is_living !== undefined || filters.profession || filters.featured_only;

  return (
    <div className="space-y-4 p-4 bg-card rounded-lg border mb-8">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search personalities..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} className="bg-primary" size="icon">
          <Search className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowAllFilters(!showAllFilters)}
          size="icon"
        >
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Extended Filters */}
      {showAllFilters && (
        <div className="space-y-4 pt-4 border-t">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Status</Label>
              <Select
                value={filters.is_living === true ? 'living' : filters.is_living === false ? 'deceased' : 'all'}
                onValueChange={(value) => 
                  onFiltersChange({ 
                    ...filters, 
                    is_living: value === 'living' ? true : value === 'deceased' ? false : undefined 
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="living">Living</SelectItem>
                  <SelectItem value="deceased">Historical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Profession</Label>
              <Select
                value={filters.profession || 'all'}
                onValueChange={(value) => 
                  onFiltersChange({ 
                    ...filters, 
                    profession: value === 'all' ? undefined : value 
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingProfessions ? "Loading..." : "All Professions"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Professions</SelectItem>
                  {professions.map((profession) => (
                    <SelectItem key={profession} value={profession}>
                      {profession}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Featured</Label>
              <Select
                value={filters.featured_only ? 'featured' : 'all'}
                onValueChange={(value) => 
                  onFiltersChange({ 
                    ...filters, 
                    featured_only: value === 'featured' ? true : undefined 
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Personalities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Personalities</SelectItem>
                  <SelectItem value="featured">Featured Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fields of Work */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Fields of Work</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {FIELD_OPTIONS.map((field) => (
                <div key={field} className="flex items-center space-x-2">
                  <Checkbox
                    id={field}
                    checked={selectedFields.includes(field)}
                    onCheckedChange={() => handleFieldToggle(field)}
                  />
                  <Label
                    htmlFor={field}
                    className="text-sm font-normal capitalize cursor-pointer"
                  >
                    {field}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSearch} className="bg-primary">
              Apply Filters
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="gap-2">
                <X className="h-4 w-4" />
                Clear All
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && !showAllFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {searchTerm && (
            <Badge variant="secondary" className="gap-1">
              Search: {searchTerm}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setSearchTerm('')} />
            </Badge>
          )}
          {filters.profession && (
            <Badge variant="secondary" className="gap-1">
              {filters.profession}
              <X className="h-3 w-3 cursor-pointer" onClick={() => onFiltersChange({ ...filters, profession: undefined })} />
            </Badge>
          )}
          {filters.is_living !== undefined && (
            <Badge variant="secondary" className="gap-1">
              {filters.is_living ? 'Living' : 'Historical'}
              <X className="h-3 w-3 cursor-pointer" onClick={() => onFiltersChange({ ...filters, is_living: undefined })} />
            </Badge>
          )}
          {filters.featured_only && (
            <Badge variant="secondary" className="gap-1">
              Featured
              <X className="h-3 w-3 cursor-pointer" onClick={() => onFiltersChange({ ...filters, featured_only: undefined })} />
            </Badge>
          )}
          {selectedFields.map(field => (
            <Badge key={field} variant="secondary" className="gap-1">
              {field}
              <X className="h-3 w-3 cursor-pointer" onClick={() => handleFieldToggle(field)} />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
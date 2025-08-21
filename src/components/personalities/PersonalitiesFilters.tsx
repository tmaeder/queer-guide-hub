import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Filter, X, Star, CheckCircle, Heart, Clock, Briefcase } from "lucide-react";
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

  const hasActiveFilters = searchTerm || selectedFields.length > 0 || filters.is_living !== undefined || filters.profession;

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5 text-primary" />
            Filters
          </CardTitle>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3 w-3 mr-1" />
              Clear All
            </Button>
          )}
        </div>
        {hasActiveFilters && (
          <div className="text-xs text-muted-foreground animate-fade-in">
            {Object.values({
              search: searchTerm,
              profession: filters.profession,
              fields: selectedFields.length > 0 ? `${selectedFields.length} fields` : null,
              status: filters.is_living !== undefined ? (filters.is_living ? 'Living' : 'Deceased') : null
            }).filter(Boolean).length} active filters
          </div>
        )}
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Search */}
        <div className="space-y-3">
          <Label htmlFor="search" className="text-sm font-medium">Search</Label>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              id="search"
              placeholder="Search personalities..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Quick Status Filters */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Quick Filters</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filters.is_living === true ? "default" : "outline"}
              size="sm"
              onClick={() => onFiltersChange({ 
                ...filters, 
                is_living: filters.is_living === true ? undefined : true 
              })}
              className="text-xs hover-scale"
            >
              <Heart className="h-3 w-3 mr-1" />
              Living
            </Button>
            <Button
              variant={filters.is_living === false ? "default" : "outline"}
              size="sm"
              onClick={() => onFiltersChange({ 
                ...filters, 
                is_living: filters.is_living === false ? undefined : false 
              })}
              className="text-xs hover-scale"
            >
              <Clock className="h-3 w-3 mr-1" />
              Historical
            </Button>
            <Button
              variant={filters.featured_only ? "default" : "outline"}
              size="sm"
              onClick={() => onFiltersChange({ 
                ...filters, 
                featured_only: filters.featured_only ? undefined : true 
              })}
              className="text-xs hover-scale"
            >
              <Star className="h-3 w-3 mr-1" />
              Featured
            </Button>
          </div>
        </div>

        {/* Profession Filter */}
        <div className="space-y-3">
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
            <SelectTrigger className="bg-background transition-all duration-200 hover:bg-muted/50">
              <SelectValue placeholder={loadingProfessions ? "Loading..." : "All Professions"} />
            </SelectTrigger>
            <SelectContent className="bg-background border shadow-lg z-50">
              <SelectItem value="all" className="hover:bg-muted/50">All Professions</SelectItem>
              {professions.map((profession) => (
                <SelectItem key={profession} value={profession} className="hover:bg-muted/50">
                  {profession}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.profession && (
            <Badge variant="secondary" className="flex items-center gap-1 w-fit animate-scale-in">
              <Briefcase className="h-3 w-3" />
              {filters.profession}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-destructive/20 hover:text-destructive transition-colors"
                onClick={() => onFiltersChange({ ...filters, profession: undefined })}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
        </div>

        {/* Fields of Work */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Fields of Work</Label>
          {selectedFields.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 animate-fade-in">
              {selectedFields.map((field) => (
                <Badge key={field} variant="secondary" className="flex items-center gap-1 animate-scale-in">
                  {field}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-destructive/20 hover:text-destructive transition-colors"
                    onClick={() => handleFieldToggle(field)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
          
          <div className="max-h-48 overflow-y-auto border rounded-md">
            <div className="grid grid-cols-1 gap-1 p-3">
              {FIELD_OPTIONS.map((field) => (
                <div key={field} className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 transition-colors">
                  <Checkbox
                    id={field}
                    checked={selectedFields.includes(field)}
                    onCheckedChange={() => handleFieldToggle(field)}
                    className="transition-all duration-200"
                  />
                  <Label
                    htmlFor={field}
                    className="text-sm font-normal capitalize cursor-pointer flex-1"
                  >
                    {field}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
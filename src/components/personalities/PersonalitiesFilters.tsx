import { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Filter, X, Star, CheckCircle } from "lucide-react";
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

  const hasActiveFilters = searchTerm || selectedFields.length > 0 || 
    filters.verification_status || filters.is_living !== undefined || filters.featured_only;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Filter className="h-5 w-5" />
          Filters
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="ml-auto text-xs"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search personalities..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Quick Filters */}
        <div className="space-y-3">
          <Label>Quick Filters</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filters.featured_only ? "default" : "outline"}
              size="sm"
              onClick={() => onFiltersChange({ 
                ...filters, 
                featured_only: !filters.featured_only || undefined 
              })}
              className="flex items-center gap-1"
            >
              <Star className="h-4 w-4" />
              Featured
            </Button>
            
            <Button
              variant={filters.verification_status === 'verified' ? "default" : "outline"}
              size="sm"
              onClick={() => onFiltersChange({ 
                ...filters, 
                verification_status: filters.verification_status === 'verified' ? undefined : 'verified'
              })}
              className="flex items-center gap-1"
            >
              <CheckCircle className="h-4 w-4" />
              Verified
            </Button>
          </div>
        </div>

        {/* Living Status */}
        <div className="space-y-3">
          <Label>Status</Label>
          <Select
            value={filters.is_living === undefined ? 'all' : filters.is_living ? 'living' : 'deceased'}
            onValueChange={(value) => 
              onFiltersChange({ 
                ...filters, 
                is_living: value === 'all' ? undefined : value === 'living' 
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Personalities</SelectItem>
              <SelectItem value="living">Living</SelectItem>
              <SelectItem value="deceased">Deceased</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <Label>Fields of Work</Label>
          {selectedFields.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedFields.map((field) => (
                <Badge key={field} variant="secondary" className="flex items-center gap-1">
                  {field}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-transparent"
                    onClick={() => handleFieldToggle(field)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
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
      </CardContent>
    </Card>
  );
}
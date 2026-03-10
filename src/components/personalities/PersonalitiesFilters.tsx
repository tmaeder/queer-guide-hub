import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { api } from "@/integrations/api/client";
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
        const { data, error } = await api
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, bgcolor: 'background.paper', borderRadius: 2, border: 1, borderColor: 'divider', mb: 4 }}>
      {/* Search Bar */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Box sx={{ position: 'relative', flex: 1 }}>
          <Search sx={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', height: '16px', width: '16px', color: 'text.secondary' }} />
          <Input
            placeholder="Search personalities..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            sx={{ pl: 4.5 }}
          />
        </Box>
        <Button onClick={handleSearch} size="icon">
          <Search sx={{ height: '16px', width: '16px' }} />
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowAllFilters(!showAllFilters)}
          size="icon"
        >
          <Filter sx={{ height: '16px', width: '16px' }} />
        </Button>
      </Box>

      {/* Extended Filters */}
      {showAllFilters && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Status</Label>
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
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Profession</Label>
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
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Featured</Label>
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
            </Box>
          </Box>

          {/* Fields of Work */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Fields of Work</Label>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1 }}>
              {FIELD_OPTIONS.map((field) => (
                <Box key={field} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id={field}
                    checked={selectedFields.includes(field)}
                    onCheckedChange={() => handleFieldToggle(field)}
                  />
                  <Label
                    htmlFor={field}
                    sx={{ fontSize: '0.875rem', fontWeight: 'normal', textTransform: 'capitalize', cursor: 'pointer' }}
                  >
                    {field}
                  </Label>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
            <Button onClick={handleSearch}>
              Apply Filters
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} sx={{ gap: 1 }}>
                <X sx={{ height: '16px', width: '16px' }} />
                Clear All
              </Button>
            )}
          </Box>
        </Box>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && !showAllFilters && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>Active filters:</Typography>
          {searchTerm && (
            <Badge variant="secondary" sx={{ gap: 0.5 }}>
              Search: {searchTerm}
              <X sx={{ height: '12px', width: '12px', cursor: 'pointer' }} onClick={() => setSearchTerm('')} />
            </Badge>
          )}
          {filters.profession && (
            <Badge variant="secondary" sx={{ gap: 0.5 }}>
              {filters.profession}
              <X sx={{ height: '12px', width: '12px', cursor: 'pointer' }} onClick={() => onFiltersChange({ ...filters, profession: undefined })} />
            </Badge>
          )}
          {filters.is_living !== undefined && (
            <Badge variant="secondary" sx={{ gap: 0.5 }}>
              {filters.is_living ? 'Living' : 'Historical'}
              <X sx={{ height: '12px', width: '12px', cursor: 'pointer' }} onClick={() => onFiltersChange({ ...filters, is_living: undefined })} />
            </Badge>
          )}
          {filters.featured_only && (
            <Badge variant="secondary" sx={{ gap: 0.5 }}>
              Featured
              <X sx={{ height: '12px', width: '12px', cursor: 'pointer' }} onClick={() => onFiltersChange({ ...filters, featured_only: undefined })} />
            </Badge>
          )}
          {selectedFields.map(field => (
            <Badge key={field} variant="secondary" sx={{ gap: 0.5 }}>
              {field}
              <X sx={{ height: '12px', width: '12px', cursor: 'pointer' }} onClick={() => handleFieldToggle(field)} />
            </Badge>
          ))}
        </Box>
      )}
    </Box>
  );
}

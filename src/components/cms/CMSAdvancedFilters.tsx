import { useState } from 'react';
import { CalendarIcon, Filter, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import type { CMSFilters } from '@/hooks/useCMSFilters';

interface CMSAdvancedFiltersProps {
  filters: CMSFilters;
  onFilterChange: (key: keyof CMSFilters, value: any) => void;
  onReset: () => void;
  filterOptions: {
    contentTypes: string[];
    statuses: string[];
  };
  totalResults: number;
  totalRecords: number;
}

export function CMSAdvancedFilters({
  filters,
  onFilterChange,
  onReset,
  filterOptions,
  totalResults,
  totalRecords
}: CMSAdvancedFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeFiltersCount = [
    filters.search,
    filters.contentType !== 'all' ? filters.contentType : null,
    filters.status !== 'all' ? filters.status : null,
    filters.dateRange.from,
    filters.dateRange.to,
    filters.showDeleted ? 'deleted' : null
  ].filter(Boolean).length;

  return (
    <Card>
      <CardHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <CardTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Filter style={{ height: 20, width: 20 }} />
                Filters & Search
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary">{activeFiltersCount} active</Badge>
                )}
              </Box>
            </CardTitle>
            <CardDescription>
              Showing {totalResults.toLocaleString()} of {totalRecords.toLocaleString()} items
            </CardDescription>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <SlidersHorizontal style={{ height: 16, width: 16, marginRight: 8 }} />
              {showAdvanced ? 'Simple' : 'Advanced'}
            </Button>
            {activeFiltersCount > 0 && (
              <Button variant="outline" size="sm" onClick={onReset}>
                <RotateCcw style={{ height: 16, width: 16, marginRight: 8 }} />
                Reset
              </Button>
            )}
          </Box>
        </Box>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Basic Filters */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
            {/* Search */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="search">Search</Label>
              <Box sx={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <Input
                  id="search"
                  placeholder="Search content..."
                  value={filters.search}
                  onChange={(e) => onFilterChange('search', e.target.value)}
                  sx={{ pl: 5 }}
                />
              </Box>
            </Box>

            {/* Content Type */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label>Content Type</Label>
              <Select value={filters.contentType} onValueChange={(value) => onFilterChange('contentType', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {filterOptions.contentTypes.map(type => (
                    <SelectItem key={type} value={type} style={{ textTransform: 'capitalize' }}>
                      {type.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>

            {/* Status */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(value) => onFilterChange('status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {filterOptions.statuses.map(status => (
                    <SelectItem key={status} value={status} style={{ textTransform: 'capitalize' }}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>

            {/* Sort */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label>Sort By</Label>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Select value={filters.sortBy} onValueChange={(value) => onFilterChange('sortBy', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="title">Title</SelectItem>
                    <SelectItem value="updated_at">Updated</SelectItem>
                    <SelectItem value="created_at">Created</SelectItem>
                    <SelectItem value="content_type">Type</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                  style={{ paddingLeft: 12, paddingRight: 12 }}
                >
                  {filters.sortOrder === 'asc' ? '\u2191' : '\u2193'}
                </Button>
              </Box>
            </Box>
          </Box>

          {/* Advanced Filters */}
          {showAdvanced && (
            <>
              <Separator />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
                {/* Date Range */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label>Date Range</Label>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          style={{
                            justifyContent: 'flex-start',
                            textAlign: 'left',
                            fontWeight: 400,
                            flex: 1,
                            ...(!filters.dateRange.from ? { color: 'var(--muted-foreground)' } : {})
                          }}
                        >
                          <CalendarIcon style={{ marginRight: 8, height: 16, width: 16 }} />
                          {filters.dateRange.from ? (
                            format(filters.dateRange.from, "MMM dd")
                          ) : (
                            "From"
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent style={{ width: 'auto', padding: 0 }}>
                        <Calendar
                          mode="single"
                          selected={filters.dateRange.from || undefined}
                          onSelect={(date) => onFilterChange('dateRange', { ...filters.dateRange, from: date })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          style={{
                            justifyContent: 'flex-start',
                            textAlign: 'left',
                            fontWeight: 400,
                            flex: 1,
                            ...(!filters.dateRange.to ? { color: 'var(--muted-foreground)' } : {})
                          }}
                        >
                          <CalendarIcon style={{ marginRight: 8, height: 16, width: 16 }} />
                          {filters.dateRange.to ? (
                            format(filters.dateRange.to, "MMM dd")
                          ) : (
                            "To"
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent style={{ width: 'auto', padding: 0 }}>
                        <Calendar
                          mode="single"
                          selected={filters.dateRange.to || undefined}
                          onSelect={(date) => onFilterChange('dateRange', { ...filters.dateRange, to: date })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </Box>
                </Box>

                {/* Show Deleted */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Switch
                    id="show-deleted"
                    checked={filters.showDeleted}
                    onCheckedChange={(checked) => onFilterChange('showDeleted', checked)}
                  />
                  <Label htmlFor="show-deleted">Show deleted content</Label>
                </Box>
              </Box>
            </>
          )}

          {/* Active Filters Summary */}
          {activeFiltersCount > 0 && (
            <>
              <Separator />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Active filters:</Typography>
                {filters.search && (
                  <Badge variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Search: "{filters.search}"
                    <button onClick={() => onFilterChange('search', '')}>&times;</button>
                  </Badge>
                )}
                {filters.contentType !== 'all' && (
                  <Badge variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Type: {filters.contentType.replace('_', ' ')}
                    <button onClick={() => onFilterChange('contentType', 'all')}>&times;</button>
                  </Badge>
                )}
                {filters.status !== 'all' && (
                  <Badge variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Status: {filters.status}
                    <button onClick={() => onFilterChange('status', 'all')}>&times;</button>
                  </Badge>
                )}
                {filters.dateRange.from && (
                  <Badge variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    From: {format(filters.dateRange.from, "MMM dd, yyyy")}
                    <button onClick={() => onFilterChange('dateRange', { ...filters.dateRange, from: null })}>&times;</button>
                  </Badge>
                )}
                {filters.dateRange.to && (
                  <Badge variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    To: {format(filters.dateRange.to, "MMM dd, yyyy")}
                    <button onClick={() => onFilterChange('dateRange', { ...filters.dateRange, to: null })}>&times;</button>
                  </Badge>
                )}
              </Box>
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

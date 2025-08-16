import { useState } from 'react';
import { CalendarIcon, Filter, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
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
import { cn } from '@/lib/utils';
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters & Search
              {activeFiltersCount > 0 && (
                <Badge variant="secondary">{activeFiltersCount} active</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Showing {totalResults.toLocaleString()} of {totalRecords.toLocaleString()} items
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              {showAdvanced ? 'Simple' : 'Advanced'}
            </Button>
            {activeFiltersCount > 0 && (
              <Button variant="outline" size="sm" onClick={onReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Basic Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search content..."
                value={filters.search}
                onChange={(e) => onFilterChange('search', e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Content Type */}
          <div className="space-y-2">
            <Label>Content Type</Label>
            <Select value={filters.contentType} onValueChange={(value) => onFilterChange('contentType', value)}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {filterOptions.contentTypes.map(type => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={filters.status} onValueChange={(value) => onFilterChange('status', value)}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {filterOptions.statuses.map(status => (
                  <SelectItem key={status} value={status} className="capitalize">
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sort */}
          <div className="space-y-2">
            <Label>Sort By</Label>
            <div className="flex gap-2">
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
                className="px-3"
              >
                {filters.sortOrder === 'asc' ? '↑' : '↓'}
              </Button>
            </div>
          </div>
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Date Range */}
              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal flex-1",
                          !filters.dateRange.from && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.dateRange.from ? (
                          format(filters.dateRange.from, "MMM dd")
                        ) : (
                          "From"
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
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
                        className={cn(
                          "justify-start text-left font-normal flex-1",
                          !filters.dateRange.to && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.dateRange.to ? (
                          format(filters.dateRange.to, "MMM dd")
                        ) : (
                          "To"
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={filters.dateRange.to || undefined}
                        onSelect={(date) => onFilterChange('dateRange', { ...filters.dateRange, to: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Show Deleted */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-deleted"
                  checked={filters.showDeleted}
                  onCheckedChange={(checked) => onFilterChange('showDeleted', checked)}
                />
                <Label htmlFor="show-deleted">Show deleted content</Label>
              </div>
            </div>
          </>
        )}

        {/* Active Filters Summary */}
        {activeFiltersCount > 0 && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-2">
              <span className="text-sm font-medium">Active filters:</span>
              {filters.search && (
                <Badge variant="secondary" className="gap-1">
                  Search: "{filters.search}"
                  <button onClick={() => onFilterChange('search', '')}>×</button>
                </Badge>
              )}
              {filters.contentType !== 'all' && (
                <Badge variant="secondary" className="gap-1">
                  Type: {filters.contentType.replace('_', ' ')}
                  <button onClick={() => onFilterChange('contentType', 'all')}>×</button>
                </Badge>
              )}
              {filters.status !== 'all' && (
                <Badge variant="secondary" className="gap-1">
                  Status: {filters.status}
                  <button onClick={() => onFilterChange('status', 'all')}>×</button>
                </Badge>
              )}
              {filters.dateRange.from && (
                <Badge variant="secondary" className="gap-1">
                  From: {format(filters.dateRange.from, "MMM dd, yyyy")}
                  <button onClick={() => onFilterChange('dateRange', { ...filters.dateRange, from: null })}>×</button>
                </Badge>
              )}
              {filters.dateRange.to && (
                <Badge variant="secondary" className="gap-1">
                  To: {format(filters.dateRange.to, "MMM dd, yyyy")}
                  <button onClick={() => onFilterChange('dateRange', { ...filters.dateRange, to: null })}>×</button>
                </Badge>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Filter, X, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

interface FilterConfig {
  field: string;
  operator: string;
  value: any;
  label: string;
}

export const ImportFilters = () => {
  const [filters, setFilters] = useState<FilterConfig[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [newFilter, setNewFilter] = useState({
    field: '',
    operator: '',
    value: ''
  });

  const filterFields = [
    { value: 'type', label: 'Import Type' },
    { value: 'status', label: 'Status' },
    { value: 'source_type', label: 'Source Type' },
    { value: 'created_at', label: 'Created Date' },
    { value: 'file_name', label: 'File Name' },
    { value: 'duplicate_strategy', label: 'Duplicate Strategy' }
  ];

  const operators = [
    { value: 'equals', label: 'Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'starts_with', label: 'Starts With' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'between', label: 'Between' }
  ];

  const statusOptions = [
    'pending', 'validating', 'processing', 'completed', 'failed', 'cancelled'
  ];

  const sourceTypeOptions = [
    'csv', 'api', 'web_scraping', 'file_upload'
  ];

  const duplicateStrategyOptions = [
    'skip', 'overwrite', 'create_new'
  ];

  const addFilter = () => {
    if (!newFilter.field || !newFilter.operator || !newFilter.value) return;

    const fieldLabel = filterFields.find(f => f.value === newFilter.field)?.label || newFilter.field;
    const operatorLabel = operators.find(o => o.value === newFilter.operator)?.label || newFilter.operator;
    
    const filter: FilterConfig = {
      field: newFilter.field,
      operator: newFilter.operator,
      value: newFilter.value,
      label: `${fieldLabel} ${operatorLabel} ${newFilter.value}`
    };

    setFilters([...filters, filter]);
    setNewFilter({ field: '', operator: '', value: '' });
    setIsOpen(false);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const clearAllFilters = () => {
    setFilters([]);
  };

  const renderValueInput = () => {
    const { field, operator } = newFilter;

    if (field === 'status') {
      return (
        <Select value={newFilter.value} onValueChange={(value) => setNewFilter({ ...newFilter, value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(option => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (field === 'source_type') {
      return (
        <Select value={newFilter.value} onValueChange={(value) => setNewFilter({ ...newFilter, value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select source type" />
          </SelectTrigger>
          <SelectContent>
            {sourceTypeOptions.map(option => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (field === 'duplicate_strategy') {
      return (
        <Select value={newFilter.value} onValueChange={(value) => setNewFilter({ ...newFilter, value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select strategy" />
          </SelectTrigger>
          <SelectContent>
            {duplicateStrategyOptions.map(option => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (field === 'created_at' && ['greater_than', 'less_than', 'equals'].includes(operator)) {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {newFilter.value ? format(new Date(newFilter.value), 'PPP') : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={newFilter.value ? new Date(newFilter.value) : undefined}
              onSelect={(date) => setNewFilter({ ...newFilter, value: date?.toISOString() || '' })}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      );
    }

    return (
      <Input
        type={field === 'created_at' ? 'date' : 'text'}
        value={newFilter.value}
        onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
        placeholder="Enter value"
      />
    );
  };

  return (
    <div className="flex items-center gap-2">
      {/* Active Filters */}
      {filters.map((filter, index) => (
        <Badge key={index} variant="secondary" className="gap-1">
          {filter.label}
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 hover:bg-transparent"
            onClick={() => removeFilter(index)}
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}

      {/* Clear All Button */}
      {filters.length > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAllFilters}>
          Clear All
        </Button>
      )}

      {/* Add Filter Popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Add Filter
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-4">
            <h4 className="font-medium leading-none">Add Filter</h4>
            
            <div className="space-y-2">
              <Label htmlFor="field">Field</Label>
              <Select value={newFilter.field} onValueChange={(value) => setNewFilter({ ...newFilter, field: value, operator: '', value: '' })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {filterFields.map(field => (
                    <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newFilter.field && (
              <div className="space-y-2">
                <Label htmlFor="operator">Operator</Label>
                <Select value={newFilter.operator} onValueChange={(value) => setNewFilter({ ...newFilter, operator: value, value: '' })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map(operator => (
                      <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {newFilter.operator && (
              <div className="space-y-2">
                <Label htmlFor="value">Value</Label>
                {renderValueInput()}
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                onClick={addFilter} 
                disabled={!newFilter.field || !newFilter.operator || !newFilter.value}
                size="sm"
                className="flex-1"
              >
                Add Filter
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setNewFilter({ field: '', operator: '', value: '' });
                  setIsOpen(false);
                }}
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
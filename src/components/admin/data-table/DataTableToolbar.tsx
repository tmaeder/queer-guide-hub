import { useRef, useState } from 'react';
import { Search, X, RotateCcw, Settings2, BookmarkCheck, Plus, Star } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AdminInlineSpinner } from '@/components/admin/primitives/AdminLoading';
import type { FilterPreset } from './types';

interface ColumnInfo {
  id: string;
  label: string;
  visible: boolean;
  hideable: boolean;
}

interface GroupableColumn {
  id: string;
  label: string;
}

interface DataTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  enableSearch?: boolean;
  columns: ColumnInfo[];
  onToggleColumn: (id: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  totalCount: number;
  isFetching?: boolean;
  toolbarActions?: React.ReactNode;
  presets?: FilterPreset[];
  onSavePreset?: (name: string) => void;
  onApplyPreset?: (id: string) => void;
  onDeletePreset?: (id: string) => void;
  onSetDefaultPreset?: (id: string) => void;
  defaultPresetId?: string;
  groupableColumns?: GroupableColumn[];
  grouping?: string[];
  onGroupingChange?: (grouping: string[]) => void;
  children?: React.ReactNode;
}

export function DataTableToolbar({
  search,
  onSearchChange,
  enableSearch = true,
  columns,
  onToggleColumn,
  activeFilterCount,
  onClearFilters,
  totalCount,
  isFetching,
  toolbarActions,
  presets = [],
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onSetDefaultPreset,
  defaultPresetId,
  groupableColumns = [],
  grouping = [],
  onGroupingChange,
  children,
}: DataTableToolbarProps) {
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const viewsTrigger = useRef<HTMLButtonElement>(null);
  const hideableColumns = columns.filter((column) => column.hideable);
  const canGroup = groupableColumns.length > 0 && Boolean(onGroupingChange);
  const handleSavePreset = () => {
    if (presetName.trim() && onSavePreset) {
      onSavePreset(presetName.trim());
      setPresetName('');
      setPresetDialogOpen(false);
    }
  };
  return (
    <div className="flex flex-col gap-4 bg-card p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {enableSearch && (
          <div className="relative min-w-0 flex-1 basis-full lg:basis-64">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search records"
              placeholder="Search records…"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-11 pl-10 pr-12"
            />
            {search && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear search"
                className="absolute right-0 top-0 h-11 w-11"
                onClick={() => onSearchChange('')}
              >
                <X size={16} aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
        {children}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <RotateCcw size={14} aria-hidden="true" /> Clear filters{' '}
            <Badge variant="secondary">{activeFilterCount}</Badge>
          </Button>
        )}
        {(presets.length > 0 || onSavePreset) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button ref={viewsTrigger} variant="outline" size="sm">
                <BookmarkCheck size={16} aria-hidden="true" /> Views
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56 max-w-[calc(100vw-2rem)]">
              <DropdownMenuLabel>Saved views</DropdownMenuLabel>
              {onApplyPreset &&
                presets.map((preset) => (
                  <DropdownMenuItem key={preset.id} onSelect={() => onApplyPreset(preset.id)}>
                    <span className="flex-1">{preset.name}</span>
                    {preset.id === defaultPresetId && <Star size={14} aria-label="Default view" />}
                  </DropdownMenuItem>
                ))}
              {onSavePreset && (
                <DropdownMenuItem onSelect={() => setPresetDialogOpen(true)}>
                  <Plus size={14} aria-hidden="true" /> Save current view
                </DropdownMenuItem>
              )}
              {presets.length > 0 && (onSetDefaultPreset || onDeletePreset) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Manage views</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {presets.map((preset) => (
                        <DropdownMenuSub key={preset.id}>
                          <DropdownMenuSubTrigger>{preset.name}</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {onSetDefaultPreset && (
                              <DropdownMenuItem onSelect={() => onSetDefaultPreset(preset.id)}>
                                {preset.id === defaultPresetId
                                  ? 'Unset default view'
                                  : 'Set as default view'}
                              </DropdownMenuItem>
                            )}
                            {onDeletePreset && (
                              <DropdownMenuItem onSelect={() => onDeletePreset(preset.id)}>
                                Delete view
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {(hideableColumns.length > 0 || canGroup) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 size={16} aria-hidden="true" /> Display
                {grouping.length > 0 && <Badge variant="secondary">Grouped</Badge>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56 max-w-[calc(100vw-2rem)]">
              {canGroup && (
                <>
                  <DropdownMenuLabel>Group by</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={grouping.length === 0}
                    onCheckedChange={() => onGroupingChange?.([])}
                  >
                    No grouping
                  </DropdownMenuCheckboxItem>
                  {groupableColumns.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={grouping.includes(column.id)}
                      onCheckedChange={() =>
                        onGroupingChange?.(grouping.includes(column.id) ? [] : [column.id])
                      }
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              {hideableColumns.length > 0 && (
                <>
                  <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                  {hideableColumns.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.visible}
                      onCheckedChange={() => onToggleColumn(column.id)}
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {toolbarActions}
        <p className="ml-auto flex items-center gap-2 whitespace-nowrap text-13 text-muted-foreground">
          <span className="tabular-nums">{totalCount.toLocaleString()} records</span>
          {isFetching && <AdminInlineSpinner />}
        </p>
      </div>
      <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <DialogContent
          className="max-w-sm"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            viewsTrigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div>
              <Label htmlFor="preset-name">Name</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="e.g. Active venues in Berlin"
                onKeyDown={(event) => event.key === 'Enter' && handleSavePreset()}
              />
            </div>
            <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
              Save view
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

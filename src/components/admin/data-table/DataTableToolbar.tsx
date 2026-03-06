import { useState } from 'react';
import { Search, X, RotateCcw, Columns3, Save, BookmarkCheck, Layers } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
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
  groupableColumns = [],
  grouping = [],
  onGroupingChange,
  children,
}: DataTableToolbarProps) {
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  const handleSavePreset = () => {
    if (presetName.trim() && onSavePreset) {
      onSavePreset(presetName.trim());
      setPresetName('');
      setPresetDialogOpen(false);
    }
  };

  const hideableColumns = columns.filter((c) => c.hideable);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
      {/* Top row: search + actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {enableSearch && (
          <Box sx={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
            <Search
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                height: 16,
                width: 16,
                color: 'var(--muted-foreground)',
                pointerEvents: 'none',
              }}
            />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ paddingLeft: 34, height: 36 }}
            />
            {search && (
              <button
                onClick={() => onSearchChange('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  color: 'var(--muted-foreground)',
                }}
              >
                <X style={{ height: 14, width: 14 }} />
              </button>
            )}
          </Box>
        )}

        {/* Filter area (rendered via children) */}
        {children}

        {/* Clear filters */}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <RotateCcw style={{ height: 14, width: 14, marginRight: 4 }} />
            Clear
            <Badge variant="secondary" style={{ marginLeft: 4 }}>
              {activeFilterCount}
            </Badge>
          </Button>
        )}

        <Box sx={{ flex: '1 1 0', minWidth: 0 }} />

        {/* Presets */}
        {presets.length > 0 && onApplyPreset && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <BookmarkCheck style={{ height: 14, width: 14, marginRight: 4 }} />
                Presets
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Saved Presets</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {presets.map((p) => (
                <Box
                  key={p.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 1,
                    py: 0.5,
                    '&:hover': { bgcolor: 'action.hover' },
                    cursor: 'pointer',
                    borderRadius: 1,
                  }}
                  onClick={() => onApplyPreset(p.id)}
                >
                  <Typography variant="body2">{p.name}</Typography>
                  {onDeletePreset && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePreset(p.id);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      <X style={{ height: 12, width: 12 }} />
                    </button>
                  )}
                </Box>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onSavePreset && (
          <Button variant="outline" size="sm" onClick={() => setPresetDialogOpen(true)}>
            <Save style={{ height: 14, width: 14, marginRight: 4 }} />
            Save
          </Button>
        )}

        {/* Group By */}
        {groupableColumns.length > 0 && onGroupingChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={grouping.length > 0 ? 'default' : 'outline'} size="sm">
                <Layers style={{ height: 14, width: 14, marginRight: 4 }} />
                Group
                {grouping.length > 0 && (
                  <Badge variant="secondary" style={{ marginLeft: 4 }}>
                    {groupableColumns.find((c) => c.id === grouping[0])?.label ?? grouping[0]}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ minWidth: 160 }}>
              <DropdownMenuLabel>Group by column</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {groupableColumns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={grouping.includes(col.id)}
                  onCheckedChange={() => {
                    if (grouping.includes(col.id)) {
                      onGroupingChange([]);
                    } else {
                      onGroupingChange([col.id]);
                    }
                  }}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Column visibility */}
        {hideableColumns.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 style={{ height: 14, width: 14, marginRight: 4 }} />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ minWidth: 160 }}>
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {hideableColumns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.visible}
                  onCheckedChange={() => onToggleColumn(col.id)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {toolbarActions}

        {/* Count + fetching indicator */}
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {isFetching ? 'Loading...' : `${totalCount.toLocaleString()} total`}
        </Typography>
      </Box>

      {/* Save Preset Dialog */}
      <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <DialogContent style={{ maxWidth: 360 }}>
          <DialogHeader>
            <DialogTitle>Save Filter Preset</DialogTitle>
          </DialogHeader>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Box>
              <Label htmlFor="preset-name">Name</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g. Active venues in Berlin"
                onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              />
            </Box>
            <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
              Save Preset
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

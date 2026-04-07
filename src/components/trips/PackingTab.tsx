import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Collapse from '@mui/material/Collapse';
import Badge from '@mui/material/Badge';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import { Trash2, ChevronDown, ChevronRight, Luggage, Shield, Umbrella } from 'lucide-react';
import { useTripPacking, usePackingMutations, type PackingGroup } from '@/hooks/useTripPacking';

const CATEGORY_ORDER = ['clothing', 'toiletries', 'electronics', 'documents', 'safety', 'lgbtq-specific', 'other'];

interface Props {
  tripId: string;
}

export function PackingTab({ tripId }: Props) {
  const { grouped, checkedCount, totalCount, isLoading } = useTripPacking(tripId);
  const { addPackingItem, toggleChecked, deletePackingItem, addPackingTemplate } = usePackingMutations(tripId);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});

  if (isLoading) {
    return (
      <Box className="space-y-3">
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={200} />
      </Box>
    );
  }

  const percentage = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const sortedGroups = [...grouped].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );

  // Add empty groups for categories that exist in CATEGORY_ORDER but have no items
  const existingCategories = new Set(sortedGroups.map((g) => g.category));
  const allGroups: PackingGroup[] = [
    ...sortedGroups,
    ...CATEGORY_ORDER.filter((c) => !existingCategories.has(c)).map((c) => ({
      category: c,
      items: [],
    })),
  ];

  const toggleCollapse = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleAddItem = async (category: string) => {
    const text = (newItemText[category] || '').trim();
    if (!text) return;
    await addPackingItem.mutateAsync({ trip_id: tripId, name: text, category });
    setNewItemText((prev) => ({ ...prev, [category]: '' }));
  };

  return (
    <div>
      {/* Progress bar */}
      <Box sx={{ mb: 3 }}>
        <Box className="flex items-center justify-between mb-1">
          <Typography variant="subtitle2" color="text.secondary">
            Packing Progress
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {checkedCount}/{totalCount} ({percentage}%)
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={percentage}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Box>

      {/* Template buttons */}
      <Box className="flex flex-wrap gap-2 mb-3">
        <Button
          variant="outlined"
          size="small"
          startIcon={<Luggage size={14} />}
          onClick={() => addPackingTemplate.mutate('essentials')}
          disabled={addPackingTemplate.isPending}
        >
          Add Essentials
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Shield size={14} />}
          onClick={() => addPackingTemplate.mutate('lgbtq-safety')}
          disabled={addPackingTemplate.isPending}
        >
          Add LGBTQ+ Safety Kit
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Umbrella size={14} />}
          onClick={() => addPackingTemplate.mutate('beach')}
          disabled={addPackingTemplate.isPending}
        >
          Add Beach Pack
        </Button>
      </Box>

      {/* Category groups */}
      {allGroups.map((group) => {
        const isCollapsed = collapsed[group.category];
        const groupChecked = group.items.filter((i) => i.is_checked).length;
        const hasItems = group.items.length > 0;

        return (
          <Box key={group.category} sx={{ mb: 2 }}>
            <Box
              className="flex items-center gap-1 cursor-pointer select-none"
              onClick={() => toggleCollapse(group.category)}
              sx={{ py: 0.5 }}
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              <Typography variant="subtitle2" fontWeight={600}>
                {group.category.charAt(0).toUpperCase() + group.category.replace(/-/g, ' ').slice(1)}
              </Typography>
              {hasItems && (
                <Chip
                  label={`${groupChecked}/${group.items.length}`}
                  size="small"
                  color={groupChecked === group.items.length && hasItems ? 'success' : 'default'}
                  sx={{ height: 20, fontSize: 11, ml: 0.5 }}
                />
              )}
            </Box>

            <Collapse in={!isCollapsed}>
              {group.items.map((item) => (
                <Box key={item.id} className="flex items-center gap-1 pl-2">
                  <Checkbox
                    size="small"
                    checked={item.is_checked}
                    onChange={(e) => toggleChecked.mutate({ id: item.id, is_checked: e.target.checked })}
                    sx={{ p: 0.5 }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      flex: 1,
                      textDecoration: item.is_checked ? 'line-through' : 'none',
                      color: item.is_checked ? 'text.disabled' : 'text.primary',
                    }}
                  >
                    {item.name}
                  </Typography>
                  {item.quantity > 1 && (
                    <Badge
                      badgeContent={item.quantity}
                      color="primary"
                      sx={{ mr: 1, '& .MuiBadge-badge': { fontSize: 10, minWidth: 18, height: 18 } }}
                    />
                  )}
                  <IconButton
                    size="small"
                    onClick={() => deletePackingItem.mutate(item.id)}
                    sx={{ opacity: 0.4, '&:hover': { opacity: 1 } }}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </Box>
              ))}

              {/* Inline add input */}
              <Box className="flex items-center gap-1 pl-2 mt-1">
                <TextField
                  placeholder="Add item..."
                  size="small"
                  variant="standard"
                  fullWidth
                  value={newItemText[group.category] || ''}
                  onChange={(e) =>
                    setNewItemText((prev) => ({ ...prev, [group.category]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddItem(group.category);
                    }
                  }}
                  sx={{ '& .MuiInput-root': { fontSize: 14 } }}
                />
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </div>
  );
}

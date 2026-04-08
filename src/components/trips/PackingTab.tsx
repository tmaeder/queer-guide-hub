import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Collapse from '@mui/material/Collapse';
import { Trash2, ChevronDown, ChevronRight, CheckSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useToast } from '@/hooks/use-toast';
import { useTripPacking, usePackingMutations, type PackingGroup } from '@/hooks/useTripPacking';

const CATEGORY_ORDER = ['clothing', 'toiletries', 'electronics', 'documents', 'safety', 'lgbtq-specific', 'other'];

interface Props {
  tripId: string;
}

export function PackingTab({ tripId }: Props) {
  const { toast } = useToast();
  const { grouped, checkedCount, totalCount, isLoading } = useTripPacking(tripId);
  const { addPackingItem, toggleChecked, deletePackingItem, addPackingTemplate } = usePackingMutations(tripId);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});

  if (isLoading) return <PageLoadingState count={3} variant="list" />;

  const percentage = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const sortedGroups = [...grouped].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );

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
    try {
      await addPackingItem.mutateAsync({ trip_id: tripId, name: text, category });
      setNewItemText((prev) => ({ ...prev, [category]: '' }));
      toast({ title: 'Item added' });
    } catch (err) {
      toast({ title: 'Failed to add item', description: String(err), variant: 'destructive' });
    }
  };

  const handleTemplate = (templateName: string) => {
    addPackingTemplate.mutate(templateName, {
      onSuccess: () => toast({ title: 'Template items added' }),
      onError: (err) => toast({ title: 'Failed to add template', description: String(err), variant: 'destructive' }),
    });
  };

  const handleDeleteItem = (id: string) => {
    deletePackingItem.mutate(id, {
      onSuccess: () => toast({ title: 'Item removed' }),
      onError: (err) => toast({ title: 'Failed to remove item', description: String(err), variant: 'destructive' }),
    });
  };

  if (totalCount === 0) {
    return (
      <>
        <ScrollReveal>
          <Box className="flex flex-col items-center justify-center py-16 text-center">
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <CheckSquare size={28} style={{ opacity: 0.5 }} />
            </Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Start your packing list
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 280 }}>
              Add items or use a template to get started
            </Typography>
            <Box className="flex flex-wrap gap-2 justify-center">
              <Badge
                variant="outline"
                onClick={() => handleTemplate('essentials')}
                sx={{ cursor: 'pointer', minHeight: 44, px: 2 }}
              >
                Essentials
              </Badge>
              <Badge
                variant="outline"
                onClick={() => handleTemplate('lgbtq-safety')}
                sx={{ cursor: 'pointer', minHeight: 44, px: 2 }}
              >
                LGBTQ+ Safety Kit
              </Badge>
              <Badge
                variant="outline"
                onClick={() => handleTemplate('beach')}
                sx={{ cursor: 'pointer', minHeight: 44, px: 2 }}
              >
                Beach Pack
              </Badge>
            </Box>
          </Box>
        </ScrollReveal>
      </>
    );
  }

  return (
    <div>
      {/* Progress bar */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
          {checkedCount} of {totalCount} items packed
        </Typography>
        <LinearProgress
          variant="determinate"
          value={percentage}
          sx={{
            height: 8,
            borderRadius: 4,
            '& .MuiLinearProgress-bar': { bgcolor: 'brand.main' },
          }}
        />
      </Box>

      {/* Template buttons */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, overflowX: 'auto', pb: 0.5 }}>
        <Badge
          variant="outline"
          onClick={() => handleTemplate('essentials')}
          sx={{ cursor: 'pointer', minHeight: 44, px: 2 }}
        >
          Essentials
        </Badge>
        <Badge
          variant="outline"
          onClick={() => handleTemplate('lgbtq-safety')}
          sx={{ cursor: 'pointer', minHeight: 44, px: 2 }}
        >
          LGBTQ+ Safety Kit
        </Badge>
        <Badge
          variant="outline"
          onClick={() => handleTemplate('beach')}
          sx={{ cursor: 'pointer', minHeight: 44, px: 2 }}
        >
          Beach Pack
        </Badge>
      </Box>

      {/* Category groups */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {allGroups.map((group) => {
        const isCollapsed = collapsed[group.category];
        const groupChecked = group.items.filter((i) => i.is_checked).length;
        const hasItems = group.items.length > 0;
        const categoryLabel = group.category.charAt(0).toUpperCase() + group.category.replace(/-/g, ' ').slice(1);

        return (
          <Card key={group.category}>
            <CardContent>
              <Box
                className="flex items-center gap-1 cursor-pointer select-none"
                onClick={() => toggleCollapse(group.category)}
                sx={{ minHeight: 44, py: 0.5 }}
              >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
                  {categoryLabel}
                </Typography>
                {hasItems && (
                  <Badge variant={groupChecked === group.items.length ? 'default' : 'secondary'}>
                    {groupChecked}/{group.items.length}
                  </Badge>
                )}
              </Box>

              <Collapse in={!isCollapsed}>
                {group.items.map((item) => (
                  <Box
                    key={item.id}
                    className="flex items-center gap-1 pl-2"
                    sx={{ minHeight: 44 }}
                  >
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
                      <Badge variant="secondary">{item.quantity}</Badge>
                    )}
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteItem(item.id)}
                      sx={{ opacity: 0.4, '&:hover': { opacity: 1 }, minWidth: 44, minHeight: 44 }}
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
                    sx={{ '& .MuiInput-root': { fontSize: 14, minHeight: 44 }, '& .MuiInput-input::placeholder': { opacity: 0.5 } }}
                  />
                </Box>
              </Collapse>
            </CardContent>
          </Card>
        );
      })}
      </Box>
    </div>
  );
}

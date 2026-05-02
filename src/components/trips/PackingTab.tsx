import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Collapse from '@mui/material/Collapse';
import { useTheme } from '@mui/material/styles';
import { Trash2, ChevronDown, ChevronRight, CheckSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useToast } from '@/hooks/use-toast';
import {
  useTripPacking,
  usePackingMutations,
  type PackingGroup,
} from '@/hooks/useTripPacking';
import { PackingMarketplaceSuggestions } from './packing/PackingMarketplaceSuggestions';

const CATEGORY_ORDER = [
  'clothing',
  'toiletries',
  'electronics',
  'documents',
  'safety',
  'lgbtq-specific',
  'other',
];

const TEMPLATES = ['essentials', 'lgbtq-safety', 'beach'] as const;

interface Props {
  tripId: string;
}

export function PackingTab({ tripId }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { toast } = useToast();
  const packing = useTripPacking(tripId);
  const grouped = packing.grouped ?? [];
  const checkedCount = packing.checkedCount ?? 0;
  const totalCount = packing.totalCount ?? 0;
  const isLoading = packing.isLoading;
  const {
    addPackingItem,
    toggleChecked,
    deletePackingItem,
    addPackingTemplate,
  } = usePackingMutations(tripId);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});

  if (isLoading) return <PageLoadingState count={3} variant="list" />;

  const percentage =
    totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const sortedGroups = [...(grouped || [])].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );

  const existingCategories = new Set(sortedGroups.map((g) => g.category));
  const allGroups: PackingGroup[] = [
    ...sortedGroups,
    ...CATEGORY_ORDER.filter((c) => !existingCategories.has(c)).map((c) => ({
      category: c,
      items: [],
    })),
  ];

  const categoryLabel = (cat: string) =>
    t(`trips.packing.category.${cat}`, {
      defaultValue: cat
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase()),
    });

  const templateLabel = (tpl: string) => t(`trips.packing.templates.${tpl}`);

  const toggleCollapse = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleAddItem = async (category: string) => {
    const text = (newItemText[category] || '').trim();
    if (!text) return;
    try {
      await addPackingItem.mutateAsync({
        trip_id: tripId,
        name: text,
        category,
      });
      setNewItemText((prev) => ({ ...prev, [category]: '' }));
      toast({ title: t('trips.packing.added') });
    } catch (err) {
      toast({
        title: t('trips.packing.addFailed'),
        description: String(err),
        variant: 'destructive',
      });
    }
  };

  const handleTemplate = (templateName: string) => {
    addPackingTemplate.mutate(templateName, {
      onSuccess: () => toast({ title: t('trips.packing.templateAdded') }),
      onError: (err) =>
        toast({
          title: t('trips.packing.templateFailed'),
          description: String(err),
          variant: 'destructive',
        }),
    });
  };

  const handleDeleteItem = (id: string) => {
    deletePackingItem.mutate(id, {
      onSuccess: () => toast({ title: t('trips.packing.removed') }),
      onError: (err) =>
        toast({
          title: t('trips.packing.removeFailed'),
          description: String(err),
          variant: 'destructive',
        }),
    });
  };

  if (totalCount === 0) {
    const brand = theme?.palette?.brand?.main || 'hsl(var(--brand))';
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: { xs: 6, md: 10 },
          px: 3,
          border: '1.5px dashed',
          borderColor: 'divider',
          borderRadius: 3,
        }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 2,
            bgcolor: `${brand}1a`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 1.5,
          }}
        >
          <CheckSquare size={26} style={{ color: brand }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          {t('trips.packing.emptyTitle')}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 3, maxWidth: 360, mx: 'auto' }}
        >
          {t('trips.packing.emptyDescription')}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            justifyContent: 'center',
          }}
        >
          {TEMPLATES.map((tpl) => (
            <Badge
              key={tpl}
              variant="outline"
              onClick={() => handleTemplate(tpl)}

            >
              {templateLabel(tpl)}
            </Badge>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <div>
      {/* Progress card */}
      <Box
        sx={{
          p: { xs: 2, md: 2.5 },
          mb: 3,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            mb: 1,
            gap: 1,
          }}
        >
          <Typography
            sx={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              fontSize: '1.375rem',
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t('trips.packing.progress', {
              checked: checkedCount,
              total: totalCount,
            })}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: 'brand.main',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {percentage}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={percentage}
          sx={{
            height: 10,
            borderRadius: 5,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': {
              bgcolor: 'brand.main',
              borderRadius: 5,
            },
          }}
        />
      </Box>

      {/* Template chip row */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mb: 3,
          overflowX: 'auto',
          pb: 0.5,
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {TEMPLATES.map((tpl) => (
          <Badge
            key={tpl}
            variant="outline"
            onClick={() => handleTemplate(tpl)}

          >
            + {templateLabel(tpl)}
          </Badge>
        ))}
      </Box>

      {/* Category groups */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {allGroups.map((group) => {
          const isCollapsed = collapsed[group.category];
          const groupChecked = group.items.filter((i) => i.is_checked).length;
          const hasItems = group.items.length > 0;
          const allChecked =
            hasItems && groupChecked === group.items.length;

          return (
            <Card key={group.category}>
              <CardContent>
                <Box
                  component="button"
                  type="button"
                  onClick={() => toggleCollapse(group.category)}
                  aria-expanded={!isCollapsed}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    width: '100%',
                    border: 'none',
                    bgcolor: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'inherit',
                    fontFamily: 'inherit',
                    p: 0,
                    minHeight: 36,
                  }}
                >
                  {isCollapsed ? (
                    <ChevronRight size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      flex: 1,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      color: allChecked ? 'text.secondary' : 'text.primary',
                    }}
                  >
                    {categoryLabel(group.category)}
                  </Typography>
                  {hasItems && (
                    <Badge
                      variant={allChecked ? 'default' : 'secondary'}

                    >
                      {groupChecked}/{group.items.length}
                    </Badge>
                  )}
                </Box>

                <Collapse in={!isCollapsed}>
                  <Box sx={{ mt: 1 }}>
                    {group.items.map((item) => (
                      <Box
                        key={item.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          pl: 1,
                          minHeight: 40,
                          borderRadius: 1,
                          '&:hover': { bgcolor: 'action.hover' },
                          '&:hover .pack-delete': { opacity: 1 },
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={item.is_checked}
                          onChange={(e) =>
                            toggleChecked.mutate({
                              id: item.id,
                              is_checked: e.target.checked,
                            })
                          }
                          sx={{
                            p: 0.5,
                            color: 'text.secondary',
                            '&.Mui-checked': { color: 'brand.main' },
                          }}
                          aria-label={item.name}
                        />
                        <Typography
                          variant="body2"
                          sx={{
                            flex: 1,
                            textDecoration: item.is_checked
                              ? 'line-through'
                              : 'none',
                            color: item.is_checked
                              ? 'text.disabled'
                              : 'text.primary',
                          }}
                        >
                          {item.name}
                        </Typography>
                        {item.quantity > 1 && (
                          <Badge variant="secondary">×{item.quantity}</Badge>
                        )}
                        <IconButton
                          className="pack-delete"
                          size="small"
                          onClick={() => handleDeleteItem(item.id)}
                          aria-label={t('trips.packing.removeAria')}
                          sx={{
                            opacity: 0,
                            transition: 'opacity 0.15s, color 0.15s',
                            '&:hover': { color: 'error.main' },
                          }}
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </Box>
                    ))}

                    {/* Inline add input */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        pl: 1,
                        mt: 0.5,
                      }}
                    >
                      <TextField
                        placeholder={t('trips.packing.addItem')}
                        size="small"
                        variant="standard"
                        fullWidth
                        value={newItemText[group.category] || ''}
                        onChange={(e) =>
                          setNewItemText((prev) => ({
                            ...prev,
                            [group.category]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddItem(group.category);
                          }
                        }}
                        sx={{
                          '& .MuiInput-root': {
                            fontSize: 14,
                            minHeight: 40,
                          },
                          '& .MuiInput-input::placeholder': { opacity: 0.55 },
                        }}
                      />
                    </Box>
                  </Box>
                </Collapse>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      <Box
        sx={{
          mt: 4,
          pt: 3,
          borderTop: '1px solid',
          borderColor: 'divider',
          opacity: 0.95,
        }}
      >
        <PackingMarketplaceSuggestions tripId={tripId} />
      </Box>
    </div>
  );
}

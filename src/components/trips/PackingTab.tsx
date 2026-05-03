import { useState } from 'react';
import { Trash2, ChevronDown, ChevronRight, CheckSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useToast } from '@/hooks/use-toast';
import {
  useTripPacking,
  usePackingMutations,
  type PackingGroup,
} from '@/hooks/useTripPacking';
import { PackingMarketplaceSuggestions } from './packing/PackingMarketplaceSuggestions';
import { cn } from '@/lib/utils';

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
    return (
      <div className="text-center py-12 md:py-20 px-6 border-[1.5px] border-dashed border-border rounded-2xl">
        <div
          className="w-14 h-14 rounded-lg flex items-center justify-center mx-auto mb-3"
          style={{ background: 'hsl(var(--brand) / 0.1)' }}
        >
          <CheckSquare size={26} style={{ color: 'hsl(var(--brand))' }} />
        </div>
        <h3 className="text-lg font-bold mb-1">{t('trips.packing.emptyTitle')}</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-[360px] mx-auto">
          {t('trips.packing.emptyDescription')}
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {TEMPLATES.map((tpl) => (
            <Badge
              key={tpl}
              variant="outline"
              onClick={() => handleTemplate(tpl)}
              className="cursor-pointer"
            >
              {templateLabel(tpl)}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Progress card */}
      <div className="p-4 md:p-5 mb-6">
        <div className="flex items-baseline justify-between mb-2 gap-2">
          <p
            className="font-extrabold text-[1.375rem]"
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t('trips.packing.progress', {
              checked: checkedCount,
              total: totalCount,
            })}
          </p>
          <span
            className="text-sm font-bold"
            style={{
              color: 'hsl(var(--brand))',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {percentage}%
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${percentage}%`,
              background: 'hsl(var(--brand))',
            }}
          />
        </div>
      </div>

      {/* Template chip row */}
      <div
        className="flex gap-2 mb-6 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {TEMPLATES.map((tpl) => (
          <Badge
            key={tpl}
            variant="outline"
            onClick={() => handleTemplate(tpl)}
            className="cursor-pointer whitespace-nowrap"
          >
            + {templateLabel(tpl)}
          </Badge>
        ))}
      </div>

      {/* Category groups */}
      <div className="flex flex-col gap-3">
        {allGroups.map((group) => {
          const isCollapsed = collapsed[group.category];
          const groupChecked = group.items.filter((i) => i.is_checked).length;
          const hasItems = group.items.length > 0;
          const allChecked = hasItems && groupChecked === group.items.length;

          return (
            <Card key={group.category}>
              <CardContent>
                <button
                  type="button"
                  onClick={() => toggleCollapse(group.category)}
                  aria-expanded={!isCollapsed}
                  className="flex items-center gap-2 w-full border-none bg-transparent cursor-pointer text-left p-0 min-h-9"
                  style={{ color: 'inherit', fontFamily: 'inherit' }}
                >
                  {isCollapsed ? (
                    <ChevronRight size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                  <span
                    className={cn(
                      'font-bold flex-1 text-sm',
                      allChecked ? 'text-muted-foreground' : 'text-foreground',
                    )}
                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  >
                    {categoryLabel(group.category)}
                  </span>
                  {hasItems && (
                    <Badge variant={allChecked ? 'default' : 'secondary'}>
                      {groupChecked}/{group.items.length}
                    </Badge>
                  )}
                </button>

                <Collapsible open={!isCollapsed}>
                  <CollapsibleContent>
                    <div className="mt-2">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className="group/item flex items-center gap-1 pl-2 min-h-10 rounded hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={item.is_checked}
                            onCheckedChange={(c) =>
                              toggleChecked.mutate({
                                id: item.id,
                                is_checked: c === true,
                              })
                            }
                            aria-label={item.name}
                          />
                          <span
                            className={cn(
                              'flex-1 text-sm ml-1',
                              item.is_checked
                                ? 'line-through text-muted-foreground/60'
                                : 'text-foreground',
                            )}
                          >
                            {item.name}
                          </span>
                          {item.quantity > 1 && (
                            <Badge variant="secondary">×{item.quantity}</Badge>
                          )}
                          <Button
                            variant="ghost"
                            onClick={() => handleDeleteItem(item.id)}
                            aria-label={t('trips.packing.removeAria')}
                            className="h-7 w-7 p-0 opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-opacity"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      ))}

                      {/* Inline add input */}
                      <div className="flex items-center gap-1 pl-2 mt-1">
                        <Input
                          placeholder={t('trips.packing.addItem')}
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
                          className="border-0 border-b border-border rounded-none focus-visible:ring-0 focus-visible:border-primary text-sm h-10"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 pt-6 border-t border-border opacity-95">
        <PackingMarketplaceSuggestions tripId={tripId} />
      </div>
    </div>
  );
}

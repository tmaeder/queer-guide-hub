import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, MessageCircle } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { KinkRatingControl } from '@/components/kinks/KinkRatingControl';
import { useKinkTaxonomy } from '@/hooks/useKinkTaxonomy';
import { useMyKinkRatings, useUpsertKinkRatings, useDeleteKinkRating } from '@/hooks/useKinkRatings';
import {
  AXIS_SIDES,
  itemAxis,
  kinkLabel,
  type KinkRatingValue,
  type KinkSide,
} from '@/lib/kinks/types';

/**
 * Full category-accordion editor. Every rating click saves immediately
 * (single-row upsert; clearing deletes the row = "not entered").
 */
export function KinkGridEditor() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.split('-')[0] ?? 'en';
  const { data: taxonomy, isLoading } = useKinkTaxonomy();
  const { data: ratings } = useMyKinkRatings();
  const upsert = useUpsertKinkRatings();
  const remove = useDeleteKinkRating();

  const ratedPerCategory = useMemo(() => {
    const counts = new Map<string, number>();
    if (!taxonomy || !ratings) return counts;
    for (const item of taxonomy.items) {
      const cat = taxonomy.categories.find((c) => c.id === item.category_id);
      if (!cat) continue;
      const sides = AXIS_SIDES[itemAxis(item, cat)];
      if (sides.some((s) => ratings.has(`${item.id}:${s}`))) {
        counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [taxonomy, ratings]);

  if (isLoading || !taxonomy) {
    return <p className="py-8 text-sm text-muted-foreground">Loading checklist…</p>;
  }

  const handleRate = (itemId: string, side: KinkSide, rating: KinkRatingValue | null) => {
    if (rating === null) {
      remove.mutate({ item_id: itemId, side });
    } else {
      const existing = ratings?.get(`${itemId}:${side}`);
      upsert.mutate([
        { item_id: itemId, side, rating, needs_discussion: existing?.needs_discussion ?? false },
      ]);
    }
  };

  const handleDiscussion = (itemId: string, side: KinkSide, flag: boolean) => {
    const existing = ratings?.get(`${itemId}:${side}`);
    if (!existing) return;
    upsert.mutate([
      { item_id: itemId, side, rating: existing.rating, needs_discussion: flag },
    ]);
  };

  return (
    <Accordion type="multiple" className="w-full">
      {taxonomy.categories.map((cat) => {
        const items = taxonomy.itemsByCategory.get(cat.id) ?? [];
        const rated = ratedPerCategory.get(cat.id) ?? 0;
        return (
          <AccordionItem key={cat.id} value={cat.slug}>
            <AccordionTrigger className="text-15 font-medium">
              <span className="flex items-center gap-2">
                {kinkLabel(cat, lang)}
                <span className="text-13 font-normal text-muted-foreground">
                  {rated}/{items.length}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {cat.description && (
                <p className="mb-4 text-13 text-muted-foreground">
                  {cat.description_i18n?.[lang] ?? cat.description}
                </p>
              )}
              <ul className="space-y-4">
                {items.map((item) => {
                  const sides = AXIS_SIDES[itemAxis(item, cat)];
                  return (
                    <li key={item.id} className="space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="text-sm">{kinkLabel(item, lang)}</span>
                        {item.description && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" aria-label="About this item" className="min-h-0">
                                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-64">
                              {item.description_i18n?.[lang] ?? item.description}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {item.discussion_recommended && (
                          <Badge variant="outline" className="gap-1 rounded-badge text-xs2">
                            <MessageCircle className="h-3 w-3" />
                            Discuss first
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1">
                        {sides.map((side) => {
                          const row = ratings?.get(`${item.id}:${side}`);
                          return (
                            <KinkRatingControl
                              key={side}
                              side={side}
                              rating={row?.rating ?? null}
                              needsDiscussion={row?.needs_discussion ?? false}
                              onRate={(r) => handleRate(item.id, side, r)}
                              onToggleDiscussion={(f) => handleDiscussion(item.id, side, f)}
                            />
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

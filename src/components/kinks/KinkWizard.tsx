import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { KinkRatingControl } from '@/components/kinks/KinkRatingControl';
import { KinkVisibilityStep } from '@/components/kinks/KinkVisibilityStep';
import { useKinkTaxonomy } from '@/hooks/useKinkTaxonomy';
import { useMyKinkRatings, useUpsertKinkRatings, useDeleteKinkRating } from '@/hooks/useKinkRatings';
import {
  AXIS_SIDES,
  itemAxis,
  kinkLabel,
  type KinkCategory,
  type KinkItem,
  type KinkRatingValue,
  type KinkSide,
} from '@/lib/kinks/types';

interface WizardEntry {
  category: KinkCategory;
  item: KinkItem;
}

/**
 * One-item-at-a-time guided mode (KinkList "Start" pattern) with progress and
 * whole-category skip; finishes on the per-category visibility step.
 */
export function KinkWizard({ onFinished }: { onFinished?: () => void }) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.split('-')[0] ?? 'en';
  const { data: taxonomy } = useKinkTaxonomy();
  const { data: ratings } = useMyKinkRatings();
  const upsert = useUpsertKinkRatings();
  const remove = useDeleteKinkRating();

  const [index, setIndex] = useState(0);
  const [skippedCategories, setSkippedCategories] = useState<Set<string>>(new Set());
  const [visibilityStep, setVisibilityStep] = useState(false);

  const entries = useMemo<WizardEntry[]>(() => {
    if (!taxonomy) return [];
    const list: WizardEntry[] = [];
    for (const category of taxonomy.categories) {
      if (skippedCategories.has(category.id)) continue;
      for (const item of taxonomy.itemsByCategory.get(category.id) ?? []) {
        list.push({ category, item });
      }
    }
    return list;
  }, [taxonomy, skippedCategories]);

  if (!taxonomy) {
    return <p className="py-8 text-sm text-muted-foreground">Loading…</p>;
  }

  if (visibilityStep) {
    return <KinkVisibilityStep onDone={onFinished} />;
  }

  const clamped = Math.min(index, Math.max(entries.length - 1, 0));
  const entry = entries[clamped];
  if (!entry) {
    return <KinkVisibilityStep onDone={onFinished} />;
  }

  const { category, item } = entry;
  const sides = AXIS_SIDES[itemAxis(item, category)];
  const progress = entries.length ? Math.round((clamped / entries.length) * 100) : 0;

  const advance = () => {
    if (clamped + 1 >= entries.length) {
      setVisibilityStep(true);
    } else {
      setIndex(clamped + 1);
    }
  };

  const handleRate = (side: KinkSide, rating: KinkRatingValue | null) => {
    const existing = ratings?.get(`${item.id}:${side}`);
    if (rating === null) {
      remove.mutate({ item_id: item.id, side });
    } else {
      upsert.mutate([
        { item_id: item.id, side, rating, needs_discussion: existing?.needs_discussion ?? false },
      ]);
    }
    // Single-axis items auto-advance on rate; dual-axis wait for Next.
    if (sides.length === 1 && rating !== null) advance();
  };

  const handleDiscussion = (side: KinkSide, flag: boolean) => {
    const existing = ratings?.get(`${item.id}:${side}`);
    if (!existing) return;
    upsert.mutate([{ item_id: item.id, side, rating: existing.rating, needs_discussion: flag }]);
  };

  const skipCategory = () => {
    setSkippedCategories((prev) => new Set(prev).add(category.id));
    // Entries shrink; keep index at the first entry of what follows.
    const firstOfCategory = entries.findIndex((e) => e.category.id === category.id);
    setIndex(firstOfCategory >= 0 ? firstOfCategory : 0);
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-13 text-muted-foreground">
          <span>{kinkLabel(category, lang)}</span>
          <span>
            {clamped + 1} / {entries.length}
          </span>
        </div>
        <Progress value={progress} className="h-1" />
      </div>

      <div className="rounded-container border border-border p-6">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-headline font-display">{kinkLabel(item, lang)}</h3>
          {item.discussion_recommended && (
            <Badge variant="outline" className="gap-1 rounded-badge text-xs2">
              <MessageCircle className="h-3 w-3" />
              Discuss first
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="mt-2 text-sm text-muted-foreground">
            {item.description_i18n?.[lang] ?? item.description}
          </p>
        )}
        <div className="mt-6 space-y-2">
          {sides.map((side) => {
            const row = ratings?.get(`${item.id}:${side}`);
            return (
              <KinkRatingControl
                key={side}
                side={side}
                rating={row?.rating ?? null}
                needsDiscussion={row?.needs_discussion ?? false}
                onRate={(r) => handleRate(side, r)}
                onToggleDiscussion={(f) => handleDiscussion(side, f)}
                size="lg"
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-element"
            disabled={clamped === 0}
            onClick={() => setIndex(Math.max(0, clamped - 1))}
          >
            Back
          </Button>
          <Button variant="outline" size="sm" className="rounded-element" onClick={advance}>
            {sides.length === 1 ? 'Skip' : 'Next'}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 rounded-element text-muted-foreground"
            onClick={skipCategory}
          >
            <SkipForward className="h-4 w-4" />
            Skip this category
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-element text-muted-foreground"
            onClick={() => setVisibilityStep(true)}
          >
            Finish now
          </Button>
        </div>
      </div>
    </div>
  );
}

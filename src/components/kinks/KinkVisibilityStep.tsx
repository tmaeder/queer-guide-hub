import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Users, Heart, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useKinkTaxonomy } from '@/hooks/useKinkTaxonomy';
import { useMyKinkVisibility, useSetKinkVisibility } from '@/hooks/useKinkVisibility';
import { kinkLabel, type KinkTier } from '@/lib/kinks/types';

const TIER_META: { value: KinkTier; label: string; hint: string; icon: typeof Lock }[] = [
  { value: 'private', label: 'Private', hint: 'Only you', icon: Lock },
  { value: 'unlocked', label: 'People I unlock', hint: 'Only people you unlock, one by one', icon: Unlock },
  { value: 'matches', label: 'Matches', hint: 'Your mutual matches', icon: Heart },
  { value: 'members', label: 'Members', hint: 'Signed-in 18+ members who also opted in', icon: Users },
];

/**
 * Per-category visibility tiers (default: private) + per-category opt-in to
 * the shareable link page.
 */
export function KinkVisibilityStep({ onDone }: { onDone?: () => void }) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.split('-')[0] ?? 'en';
  const { toast } = useToast();
  const { data: taxonomy } = useKinkTaxonomy();
  const { data: visibility } = useMyKinkVisibility();
  const save = useSetKinkVisibility();

  const [draft, setDraft] = useState<Map<string, { tier: KinkTier; include_in_share: boolean }>>(
    new Map(),
  );

  useEffect(() => {
    if (!taxonomy) return;
    const next = new Map<string, { tier: KinkTier; include_in_share: boolean }>();
    for (const cat of taxonomy.categories) {
      const existing = visibility?.get(cat.id);
      next.set(cat.id, {
        tier: existing?.tier ?? 'private',
        include_in_share: existing?.include_in_share ?? false,
      });
    }
    setDraft(next);
  }, [taxonomy, visibility]);

  if (!taxonomy) return null;

  const handleSave = async () => {
    await save.mutateAsync(
      taxonomy.categories.map((cat) => {
        const d = draft.get(cat.id) ?? { tier: 'private' as KinkTier, include_in_share: false };
        return { category_id: cat.id, tier: d.tier, include_in_share: d.include_in_share };
      }),
    );
    toast({ title: 'Visibility saved.' });
    onDone?.();
  };

  const setAll = (tier: KinkTier) => {
    setDraft((prev) => {
      const next = new Map(prev);
      for (const [k, v] of next) next.set(k, { ...v, tier });
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-title font-medium">Who can see what</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything is private until you open it. You choose per category — and your
          &ldquo;No&rdquo; and hard-limit answers are never shown to anyone, on any setting.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-13 text-muted-foreground">Set all:</span>
        {TIER_META.map((t) => (
          <Button
            key={t.value}
            variant="outline"
            size="sm"
            className="rounded-element"
            onClick={() => setAll(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <ul className="divide-y divide-border">
        {taxonomy.categories.map((cat) => {
          const d = draft.get(cat.id) ?? { tier: 'private' as KinkTier, include_in_share: false };
          return (
            <li key={cat.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-40 flex-1 text-sm">{kinkLabel(cat, lang)}</span>
              <Select
                value={d.tier}
                onValueChange={(tier) =>
                  setDraft((prev) => {
                    const next = new Map(prev);
                    next.set(cat.id, { ...d, tier: tier as KinkTier });
                    return next;
                  })
                }
              >
                <SelectTrigger className="w-44 rounded-element">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIER_META.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <t.icon className="h-3.5 w-3.5" />
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-13 text-muted-foreground">
                <Checkbox
                  checked={d.include_in_share}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => {
                      const next = new Map(prev);
                      next.set(cat.id, { ...d, include_in_share: checked === true });
                      return next;
                    })
                  }
                />
                Share link
              </label>
            </li>
          );
        })}
      </ul>

      <p className="text-13 text-muted-foreground">
        {TIER_META.map((t) => `${t.label}: ${t.hint}`).join(' · ')}
      </p>

      <Button onClick={handleSave} disabled={save.isPending} className="rounded-element">
        Save visibility
      </Button>
    </div>
  );
}

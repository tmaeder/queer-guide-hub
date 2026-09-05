import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

interface GatedTagCount {
  total: number;
  non_adult: number;
}

interface GatedTagsNoticeProps {
  /**
   * Whether the surrounding list is currently hiding adult terms. Passed in
   * rather than re-derived from SafeMode so the notice and the grid cannot
   * disagree about what the reader is being shown — TagsIndex computes this
   * once as `safeMode.enabled && !state.adult`.
   */
  adultHidden: boolean;
}

/**
 * Tells a signed-out reader that the glossary is withholding terms from them.
 *
 * `/tags/:slug` has answered this honestly since 20261220113000 — a gated term
 * offers a sign-in gate instead of "No such term". The LISTING did not: RLS
 * removes the rows before the page ever sees them, so a signed-out reader was
 * served a smaller glossary with nothing saying so, and a term they had been
 * told about elsewhere simply was not there.
 *
 * The count comes from `gated_tag_count()`, which returns two integers and no
 * row data, so it is safe to call anonymously.
 *
 * WHICH NUMBER IT SHOWS IS THE WHOLE DESIGN. Measured on prod 2026-09-04: 102
 * active terms are anon-gated and 88 of them are adult. SafeMode hides adult
 * terms and DEFAULTS TO ON, so for a default reader signing in reveals 14, not
 * 102 — the rest stay behind a filter that signing in does not lift. Showing
 * "102" there would be false for most readers and disprovable in one click, so
 * while adult terms are hidden the notice counts only what signing in actually
 * delivers, and says plainly that safe mode is holding the remainder.
 */
export function GatedTagsNotice({ adultHidden }: GatedTagsNoticeProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['gated-tag-count'],
    queryFn: async (): Promise<GatedTagCount> => {
      const { data, error } = await untypedRpc<GatedTagCount>('gated_tag_count');
      if (error) throw error;
      return data ?? { total: 0, non_adult: 0 };
    },
    enabled: !user,
    staleTime: 5 * 60 * 1000,
  });

  if (user) return null;

  const total = data?.total ?? 0;
  const nonAdult = data?.non_adult ?? 0;
  // What signing in, on its own, would actually add to this list.
  const revealed = adultHidden ? nonAdult : total;
  if (!revealed) return null;

  // Only worth saying when safe mode is materially changing the answer.
  const alsoHeldBySafeMode = adultHidden ? total - nonAdult : 0;

  return (
    <div className="flex flex-col gap-4 bg-card p-6 sm:flex-row sm:items-center sm:justify-between rounded-container shadow-soft">
      <div className="flex items-start gap-4">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-body-lg font-medium">
            {t('tags.gated.title', {
              count: revealed,
              defaultValue: '{{count}} more terms are shown to signed-in members',
            })}
          </p>
          {/*
            "sensitive topics", NOT "explicit material". The gate is
            `is_sensitive AND not reviewed` — the review-gate axis, which
            20270107100000's own header names correctly — and `is_sensitive` is set
            wholesale on health and harm-reduction vocabulary (20260907100000 for
            the saferparty substances; 20261003110100:572 sets it for the entire
            substances-harm-reduction category). Adultness is a SEPARATE axis,
            `is_adult`, and under safe mode — the default — `revealed` is
            `nonAdult`, i.e. by construction the subset that is NOT adult.

            So the previous wording asserted "explicit material" about a set that
            excludes adult terms by definition. Sampled from the live non-adult
            sensitive population: Metoidioplasty, Orchiectomy, Feminizing Hormone
            Therapy, Exposure To Suicide, Stealthing, Spiking, GBL, Comedown.
            Describing those as explicit material labels gender-affirming care,
            suicide-exposure and drug-safety vocabulary as pornography.
          */}
          <p className="text-15 text-muted-foreground">
            {t('tags.gated.body', {
              defaultValue:
                'These entries cover sensitive topics and no editor has reviewed their definitions yet, so they are not shown publicly.',
            })}
          </p>
          {alsoHeldBySafeMode > 0 && (
            <p className="text-13 text-muted-foreground">
              {t('tags.gated.safeMode', {
                count: alsoHeldBySafeMode,
                defaultValue:
                  '{{count}} further terms stay hidden while safe mode is on — signing in does not change that.',
              })}
            </p>
          )}
        </div>
      </div>
      {/* asChild, not a Link wrapping a Button — that nests a <button> inside
          an <a>, which is invalid HTML. */}
      <Button asChild variant="default">
        <LocalizedLink to="/auth" className="shrink-0 no-underline">
          {t('tags.gated.cta', { defaultValue: 'Sign in' })}
        </LocalizedLink>
      </Button>
    </div>
  );
}

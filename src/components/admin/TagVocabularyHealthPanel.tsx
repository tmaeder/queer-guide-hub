import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Languages } from 'lucide-react';
import { useTagVocabularyHealth } from '@/hooks/useTagVocabularyHealth';
import { AdminStat } from '@/components/admin/primitives/AdminStat';

/**
 * Vocabulary hygiene for the tag glossary: plural auto-merge throughput, slug
 * transliteration health, and category-axis drift.
 *
 * This exists because the nightly `tag_plural_merge` cron is otherwise
 * invisible, and this repo has repeatedly found scheduled jobs that were
 * registered and never once succeeded. "Last merge run" is the number to read
 * first — if it is blank a day after deploy, the job is not running, however
 * healthy the other counters look.
 */
export function TagVocabularyHealthPanel() {
  const { data } = useTagVocabularyHealth();
  if (!data) return null;

  const lastRun = data.plural_cron_last_success
    ? new Date(data.plural_cron_last_success).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : 'never';

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <Languages size={16} />
          Vocabulary hygiene
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {/* All five are hard zeros: a non-zero value is a real defect, and for
              the last two it means a guard was dropped rather than that data drifted. */}
          <AdminStat label="Plural pairs open" value={data.plural_pairs_open} hardFail />
          <AdminStat label="Corrupted slugs" value={data.slug_corrupt} hardFail />
          <AdminStat label="Off-tree categories" value={data.legacy_category_values} hardFail />
          <AdminStat label="Shadowing aliases" value={data.shadowing_aliases} hardFail />
          <AdminStat label="Stale merge flags" value={data.stale_lexical_flags} hardFail />
        </div>

        <div className="flex flex-wrap gap-2">
          <AdminStat label="Plurals merged (total)" value={data.plural_merges_total} />
          <AdminStat label="Merged last 7 days" value={data.plural_merges_7d} />
          <AdminStat label="Kept distinct" value={data.plural_exclusions} />
          <AdminStat label="Last merge run" value={lastRun} />
        </div>

        <div className="flex flex-wrap gap-2">
          <AdminStat label="Uncategorized" value={data.uncategorized_active} />
          <AdminStat label="Non-ASCII names" value={data.non_ascii_active} />
          <AdminStat label="Merge queue" value={data.merge_review_pending} />
        </div>

        <p className="text-13 text-muted-foreground">
          Plurals merge into their singular nightly and are reversible from the merge audit.
          Non-ASCII names are informational — most are people&apos;s names or English loanwords
          such as Jägermeister, not untranslated tags.
        </p>
      </CardContent>
    </Card>
  );
}

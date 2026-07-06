import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import { useKinkShareView, type KinkShareViewRow } from '@/hooks/useKinkShare';
import { useKinkTaxonomy } from '@/hooks/useKinkTaxonomy';
import { kinkLabel } from '@/lib/kinks/types';
import { SIDE_LABEL } from '@/components/kinks/kinkRatingMeta';

/**
 * Share-code landing: shows the owner's opted-in categories to signed-in,
 * intimate-eligible members. Unknown/revoked/expired codes are
 * indistinguishable (empty).
 */
export default function KinkShareView() {
  const { code } = useParams<{ code: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = i18n.language?.split('-')[0] ?? 'en';
  const { data: me, isLoading: meLoading } = useMyIntimateProfile();
  const eligible = !!me?.opted_in_at;
  const { data: rows, isLoading, isError } = useKinkShareView(eligible ? code : undefined);
  const { data: taxonomy } = useKinkTaxonomy(eligible);

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    if (!taxonomy) return map;
    for (const c of taxonomy.categories) map.set(`c:${c.slug}`, kinkLabel(c, lang));
    for (const it of taxonomy.items) map.set(`i:${it.slug}`, kinkLabel(it, lang));
    return map;
  }, [taxonomy, lang]);

  const grouped = useMemo(() => {
    const map = new Map<string, KinkShareViewRow[]>();
    for (const row of rows ?? []) {
      const list = map.get(row.category_slug) ?? [];
      list.push(row);
      map.set(row.category_slug, list);
    }
    return map;
  }, [rows]);

  if (loading || meLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-headline font-display">Shared checklist</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Someone shared their interests checklist with you. Sign in to view it — this
          content is only visible to signed-in adult members.
        </p>
        <Button className="mt-6 rounded-element" onClick={() => navigate('/auth')}>
          Sign in
        </Button>
      </div>
    );
  }

  if (!eligible) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-headline font-display">Shared checklist</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Viewing shared checklists requires the 18+ intimate opt-in.
        </p>
        <Button className="mt-6 rounded-element" onClick={() => navigate('/intimate/onboard')}>
          Enable intimate profile
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (isError || !rows?.length) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-headline font-display">Link not available</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          This link doesn't exist, expired, or was revoked by its owner — or nothing is
          shared on it yet.
        </p>
      </div>
    );
  }

  const owner = rows[0];

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6 flex items-center gap-4 border-b border-border pb-6">
        {owner.owner_avatar_url ? (
          <img src={owner.owner_avatar_url} alt="" className="h-12 w-12 rounded-element object-cover" />
        ) : (
          <div className="h-12 w-12 rounded-element bg-muted" />
        )}
        <div>
          <h1 className="text-title font-medium">{owner.owner_display_name ?? 'Anon'}</h1>
          <p className="text-13 text-muted-foreground">Shared interests checklist</p>
        </div>
      </header>

      <div className="space-y-6">
        {[...grouped.entries()].map(([catSlug, catRows]) => (
          <section key={catSlug}>
            <h2 className="mb-2 text-13 font-medium uppercase tracking-wide text-muted-foreground">
              {labels.get(`c:${catSlug}`) ?? catSlug}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {catRows.map((row) => (
                <Badge
                  key={`${row.item_slug}:${row.side}`}
                  variant={row.rating === 'favorite' ? 'default' : 'secondary'}
                  className="gap-1 rounded-badge"
                >
                  {row.rating === 'favorite' && <Star className="h-3 w-3" />}
                  {labels.get(`i:${row.item_slug}`) ?? row.item_slug}
                  {row.side !== 'general' && (
                    <span className="opacity-70">· {SIDE_LABEL[row.side].toLowerCase()}</span>
                  )}
                  {row.needs_discussion && <MessageCircle className="h-3 w-3" />}
                </Badge>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 border-t border-border pt-4 text-13 text-muted-foreground">
        Positives only — No's and hard limits are never part of a shared list.
      </p>
    </div>
  );
}

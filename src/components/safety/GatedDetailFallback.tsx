import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';

type GatedEntityType = 'venue' | 'event' | 'organization' | 'milestone' | 'queer_village' | 'tag';

interface GatedDetailFallbackProps {
  entityType: GatedEntityType;
  slug: string | undefined;
  /** The page's normal not-found UI, shown when the entity is genuinely missing. */
  notFound: ReactNode;
}

/**
 * Safety layer: a logged-out visitor following a direct link to a venue/event/
 * organization in a high-risk country gets `null` from RLS — indistinguishable
 * from a genuine 404. This wraps the page's not-found branch: if a gated entity
 * actually exists at this slug, show a sign-in gate; otherwise render the normal
 * not-found UI. Authenticated users always see the not-found UI (RLS already
 * showed them the row if it existed).
 *
 * `tag` reuses the mechanism for a different gate: `unified_tags_public_gated_read`
 * withholds a sensitive glossary term until a human has reviewed its prose. The
 * shape of the wrong answer was identical — a real term read as a typo — so the
 * copy differs and nothing else does. It must NOT borrow the destination-risk
 * wording: telling a reader that "footjob" is a legally dangerous place to
 * travel would be both false and alarming.
 */
export function GatedDetailFallback({ entityType, slug, notFound }: GatedDetailFallbackProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: gated, isLoading } = useQuery({
    queryKey: ['gated-entity-exists', entityType, slug ?? null],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await untypedRpc('gated_entity_exists', {
        p_entity_type: entityType,
        p_slug: slug,
      });
      if (error) throw error;
      return Boolean(data);
    },
    enabled: !user && !!slug,
    staleTime: 5 * 60 * 1000,
  });

  if (!user && !!slug) {
    if (isLoading) return <PageLoading />;
    if (gated) {
      const heading =
        entityType === 'tag'
          ? t('safety.gatedDetail.tag.title', { defaultValue: 'Sign in to view this term' })
          : t('safety.gatedDetail.title', { defaultValue: 'Sign in to view this place' });
      const body =
        entityType === 'tag'
          ? t('safety.gatedDetail.tag.body', {
              defaultValue:
                'This glossary entry covers explicit material and no editor has reviewed its definition yet, so it is only shown to signed-in members.',
            })
          : t('safety.gatedDetail.body', {
              defaultValue:
                'This destination has heightened legal risk for LGBTQ+ people, so this content is only shown to signed-in members.',
            });
      return (
        <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-20 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-2">
            <h1 className="text-headline font-display">{heading}</h1>
            <p className="text-body-lg text-muted-foreground">{body}</p>
          </div>
          {/* asChild, not a Link wrapping a Button — that nests a <button>
              inside an <a>, which is invalid HTML. */}
          {/* Monochrome on purpose: this is the safety layer. PASTE-UP ink is
              non-semantic decoration and must never appear on a surface a user
              in a criminalising country is reading for risk info. */}
          <Button asChild variant="default">
            <LocalizedLink to="/auth" className="no-underline">
              {t('safety.gatedDetail.cta', { defaultValue: 'Sign in' })}
            </LocalizedLink>
          </Button>
        </div>
      );
    }
  }

  return <>{notFound}</>;
}

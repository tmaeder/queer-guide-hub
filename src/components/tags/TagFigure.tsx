/**
 * The `#photo` band on a glossary entry.
 *
 * NOT A HERO, and that is deliberate. `TagDetail.tsx`'s own header has said
 * "No image hero" since the page was rebuilt, and the bot path in
 * `functions/_lib/detail.ts` deliberately serves the site card rather than a
 * tag og:image. A body band keeps both of those decisions intact: the
 * definition still leads, because someone arriving from search needs the
 * sentence before the picture.
 *
 * It mirrors `TagInfographics`: the same ink frame, the same gating shape, and
 * the attribution INSIDE the frame — which is a licence obligation for the
 * CC BY-SA material this band mostly carries, not a styling choice.
 *
 * WHY IT YIELDS TO A DIAGRAM. A figure says "these terms are parts of one
 * picture" and a photograph says "this is what the thing looks like". Both at
 * once on one entry is the redundancy this feature was retired for in 2026-08,
 * so when the page already carries an inline diagram the photograph stands
 * down. That check lives here rather than in the acquisition selector because
 * the figure registry is a TS const the database cannot see, and a hardcoded
 * slug list in an edge function would drift from it silently.
 *
 * It does NOT yield to `TagFlagBand` or `TagHankyCodeBand`. A drawn flag swatch
 * and a photograph of a march are different statements, and suppressing one for
 * the other would be a guess dressed as a rule.
 */

import { useTranslation } from 'react-i18next';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Image } from '@/components/ui/image';
import { ImageCredit } from '@/components/ui/ImageCredit';

import { figuresForSlug } from './infographics/registry';

export interface TagFigureProps {
  slug: string;
  name: string;
  imageUrl: string | null | undefined;
  imageAlt: string | null | undefined;
  imageSource: string | null | undefined;
  imageLicense: string | null | undefined;
  imageAttribution: string | null | undefined;
  imageExplicit: boolean | null | undefined;
  /** True when the whole page already sits behind the age gate, so the band
   *  does not ask a second time for the same thing. */
  pageAlreadyGated: boolean;
  /** Safe mode. Passed in rather than read from the provider so the predicate
   *  below and this component cannot disagree about it. */
  safeMode: boolean;
}

/**
 * Whether the band renders — ONE implementation, two readers.
 *
 * `TagDetail` needs this to decide whether to push a `photo` stop onto the
 * route strip, and that file's own comment is explicit that the station array's
 * order must match the JSX order "or the strip highlights the wrong stop while
 * scrolling". A component that decides for itself while the page guesses
 * separately is exactly how that drifts, so the rule lives here and both ask it.
 */
export function shouldShowTagFigure(input: {
  slug: string;
  imageUrl: string | null | undefined;
  imageExplicit: boolean | null | undefined;
  pageAlreadyGated: boolean;
  safeMode: boolean;
}): boolean {
  if (!input.imageUrl) return false;

  // Safe mode hides explicit imagery outright — the same rule the figure
  // registry, `rankSimilarTags` and `TagInterchange` already apply.
  if (input.imageExplicit && input.safeMode) return false;

  // An explicit photograph may only render where the reader has affirmed their
  // age. `zz_enforce_tag_image_contract` guarantees such a row carries
  // `is_adult`, and an `is_adult` tag's whole page is wrapped in
  // `TagDetailWithGate` — so in practice `pageAlreadyGated` is true here. The
  // check is kept because "in practice" is not an invariant, and the cost of
  // being wrong is explicit material shown to someone who did not opt in.
  if (input.imageExplicit && !input.pageAlreadyGated) return false;

  // Stand down for a diagram. See the header.
  if (figuresForSlug(input.slug).length > 0) return false;

  return true;
}

export function TagFigure({
  slug,
  name,
  imageUrl,
  imageAlt,
  imageSource,
  imageLicense,
  imageAttribution,
  imageExplicit,
  pageAlreadyGated,
  safeMode,
}: TagFigureProps) {
  const { t } = useTranslation();

  if (!shouldShowTagFigure({ slug, imageUrl, imageExplicit, pageAlreadyGated, safeMode })) {
    return null;
  }

  const alt = imageAlt?.trim() || name;

  return (
    <section id="photo" aria-labelledby={`photo-${slug}-title`}>
      <figure className="m-0 border-[3px] border-foreground">
        <div className="border-b-2 border-foreground p-4 md:p-6">
          <Eyebrow as="p">{t('tags.photo.eyebrow', 'Photograph')}</Eyebrow>
          <h3 id={`photo-${slug}-title`} className="mt-1 font-display text-headline leading-tight">
            {name}
          </h3>
        </div>

        <div className="bg-surface-container-high">
          <Image
            imageUrl={imageUrl}
            alt={alt}
            aspect="hero"
            fit="contain"
            rounded="none"
            imageRole="hero"
            fallbackEntityType="default"
            fallbackKey={slug}
          />
        </div>

        {/* Inside the frame, never floated over the picture: a credit that can
            be mistaken for part of the image is not a credit. */}
        <figcaption className="border-t-2 border-foreground p-4 md:px-6">
          <ImageCredit attribution={imageAttribution} license={imageLicense} source={imageSource} />
        </figcaption>
      </figure>
    </section>
  );
}

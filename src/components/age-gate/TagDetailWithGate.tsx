import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { AgeAffirmationModal } from '@/components/age-gate/AgeAffirmationModal';

interface Props {
  isAdult: boolean;
  affirmed: boolean;
  onDecline: () => void;
  children: ReactNode;
}

/**
 * Wraps the tag-detail render. When the tag belongs to Sexuality & Kink (or a
 * subcategory thereof) and the visitor has not affirmed 18+, the affirmation
 * modal renders over a placeholder.
 *
 * **It deliberately does NOT call `useMeta`.** It used to set
 * `{ noIndex: isAdult }` itself, and two `useMeta` calls racing on effect order
 * (child first, parent second) is why the page it wraps carried a five-line
 * comment about re-asserting `noIndex` from the parent. The page now owns one
 * `useMeta` with `noIndex: seo_indexable === false || isAdult`, which is
 * strictly more correct and has no ordering hazard.
 *
 * P0-3.
 */
export function TagDetailWithGate({ isAdult, affirmed, onDecline, children }: Props) {
  const { t } = useTranslation();

  if (isAdult && !affirmed) {
    return (
      <>
        <PageContainer className="text-center" data-testid="age-gate-placeholder">
          <span className="mb-6 inline-flex justify-center">
            <RouteBullet type="tag" size={38} />
          </span>
          <h1 className="font-display text-display leading-none md:text-hero">
            {t('age_gate.placeholder_title', 'Adult content gated')}
          </h1>
          <p className="mt-4 text-body-lg text-muted-foreground">
            {t('age_gate.placeholder_body', 'Confirm you are 18 or older to view this page.')}
          </p>
        </PageContainer>
        <AgeAffirmationModal active onDecline={onDecline} />
      </>
    );
  }

  return <>{children}</>;
}

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { AgeAffirmationModal } from '@/components/age-gate/AgeAffirmationModal';

interface Props {
  isAdult: boolean;
  affirmed: boolean;
  onDecline: () => void;
  children: ReactNode;
}

/**
 * Wraps the /resources tag-detail render. When the tag belongs to
 * Sexuality & Kink (or a subcategory thereof) and the visitor has not
 * affirmed 18+, we render the affirmation modal over a placeholder and
 * mark the page `noindex,nofollow`. Once affirmed, children render.
 *
 * P0-3.
 */
export function TagDetailWithGate({ isAdult, affirmed, onDecline, children }: Props) {
  const { t } = useTranslation();
  // Apply noindex while the gate is up — and on adult pages in general,
  // until the campaign decides indexable status. Cleared on unmount.
  useMeta({ noIndex: isAdult });

  if (isAdult && !affirmed) {
    return (
      <>
        <div
          className="container mx-auto py-16 md:py-24 px-4 text-center text-muted-foreground"
          data-testid="age-gate-placeholder"
        >
          <h1 className="text-2xl font-bold mb-2">
            {t('age_gate.placeholder_title', 'Adult content gated')}
          </h1>
          <p>
            {t(
              'age_gate.placeholder_body',
              'Confirm you are 18 or older to view this page.',
            )}
          </p>
        </div>
        <AgeAffirmationModal active onDecline={onDecline} />
      </>
    );
  }

  return <>{children}</>;
}

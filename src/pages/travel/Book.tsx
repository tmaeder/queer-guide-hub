import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ChevronLeft } from '@/components/icons';
import { BookNowAccordion } from '@/components/travel/BookNowAccordion';
import { useTripBookingContext } from '@/hooks/useTripBookingContext';
import { useMeta } from '@/hooks/useMeta';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHero } from '@/components/discovery/PageHero';
import { TravelJourneyNav } from '@/components/travel/TravelJourneyNav';

/**
 * Dedicated booking surface, extracted from /travel in v2.
 * Flights, hotels, transfers. Linked from TripCockpit and from per-destination
 * "Book" overflow actions. `?intent=book` on /travel redirects here.
 */
export default function Book() {
  const { t } = useTranslation();
  const tripBookingContext = useTripBookingContext();

  // This page had no useMeta at all, so it kept the homepage title through both
  // the edge pass AND the React render — the only intent child that failed on
  // both. Must match STATIC_ROUTE_META['/travel/book'].
  useMeta({
    title: 'Book LGBTQ+ Friendly Flights, Stays and Tours',
    description:
      'Book the pieces of a queer trip — flights, stays, transfers and activities — with the legal and safety picture for the destination alongside.',
    canonicalPath: '/travel/book',
  });

  return (
    <PageContainer flush className="pb-12">
      <PageHero
        bare
        size="xs"
        eyebrow={t('travel.book.eyebrow', 'Bring the trip together')}
        title={t('travel.book.title', 'Book your trip')}
        lede={t(
          'travel.book.lede',
          'Compare every useful way to arrive, find the right kind of stay, and keep the practical pieces beside your plans.',
        )}
      />
      <TravelJourneyNav />
      <div className="pt-8 md:pt-10">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm">
          <LocalizedLink
            to="/travel"
            className="inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground no-underline"
          >
            <ChevronLeft size={14} />
            {t('travel.book.back', 'Back to inspiration')}
          </LocalizedLink>
        </nav>
        <BookNowAccordion defaultOpen tripContext={tripBookingContext} />
      </div>
    </PageContainer>
  );
}

import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ChevronLeft } from 'lucide-react';
import { BookNowAccordion } from '@/components/travel/BookNowAccordion';
import { useTripBookingContext } from '@/hooks/useTripBookingContext';
import { useMeta } from '@/hooks/useMeta';
import { PageContainer } from '@/components/layout/PageContainer';

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
    <PageContainer>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <LocalizedLink
          to="/travel"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground no-underline"
        >
          <ChevronLeft size={14} />
          {t('travel.book.back', 'Travel')}
        </LocalizedLink>
      </nav>
      <h1 className="mb-2 text-display font-bold tracking-tight">
        {t('travel.book.title', 'Book your trip')}
      </h1>
      <p className="mb-8 max-w-prose text-body-lg text-muted-foreground">
        {t(
          'travel.book.lede',
          'Flights, stays, and transfers. We pass your preferences to trusted partners — bookings happen on their site.',
        )}
      </p>
      <BookNowAccordion defaultOpen tripContext={tripBookingContext} />
    </PageContainer>
  );
}

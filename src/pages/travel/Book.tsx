import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ChevronLeft } from 'lucide-react';
import { BookNowAccordion } from '@/components/travel/BookNowAccordion';

/**
 * Dedicated booking surface, extracted from /travel in v2.
 * Flights, hotels, transfers. Linked from TripCockpit and from per-destination
 * "Book" overflow actions. `?intent=book` on /travel redirects here.
 */
export default function Book() {
  const { t } = useTranslation();
  return (
    <div className="container mx-auto max-w-screen-xl px-4 py-8 md:py-12">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <LocalizedLink
          to="/travel"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground no-underline"
        >
          <ChevronLeft size={14} />
          {t('travel.book.back', 'Travel')}
        </LocalizedLink>
      </nav>
      <h1 className="mb-2 text-headline-lg font-bold tracking-tight">
        {t('travel.book.title', 'Book your trip')}
      </h1>
      <p className="mb-8 max-w-prose text-body-lg text-muted-foreground">
        {t(
          'travel.book.lede',
          'Flights, stays, and transfers. We pass your preferences to trusted partners — bookings happen on their site.',
        )}
      </p>
      <BookNowAccordion defaultOpen />
    </div>
  );
}

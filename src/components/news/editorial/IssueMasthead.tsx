import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { PageIntro } from '@/components/layout/PageIntro';

export function IssueMasthead() {
  const { t } = useTranslation();
  const now = new Date();

  return (
    <header className="mb-8">
      <PageIntro
        title={t('header.intents.news.label', 'News')}
        lede={t('header.intents.news.subtitle', 'LGBTQ+ news from around the world')}
      />
      <p className="mt-4 text-2xs uppercase tracking-[0.2em] text-muted-foreground">
        {format(now, 'EEEE · MMMM d, yyyy')}
      </p>
    </header>
  );
}

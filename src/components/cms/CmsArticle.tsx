import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PageContainer } from '@/components/layout/PageContainer';
import { extractSections } from '@/lib/htmlSections';
import { normalizeCmsBody } from '@/lib/cms/normalizeCmsBody';
import { formatCmsDate } from '@/lib/cms/formatCmsDate';

/** Contents only earn their place on a page long enough to need them. */
const MIN_CONTENTS_SECTIONS = 4;

interface CmsArticleProps {
  title: string;
  subtitle?: string | null;
  /** Already sanitised HTML. */
  html: string;
  eyebrow?: string | null;
  /** A real timestamp from the row; nothing is shown without one. */
  dateLabel?: string | null;
  date?: string | null;
  cover?: { url: string; alt: string } | null;
  children?: ReactNode;
}

/**
 * The generic cms_pages article: one <h1>, the subtitle as a paragraph, a real
 * date, contents built from the body's own headings, then the body at a
 * reading measure. Shared by /p/:slug and the fixed CMS routes so the two can
 * no longer drift into different heading outlines.
 */
export function CmsArticle({
  title,
  subtitle,
  html,
  eyebrow,
  dateLabel,
  date,
  cover,
  children,
}: CmsArticleProps) {
  const { t } = useTranslation();
  const { sections, htmlWithIds } = useMemo(
    () => extractSections(normalizeCmsBody(html, { subtitle })),
    [html, subtitle],
  );
  const top = sections.filter((s) => (s.depth ?? 1) === 1);
  const formatted = formatCmsDate(date);

  return (
    <PageContainer>
      {cover && (
        <img
          src={cover.url}
          alt={cover.alt}
          className="mb-6 max-h-[400px] w-full bg-muted rounded-element object-cover"
        />
      )}

      <header className="max-w-reading border-b border-border-hairline pb-6">
        {eyebrow && (
          <Badge variant="secondary" className="mb-2">
            {eyebrow}
          </Badge>
        )}
        <h1 className="font-display text-display leading-none tracking-tight">{title}</h1>
        {subtitle && <p className="mt-4 text-body-lg text-muted-foreground">{subtitle}</p>}
        {formatted && dateLabel && (
          <p className="mt-4 text-13 text-muted-foreground">
            <span className="font-bold text-foreground">{dateLabel}</span> {formatted}
          </p>
        )}
      </header>

      {top.length >= MIN_CONTENTS_SECTIONS && (
        <details className="mt-6 max-w-reading rounded-element bg-muted px-4 py-2">
          <summary className="cursor-pointer text-13 font-bold">
            {t('cms.contents', 'On this page')}{' '}
            <span className="font-normal text-muted-foreground">
              {t('cms.contentsCount', '({{count}} sections)', { count: top.length })}
            </span>
          </summary>
          <nav aria-label={t('cms.contents', 'On this page')}>
            <ul className="mt-2 space-y-1 pb-2">
              {top.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-13">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </details>
      )}

      {htmlWithIds && (
        <div className="qg-cms-body mt-8" dangerouslySetInnerHTML={{ __html: htmlWithIds }} />
      )}

      {children}
    </PageContainer>
  );
}

/** Missing, unpublished or unreachable — each with a way forward. */
export function CmsPageUnavailable({
  failed,
  onRetry,
}: {
  failed?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <PageContainer className="text-center">
      <h1 className="mb-2 font-display text-display">
        {failed
          ? t('cms.loadFailedTitle', 'This page did not load')
          : t('cms.notFoundTitle', 'Page Not Found')}
      </h1>
      <p className="text-muted-foreground">
        {failed
          ? t('cms.loadFailedBody', 'Check your connection and try again.')
          : t(
              'cms.notFoundBody',
              "The page you're looking for doesn't exist or hasn't been published yet.",
            )}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {failed && onRetry && (
          <Button type="button" onClick={onRetry}>
            {t('common.tryAgain', 'Try again')}
          </Button>
        )}
        <Button asChild variant="outline">
          <LocalizedLink to="/">{t('cms.goHome', 'Go to the homepage')}</LocalizedLink>
        </Button>
        <Button asChild variant="outline">
          <LocalizedLink to="/sitemap">{t('cms.sitemap', 'See all pages')}</LocalizedLink>
        </Button>
      </div>
    </PageContainer>
  );
}

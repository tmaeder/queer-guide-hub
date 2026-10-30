import { GuideProse } from '@/components/guides/GuideProse';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, BookOpen } from '@/components/icons';
import { useDetailMeta } from '@/hooks/useDetailMeta';
import { useGuide, questPhase, type GuideSection } from '@/hooks/useGuides';
import { useGuideReadTracker } from '@/hooks/useGuideReadTracker';
import { GuidePickBlock, GuideComparisonTable } from '@/components/guides/GuidePickBlock';
import { QuestModule } from '@/components/guides/QuestModule';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageContainer } from '@/components/layout/PageContainer';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { ShareMenu } from '@/components/share/ShareMenu';

function SectionBlock({ section }: { section: GuideSection }) {
  if (!section.body_md) return null;
  return section.kind === 'callout' ? (
    <aside className="rounded-container bg-muted/40 p-6">
      <GuideProse text={section.body_md} />
    </aside>
  ) : (
    <GuideProse text={section.body_md} />
  );
}

const GuideDetail = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useLocalizedNavigate();
  const { data, isLoading, error } = useGuide(slug);
  useGuideReadTracker(data?.guide.id);

  useDetailMeta({
    status: isLoading ? 'loading' : error || !data ? 'notFound' : 'ready',
    notFoundTitle: t('guides.detail.notFound.title', 'Guide not found.'),
    title: data?.guide?.title ?? t('guides.detail.fallbackTitle', 'Guide'),
    description: data?.guide?.dek ?? undefined,
    canonicalPath: data?.guide ? `/guides/${data.guide.slug}` : undefined,
    ogType: 'article',
    jsonLd: data?.guide
      ? {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: data.guide.title,
          description: data.guide.dek ?? undefined,
          datePublished: data.guide.published_at ?? undefined,
          dateModified: data.guide.updated_at,
          author: { '@type': 'Organization', name: 'Queer Guide' },
        }
      : undefined,
  });

  if (isLoading) {
    return (
      <PageContainer>
        <div className="h-3 w-32 bg-muted animate-pulse rounded-badge mb-6" />
        <div className="h-12 w-3/4 bg-muted animate-pulse rounded-element mb-4" />
        <div className="h-6 w-2/3 bg-muted animate-pulse rounded-element" />
      </PageContainer>
    );
  }

  if (error || !data) {
    return (
      <PageContainer>
        <EmptyState
          icon={BookOpen}
          title={t('guides.detail.notFound.title', 'Guide not found.')}
          description={t(
            'guides.detail.notFound.description',
            'It may have been moved or unpublished.',
          )}
          primaryAction={{
            label: t('guides.detail.browseAll', 'Browse all guides'),
            onClick: () => navigate('/guides'),
          }}
        />
      </PageContainer>
    );
  }

  const { guide, sections } = data;
  const picks = data.picks.filter((p) => p.entity);
  const hero = resolveImageUrl({ imageUrl: guide.hero_image_path });
  const isQuest = guide.format === 'quest';
  const phase = questPhase(guide);
  const formatLabel = isQuest
    ? t('guides.format.quest', 'Quest')
    : guide.format === 'list'
      ? t('guides.format.list', 'List')
      : t('guides.format.guide', 'Guide');

  const eyebrowParts = [formatLabel];
  if (guide.category) eyebrowParts.push(guide.category.replace(/_/g, ' '));
  if (!isQuest && guide.reading_time_min) {
    eyebrowParts.push(
      t('guides.card.minRead', '{{count}} min read').replace(
        '{{count}}',
        String(guide.reading_time_min),
      ),
    );
  }
  if (!isQuest && picks.length > 0) {
    eyebrowParts.push(
      t('guides.card.picks', '{{count}} picks').replace('{{count}}', String(picks.length)),
    );
  }
  if (isQuest && phase) {
    eyebrowParts.push(
      phase === 'active'
        ? t('guides.quest.liveNow', 'Live now')
        : phase === 'completed'
          ? t('guides.quest.completed', 'Completed')
          : t('guides.quest.scheduled', 'Scheduled'),
    );
  }

  return (
    <article className="min-h-screen">
      <PageContainer as="header" flush size="reading" className="max-w-4xl pt-8 pb-12">
        <LocalizedLink
          to="/guides"
          className="inline-flex items-center gap-2 text-13 text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft size={14} aria-hidden />
          {t('guides.detail.allGuides', 'All guides')}
        </LocalizedLink>

        <p className="text-xs2 uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {eyebrowParts.join(' · ')}
        </p>
        <h1 className="text-hero leading-[1.05] mb-6">{guide.title}</h1>
        {guide.dek && (
          <p className="italic text-body-lg text-muted-foreground max-w-2xl">{guide.dek}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <ShareMenu
            url={window.location.href}
            title={guide.title}
            text={guide.dek ?? undefined}
            entity={{
              entity_table: 'guides',
              entity_id: guide.id,
              title: guide.title,
              subtitle: guide.dek ?? null,
              image_url: hero ?? null,
              path: `/guides/${guide.slug}`,
            }}
          />
          <AdminEditButton
            contentType="guides"
            contentId={guide.id}
            contentName={guide.title}
            currentData={guide as unknown as Record<string, unknown>}
            exportable
          />
        </div>
      </PageContainer>

      {hero && (
        <PageContainer flush className="max-w-5xl mb-12">
          <div className="relative aspect-[16/9] rounded-container overflow-hidden bg-muted">
            <img src={hero} alt="" className="absolute inset-0 size-full object-cover" />
          </div>
        </PageContainer>
      )}

      {guide.intro_md && (
        <PageContainer as="section" flush size="reading" className="mb-16">
          <GuideProse text={guide.intro_md} />
        </PageContainer>
      )}

      {guide.selection_method && (
        <PageContainer as="section" flush size="reading" className="mb-12 space-y-4">
          <h2 className="text-heading-sm">{t('guides.method', 'How we selected these')}</h2>
          <GuideProse text={guide.selection_method} />
          {guide.last_verified_at && (
            <p className="text-13 text-muted-foreground">
              {t('guides.verified', 'Sources checked')}{' '}
              {new Date(guide.last_verified_at).toLocaleDateString()}
            </p>
          )}
        </PageContainer>
      )}
      {!isQuest && picks.length === 0 && (
        <PageContainer flush size="reading" className="mb-12">
          <p role="status">
            {t(
              'guides.noVerifiedPicks',
              'Recommendations are being reviewed. Check back for an updated selection.',
            )}
          </p>
        </PageContainer>
      )}

      {isQuest && (
        <PageContainer flush className="max-w-4xl mb-16">
          <QuestModule guide={guide} />
        </PageContainer>
      )}

      {sections.length > 0 && (
        <PageContainer as="section" flush size="reading" className="mb-16 space-y-10">
          {sections.map((s) => (
            <SectionBlock key={s.id} section={s} />
          ))}
        </PageContainer>
      )}

      {picks.length > 0 && (
        <PageContainer as="section" flush className="max-w-5xl space-y-16">
          {picks.map((pick, i) => (
            <GuidePickBlock key={pick.id} pick={pick} index={i} />
          ))}
        </PageContainer>
      )}

      {guide.format === 'guide' && (
        <PageContainer flush>
          <GuideComparisonTable picks={picks} />
        </PageContainer>
      )}

      <PageContainer as="footer" flush size="reading" className="my-16 pt-8">
        <p className="inline-flex items-center gap-2 text-13 text-muted-foreground">
          <Clock size={14} aria-hidden />
          {t('guides.detail.lastUpdated', 'Last updated')}{' '}
          {new Date(guide.updated_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </PageContainer>
    </article>
  );
};

export default GuideDetail;

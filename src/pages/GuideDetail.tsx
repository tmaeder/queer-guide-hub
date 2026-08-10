import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, BookOpen } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { useGuide, questPhase, type GuideSection } from '@/hooks/useGuides';
import { useGuideReadTracker } from '@/hooks/useGuideReadTracker';
import { GuidePickBlock, GuideComparisonTable } from '@/components/guides/GuidePickBlock';
import { QuestModule } from '@/components/guides/QuestModule';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageContainer } from '@/components/layout/PageContainer';

function SectionBlock({ section }: { section: GuideSection }) {
  if (!section.body_md) return null;
  const paras = section.body_md.split(/\n\n+/);
  if (section.kind === 'callout') {
    return (
      <aside className="rounded-container bg-muted/40 p-6 space-y-4">
        {paras.map((p, i) => (
          <p key={i} className="text-body-lg leading-relaxed">
            {p}
          </p>
        ))}
      </aside>
    );
  }
  return (
    <div className="space-y-6">
      {paras.map((p, i) => (
        <p key={i} className="text-body-lg leading-relaxed">
          {p}
        </p>
      ))}
    </div>
  );
}

const GuideDetail = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useLocalizedNavigate();
  const { data, isLoading, error } = useGuide(slug);
  useGuideReadTracker(data?.guide.id);

  useMeta({
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

  const { guide, picks, sections } = data;
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
  if (!isQuest && guide.pick_count > 0) {
    eyebrowParts.push(
      t('guides.card.picks', '{{count}} picks').replace('{{count}}', String(guide.pick_count)),
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
      </PageContainer>

      {hero && (
        <PageContainer flush className="max-w-5xl mb-12">
          <div className="relative aspect-[16/9] rounded-container overflow-hidden bg-muted">
            <img src={hero} alt="" className="absolute inset-0 size-full object-cover" />
          </div>
        </PageContainer>
      )}

      {guide.intro_md && (
        <PageContainer as="section" flush size="reading" className="mb-16 space-y-6">
          {guide.intro_md.split(/\n\n+/).map((para, i) => (
            <p key={i} className="text-body-lg leading-relaxed">
              {para}
            </p>
          ))}
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

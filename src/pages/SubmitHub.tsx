/**
 * SubmitHub — /submit hub page.
 * Scan-first: a flyer/photo/PDF/link scanner is the default entry; manual type cards sit
 * below, with the high-volume directory types up front and the niche ones behind a
 * "More ways to contribute" disclosure.
 */

import { useState } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { cn } from '@/lib/utils';
import {
  primarySubmissionTypes,
  moreSubmissionTypes,
  type SubmissionTypeConfig,
} from '@/config/submissionRegistry';
import { useFlyerScan } from '@/hooks/useFlyerScan';
import { FlyerScanUpload } from '@/components/submission/FlyerScanUpload';
import { FlyerScanResults } from '@/components/submission/FlyerScanResults';
import { ArrowRight, ArrowLeft, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SubmitHub = () => {
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  const flyerScan = useFlyerScan();
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const handleResetScan = () => {
    setSelectedVenueId(null);
    flyerScan.reset();
  };

  const handleApplyScan = (
    resultIdx: number,
    itemIdx: number,
    detectedType: 'event' | 'venue',
  ) => {
    const formData = flyerScan.applyToForm(resultIdx, itemIdx, selectedVenueId ?? undefined);
    const imageUrl = flyerScan.results[resultIdx]?.image_url;
    navigate(`/submit/${detectedType}`, { state: { prefill: formData, imageUrl } });
  };

  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        className="-ml-4 mb-6 flex items-center gap-2"
      >
        <ArrowLeft size={16} />
        Back
      </Button>

      <header className="mb-12">
        <Eyebrow>{t('pages.submit.eyebrow', 'Contribute')}</Eyebrow>
        <h1 className="mt-2 font-bold text-display md:text-headline-lg">
          {t('pages.submit.title', 'Contribute to Queer Guide')}
        </h1>
        <p className="mt-4 text-body-lg leading-[1.6] text-muted-foreground max-w-prose">
          {t(
            'pages.submit.subtitle',
            "Help build the world's most comprehensive LGBTQ+ directory. All submissions are reviewed before publishing.",
          )}
        </p>
      </header>

      {/* Scan-first hero */}
      {user ? (
        <section aria-label={t('pages.submit.scanHeroLabel', 'Scan to auto-fill')}>
          <Eyebrow className="text-foreground">
            {t('pages.submit.scanHeroEyebrow', 'Fastest way')}
          </Eyebrow>
          <h2 className="mt-2 font-bold text-headline">
            {t('pages.submit.scanHeroTitle', 'Let us fill the form for you')}
          </h2>
          <p className="mt-2 mb-6 text-15 leading-[1.6] text-muted-foreground max-w-prose">
            {t(
              'pages.submit.scanHeroSubtitle',
              'Drop a flyer, photo or PDF — or paste a link (event page, Instagram, venue site, news). We extract the details.',
            )}
          </p>
          <FlyerScanUpload
            scanState={flyerScan.scanState}
            error={flyerScan.error}
            currentFileIndex={flyerScan.currentFileIndex}
            totalFiles={flyerScan.totalFiles}
            onFilesSelected={flyerScan.startScan}
            onUrlSubmit={flyerScan.startUrlScan}
            onReset={handleResetScan}
          >
            {flyerScan.results.length > 0 && (
              <FlyerScanResults
                results={flyerScan.results}
                selectedVenueId={selectedVenueId}
                onSelectVenue={setSelectedVenueId}
                onApply={handleApplyScan}
                onDismiss={handleResetScan}
              />
            )}
          </FlyerScanUpload>
        </section>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-15 font-semibold">
                {t('pages.submit.signedOutTitle', 'Sign in to contribute')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground max-w-prose">
                {t(
                  'pages.submit.signedOutBody',
                  'An account lets you scan a flyer and submit content. Guest submissions are not currently supported.',
                )}
              </p>
            </div>
            <Button
              variant="accent"
              onClick={() => navigate('/auth')}
              className="shrink-0 self-start sm:self-auto"
            >
              {t('pages.submit.signedOutCta', 'Sign in to contribute')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Manual type cards — primary */}
      <section className="mt-12 border-t border-border pt-12">
        <Eyebrow>{t('pages.submit.manualTitle', 'Prefer to type it in?')}</Eyebrow>
        <div className="mt-6 flex flex-col gap-4">
          {primarySubmissionTypes[0] && (
            <SubmitTypeCard
              type={primarySubmissionTypes[0]}
              featured
              onClick={() => navigate(`/submit/${primarySubmissionTypes[0].id}`)}
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {primarySubmissionTypes.slice(1).map((type) => (
              <SubmitTypeCard
                key={type.id}
                type={type}
                onClick={() => navigate(`/submit/${type.id}`)}
              />
            ))}
          </div>
        </div>

        {/* More ways to contribute — disclosure */}
        <details className="mt-8 group">
          <summary className="flex items-center gap-2 cursor-pointer list-none py-2 text-2xs font-semibold uppercase tracking-label text-muted-foreground transition-colors hover:text-foreground">
            <ChevronDown
              size={14}
              className="transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
            {t('pages.submit.moreTitle', 'More ways to contribute')}
          </summary>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {moreSubmissionTypes.map((type) => (
              <SubmitTypeCard
                key={type.id}
                type={type}
                onClick={() => navigate(`/submit/${type.id}`)}
              />
            ))}
          </div>
        </details>
      </section>
    </div>
  );
};

// ── Monochrome type card ──────────────────────────────────────────

interface SubmitTypeCardProps {
  type: SubmissionTypeConfig;
  onClick: () => void;
  /** Featured cards span two columns on sm+ and lay out icon beside copy. */
  featured?: boolean;
}

function SubmitTypeCard({ type, onClick, featured = false }: SubmitTypeCardProps) {
  const { t } = useTranslation();
  const Icon = type.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group/card w-full text-left rounded-container border border-border/60 bg-card text-card-foreground',
        'cursor-pointer transition-all duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:bg-muted/40 hover:border-foreground/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
      )}
    >
      <CardContent className={cn('flex h-full flex-col pt-6', featured && 'sm:flex-row sm:gap-6')}>
        <div className="mb-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-element bg-muted transition-colors group-hover/card:bg-foreground group-hover/card:text-background sm:mb-0">
          <Icon size={20} aria-hidden="true" />
        </div>
        <div className="flex flex-1 flex-col">
          <p className="text-title font-semibold leading-tight">Submit {type.label}</p>
          <p className="mt-2 text-sm leading-[1.5] text-muted-foreground">{type.description}</p>
          <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold sm:mt-auto sm:pt-4">
            {t('pages.submit.getStarted', 'Get started')}
            <ArrowRight
              size={14}
              aria-hidden="true"
              className="transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:translate-x-1"
            />
          </div>
        </div>
      </CardContent>
    </button>
  );
}

export default SubmitHub;

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
import {
  primarySubmissionTypes,
  moreSubmissionTypes,
  type SubmissionTypeConfig,
} from '@/config/submissionRegistry';
import { useFlyerScan } from '@/hooks/useFlyerScan';
import { FlyerScanUpload } from '@/components/submission/FlyerScanUpload';
import { FlyerScanResults } from '@/components/submission/FlyerScanResults';
import { ArrowRight, Heart, ArrowLeft, ChevronDown } from 'lucide-react';
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
        className="mb-4 flex items-center gap-2"
      >
        <ArrowLeft size={16} />
        Back
      </Button>

      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <Heart size={32} />
        </div>
        <h4 className="text-2xl font-bold mb-2">
          {t('pages.submit.title', 'Contribute to Queer Guide')}
        </h4>
        <p className="text-base text-muted-foreground max-w-lg mx-auto">
          {t(
            'pages.submit.subtitle',
            "Help build the world's most comprehensive LGBTQ+ directory. All submissions are reviewed before publishing.",
          )}
        </p>
      </div>

      {/* Scan-first hero */}
      {user ? (
        <section className="mb-8" aria-label={t('pages.submit.scanHeroLabel', 'Scan to auto-fill')}>
          <h5 className="text-sm font-semibold mb-1">
            {t('pages.submit.scanHeroTitle', 'Let us fill the form for you')}
          </h5>
          <p className="text-sm text-muted-foreground mb-4">
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
        <Card className="mb-8">
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">
              <strong>Tip:</strong>{' '}
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="text-foreground underline cursor-pointer bg-transparent border-0 p-0 font-inherit"
              >
                Sign in or create an account
              </button>{' '}
              to scan a flyer or submit content. Guest submissions are not currently supported.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Manual type cards — primary */}
      <p className="text-sm font-semibold mb-4">
        {t('pages.submit.manualTitle', 'Prefer to type it in?')}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {primarySubmissionTypes.map((type) => (
          <SubmitTypeCard key={type.id} type={type} onClick={() => navigate(`/submit/${type.id}`)} />
        ))}
      </div>

      {/* More ways to contribute — disclosure */}
      <details className="mt-6 group">
        <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-muted-foreground list-none py-2">
          <ChevronDown
            size={16}
            className="transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
          {t('pages.submit.moreTitle', 'More ways to contribute')}
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          {moreSubmissionTypes.map((type) => (
            <SubmitTypeCard
              key={type.id}
              type={type}
              onClick={() => navigate(`/submit/${type.id}`)}
            />
          ))}
        </div>
      </details>
    </div>
  );
};

// ── Monochrome type card ──────────────────────────────────────────

interface SubmitTypeCardProps {
  type: SubmissionTypeConfig;
  onClick: () => void;
}

function SubmitTypeCard({ type, onClick }: SubmitTypeCardProps) {
  const Icon = type.icon;
  return (
    <Card onClick={onClick} className="cursor-pointer">
      <CardContent>
        <div className="w-10 h-10 rounded-element flex items-center justify-center mb-4 bg-muted">
          <Icon size={20} className="text-foreground" />
        </div>
        <p className="text-base font-semibold mb-1">Submit {type.label}</p>
        <p className="text-sm text-muted-foreground mb-4" style={{ minHeight: '2.5em' }}>
          {type.description}
        </p>
        <div className="flex items-center gap-1">
          <p className="text-sm font-semibold text-foreground">Get started</p>
          <ArrowRight size={14} aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}

export default SubmitHub;

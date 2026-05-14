import { Badge } from '@/components/ui/badge';

interface SafetyFlag {
  type: string;
  severity: string;
  reason?: string;
}

interface Props {
  platform?: string | null;
  mediaProcessingStatus?: string | null;
  mediaUrls?: string[] | null;
  ocrText?: string | null;
  visionSummary?: string | null;
  transcriptText?: string | null;
  rawText?: string | null;
  queerRelevanceScore?: number | null;
  confidenceScore?: number | null;
  safetyFlags?: SafetyFlag[] | null;
}

const SEVERITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  low: 'default',
  medium: 'secondary',
  high: 'destructive',
};

function ScoreBadge({ label, value }: { label: string; value: number | null | undefined }) {
  if (typeof value !== 'number') return null;
  const pct = Math.round(value * 100);
  const variant = pct >= 70 ? 'default' : pct >= 40 ? 'secondary' : 'destructive';
  return <Badge variant={variant}>{`${label}: ${pct}%`}</Badge>;
}

export function SubmissionMediaSection({
  platform,
  mediaProcessingStatus,
  mediaUrls,
  ocrText,
  visionSummary,
  transcriptText,
  rawText,
  queerRelevanceScore,
  confidenceScore,
  safetyFlags,
}: Props) {
  const hasContent =
    platform ||
    mediaProcessingStatus ||
    mediaUrls?.length ||
    ocrText ||
    visionSummary ||
    transcriptText ||
    rawText ||
    typeof queerRelevanceScore === 'number' ||
    typeof confidenceScore === 'number' ||
    safetyFlags?.length;
  if (!hasContent) return null;

  return (
    <div className="mb-6 pt-4 border-t border-border">
      <p className="text-sm font-medium mb-2">Source &amp; AI Signal</p>

      <div className="flex flex-row flex-wrap gap-1.5 mb-3">
        {platform && <Badge variant="outline">{`platform: ${platform}`}</Badge>}
        {mediaProcessingStatus && (
          <Badge variant="outline">{`media: ${mediaProcessingStatus}`}</Badge>
        )}
        <ScoreBadge label="relevance" value={queerRelevanceScore} />
        <ScoreBadge label="confidence" value={confidenceScore} />
      </div>

      {safetyFlags?.length ? (
        <div className="mb-3">
          <span className="text-xs text-muted-foreground">Safety flags</span>
          <div className="flex flex-row flex-wrap gap-1 mt-1">
            {safetyFlags.map((f, i) => (
              <Badge
                key={i}
                variant={SEVERITY_VARIANT[f.severity] ?? 'default'}
                title={f.reason ?? ''}
              >
                {`${f.type} · ${f.severity}`}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {mediaUrls?.length ? (
        <div className="mb-3">
          <span className="text-xs text-muted-foreground">Media ({mediaUrls.length})</span>
          <div className="flex gap-2 flex-wrap mt-1">
            {mediaUrls.slice(0, 6).map((u, i) =>
              /\.(mp4|mov|webm)$/i.test(u) ? (
                <div
                  key={i}
                  className="bg-muted flex items-center justify-center"
                  style={{ width: 96, height: 96, fontSize: 11 }}
                >
                  video
                </div>
              ) : (
                <img
                  key={i}
                  src={u}
                  alt={`media ${i + 1}`}
                  style={{ width: 96, height: 96, objectFit: 'cover' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ),
            )}
          </div>
        </div>
      ) : null}

      {rawText ? <TextBlock label="Raw text" body={rawText} /> : null}
      {ocrText ? <TextBlock label="OCR text" body={ocrText} /> : null}
      {visionSummary ? <TextBlock label="Vision summary" body={visionSummary} /> : null}
      {transcriptText ? <TextBlock label="Transcript" body={transcriptText} /> : null}
    </div>
  );
}

function TextBlock({ label, body }: { label: string; body: string }) {
  return (
    <div className="mb-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p
        className="font-mono whitespace-pre-wrap mt-1 p-2 bg-muted overflow-y-auto"
        style={{ fontSize: 12, maxHeight: 200 }}
      >
        {body}
      </p>
    </div>
  );
}

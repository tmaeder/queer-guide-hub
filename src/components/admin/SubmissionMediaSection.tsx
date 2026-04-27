import { Box, Typography, Chip, Stack } from '@mui/material';

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

const SEVERITY_COLOR: Record<string, 'default' | 'warning' | 'error'> = {
  low: 'default',
  medium: 'warning',
  high: 'error',
};

function ScoreChip({ label, value }: { label: string; value: number | null | undefined }) {
  if (typeof value !== 'number') return null;
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? 'success' : pct >= 40 ? 'warning' : 'error';
  return <Chip size="small" label={`${label}: ${pct}%`} color={color} />;
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
  // Render nothing if there's no media/AI signal — keeps the dialog clean for
  // legacy submissions that pre-date the social pipeline.
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
    <Box sx={{ mb: 3, borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Source &amp; AI Signal
      </Typography>

      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5, gap: 0.75 }}>
        {platform && <Chip size="small" label={`platform: ${platform}`} />}
        {mediaProcessingStatus && (
          <Chip size="small" label={`media: ${mediaProcessingStatus}`} />
        )}
        <ScoreChip label="relevance" value={queerRelevanceScore} />
        <ScoreChip label="confidence" value={confidenceScore} />
      </Stack>

      {safetyFlags?.length ? (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Safety flags
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5, gap: 0.5 }}>
            {safetyFlags.map((f, i) => (
              <Chip
                key={i}
                size="small"
                label={`${f.type} · ${f.severity}`}
                color={SEVERITY_COLOR[f.severity] ?? 'default'}
                title={f.reason ?? ''}
              />
            ))}
          </Stack>
        </Box>
      ) : null}

      {mediaUrls?.length ? (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Media ({mediaUrls.length})
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
            {mediaUrls.slice(0, 6).map((u, i) =>
              /\.(mp4|mov|webm)$/i.test(u) ? (
                <Box
                  key={i}
                  sx={{
                    width: 96,
                    height: 96,
                    bgcolor: 'action.hover',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                  }}
                >
                  video
                </Box>
              ) : (
                <Box
                  key={i}
                  component="img"
                  src={u}
                  alt={`media ${i + 1}`}
                  sx={{ width: 96, height: 96, objectFit: 'cover' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ),
            )}
          </Box>
        </Box>
      ) : null}

      {rawText ? (
        <TextBlock label="Raw text" body={rawText} />
      ) : null}
      {ocrText ? <TextBlock label="OCR text" body={ocrText} /> : null}
      {visionSummary ? <TextBlock label="Vision summary" body={visionSummary} /> : null}
      {transcriptText ? <TextBlock label="Transcript" body={transcriptText} /> : null}
    </Box>
  );
}

function TextBlock({ label, body }: { label: string; body: string }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
          fontSize: 12,
          maxHeight: 200,
          overflowY: 'auto',
          bgcolor: 'action.hover',
          p: 1,
          mt: 0.5,
        }}
      >
        {body}
      </Typography>
    </Box>
  );
}

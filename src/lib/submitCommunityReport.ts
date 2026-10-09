import { supabase } from '@/integrations/supabase/client';

export type CommunityReportKind = 'feedback' | 'correction';

interface SubmitCommunityReportInput {
  kind: CommunityReportKind;
  payload: Record<string, unknown>;
  context: object;
  screenshotBlob?: Blob | null;
  includeScreenshot?: boolean;
  honeypot?: string;
}

export interface CommunityReportResult {
  id: string;
  screenshotStored: boolean;
}

/**
 * Submit feedback/corrections through the only public endpoint that may attach
 * an anonymous screenshot. The server accepts these two report kinds only; it
 * cannot be used to create directory entities or upload arbitrary image keys.
 */
export async function submitCommunityReport({
  kind,
  payload,
  context,
  screenshotBlob,
  includeScreenshot = true,
  honeypot = '',
}: SubmitCommunityReportInput): Promise<CommunityReportResult> {
  const screenshot =
    includeScreenshot && screenshotBlob
      ? {
          contentType: screenshotBlob.type || 'image/jpeg',
          base64: await blobToBase64(screenshotBlob),
        }
      : null;

  const { data, error } = await supabase.functions.invoke('submit-community-report', {
    body: { kind, payload, context, screenshot, honeypot },
  });

  if (error) throw error;
  const result = data as Partial<CommunityReportResult> | null;
  if (!result?.id) throw new Error('submit-community-report returned no submission id');
  return { id: result.id, screenshotStored: result.screenshotStored === true };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      if (comma < 0) reject(new Error('Could not encode screenshot'));
      else resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read screenshot'));
    reader.readAsDataURL(blob);
  });
}

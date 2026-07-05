import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFlyerScan, type BuiltSubmission } from '@/hooks/useFlyerScan';
import { FlyerScanUpload } from '@/components/submission/FlyerScanUpload';
import { FlyerScanResults } from '@/components/submission/FlyerScanResults';
import { useMessaging } from '@/hooks/useMessaging';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { SubmissionMeta } from '@/components/messaging/chat/submissionShare';

interface InChatSubmitSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

/**
 * In-chat submit: scan a link/flyer, review extracted items, submit — without
 * leaving the conversation. Mounts its own useFlyerScan + the unchanged
 * FlyerScanUpload/FlyerScanResults; the only new logic is posting the result
 * into the chat as a `submission` card so the group can follow its status.
 */
export function InChatSubmitSheet({ open, onOpenChange, conversationId }: InChatSubmitSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { toast } = useToast();
  const { sendMessage } = useMessaging();
  const flyerScan = useFlyerScan();

  const handleClose = (next: boolean) => {
    if (!next) flyerScan.reset();
    onOpenChange(next);
  };

  const handleSubmitBatch = async (rows: BuiltSubmission[]) => {
    if (!user) return;
    try {
      const { inserted, rows: insertedRows } = await flyerScan.submitBatch(rows);
      if (insertedRows.length > 0) {
        const meta: SubmissionMeta = {
          kind: 'submission',
          submission_ids: insertedRows.map((r) => r.id),
          items: insertedRows,
          submitted_by: user.id,
        };
        const first = insertedRows[0].title;
        const content =
          inserted === 1
            ? t('chat.submission.messageOne', {
                defaultValue: 'added "{{title}}" for review',
                title: first,
              })
            : t('chat.submission.messageMany', {
                defaultValue: 'added {{count}} items for review: {{title}}…',
                count: inserted,
                title: first,
              });
        await sendMessage(
          conversationId,
          content,
          undefined,
          'submission',
          meta as unknown as Record<string, unknown>,
        );
      }
      toast({
        title: t('chat.submission.submitted', {
          defaultValue: '{{count}} submitted for review',
          count: inserted,
        }),
      });
      flyerScan.reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: t('chat.submission.failed', { defaultValue: 'Submission failed' }),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="overflow-y-auto"
        style={isMobile ? { maxHeight: '85vh' } : { width: 480, maxWidth: '100vw' }}
      >
        <SheetHeader className="mb-4">
          <SheetTitle>
            {t('chat.submission.title', { defaultValue: 'Add to Queer Guide' })}
          </SheetTitle>
          <SheetDescription>
            {t('chat.submission.subtitle', {
              defaultValue:
                'Drop a flyer or paste a link. Extracted items are submitted for review and shared in this chat.',
            })}
          </SheetDescription>
        </SheetHeader>
        <FlyerScanUpload
          scanState={flyerScan.scanState}
          error={flyerScan.error}
          currentFileIndex={flyerScan.currentFileIndex}
          totalFiles={flyerScan.totalFiles}
          onFilesSelected={flyerScan.startScan}
          onUrlSubmit={flyerScan.startUrlScan}
          onReset={flyerScan.reset}
        >
          {flyerScan.results.length > 0 && (
            <FlyerScanResults
              results={flyerScan.results}
              onSubmitBatch={handleSubmitBatch}
              onDismiss={flyerScan.reset}
            />
          )}
        </FlyerScanUpload>
      </SheetContent>
    </Sheet>
  );
}

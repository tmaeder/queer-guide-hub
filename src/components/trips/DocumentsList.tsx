import { useState } from 'react';
import {
  Plus,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  IdCard,
  Trash2,
  Download,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  useTripDocuments,
  useDeleteDocument,
  getDocumentDownloadUrl,
  type TripDocument,
  type DocType,
} from '@/hooks/useTripDocuments';
import { expiryStatus, expiryLabel, type ExpiryLevel } from '@/utils/docExpiry';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AddDocumentDialog } from './AddDocumentDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface Props {
  /** `null` for personal docs, a tripId for trip-attached docs. */
  tripId: string | null;
  /** Smaller heading + no surrounding heading when embedded in another section. */
  embedded?: boolean;
}

const ICON_BY_TYPE: Record<DocType, typeof FileText> = {
  passport: IdCard,
  id_card: IdCard,
  visa: ShieldCheck,
  vaccine: ShieldCheck,
  insurance: ShieldCheck,
  flight_ticket: FileText,
  hotel_voucher: FileText,
  event_ticket: FileText,
  other: FileText,
};

const EXPIRY_BADGE_VARIANT: Record<ExpiryLevel, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ok: 'outline',
  warning: 'secondary',
  urgent: 'destructive',
  expired: 'destructive',
};

export function DocumentsList({ tripId, embedded = false }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: docs, isLoading } = useTripDocuments(tripId);
  const remove = useDeleteDocument();

  const [addOpen, setAddOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<TripDocument | null>(null);

  const handleDownload = async (doc: TripDocument) => {
    const url = await getDocumentDownloadUrl(doc);
    if (!url) {
      toast({
        title: t('docs.download.failedTitle', 'Could not open document'),
        description: t(
          'docs.download.failedDescription',
          'The link expired or the file is missing. Try uploading again.',
        ),
        variant: 'destructive',
      });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const confirmDelete = () => {
    if (!deleteCandidate) return;
    const doc = deleteCandidate;
    setDeleteCandidate(null);
    remove.mutate(doc, {
      onSuccess: () => toast({ title: t('docs.delete.success', 'Document deleted') }),
      onError: (err) =>
        toast({
          title: t('docs.delete.failedTitle', 'Delete failed'),
          description: String(err),
          variant: 'destructive',
        }),
    });
  };

  return (
    <div>
      {!embedded && (
        <div className="flex items-center justify-between mb-4">
          <h6 className="text-base font-bold">
            {tripId === null
              ? t('docs.list.personalTitle', 'Personal documents')
              : t('docs.list.tripTitle', 'Trip documents')}
          </h6>
          <Button variant="brand" size="sm" onClick={() => setAddOpen(true)}>
            <Plus style={{ width: 14, height: 14, marginRight: 6 }} />
            {t('docs.list.add', 'Add document')}
          </Button>
        </div>
      )}

      {embedded && (
        <div className="flex justify-end mb-2">
          <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}>
            <Plus style={{ width: 14, height: 14, marginRight: 6 }} />
            {t('docs.list.add', 'Add document')}
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={68} />
          ))}
        </div>
      )}

      {!isLoading && (docs?.length ?? 0) === 0 && (
        <EmptyState
          icon={FileText}
          title={
            tripId === null
              ? t('docs.list.emptyPersonalTitle', 'No personal documents yet')
              : t('docs.list.emptyTripTitle', 'No trip documents yet')
          }
          description={t(
            'docs.list.emptyDescription',
            'Stored privately. PDF, JPG, PNG, HEIC, or WebP up to 25 MB.',
          )}
          primaryAction={{
            label: t('docs.list.add', 'Add document'),
            onClick: () => setAddOpen(true),
            variant: 'brand',
          }}
        />
      )}

      {!isLoading && (docs?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2">
          {(docs ?? []).map((doc) => {
            const Icon = ICON_BY_TYPE[doc.doc_type] ?? FileText;
            const status = expiryStatus(doc.expiry_date);
            const label = expiryLabel(status, t as never);
            const isImage = doc.mime_type?.startsWith('image/');

            return (
              <Card key={doc.id}>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-muted flex items-center justify-center flex-shrink-0">
                      {isImage ? <ImageIcon size={16} /> : <Icon size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{doc.title}</p>
                        <Badge variant="secondary" className="capitalize">
                          {t(`docs.type.${doc.doc_type}`, doc.doc_type.replace('_', ' '))}
                        </Badge>
                        {label && (
                          <Badge variant={EXPIRY_BADGE_VARIANT[status.level]} className="inline-flex items-center gap-1">
                            {status.level === 'expired' || status.level === 'urgent' ? (
                              <AlertTriangle size={12} />
                            ) : (
                              <Clock size={12} />
                            )}
                            {label}
                          </Badge>
                        )}
                      </div>
                      {doc.notes && (
                        <p className="text-[0.8125rem] text-muted-foreground mt-0.5">
                          {doc.notes}
                        </p>
                      )}
                      <p className="text-[0.6875rem] text-muted-foreground mt-0.5">
                        {t('docs.list.uploaded', 'Uploaded')}{' '}
                        {format(new Date(doc.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 w-11 p-0"
                        onClick={() => void handleDownload(doc)}
                        aria-label={t('docs.list.open', 'Open')}
                      >
                        <Download size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 w-11 p-0 opacity-60 hover:opacity-100"
                        onClick={() => setDeleteCandidate(doc)}
                        aria-label={t('docs.list.delete', 'Delete')}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddDocumentDialog open={addOpen} onClose={() => setAddOpen(false)} tripId={tripId} />

      <Dialog
        open={!!deleteCandidate}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('docs.delete.title', 'Delete document?')}</DialogTitle>
            <DialogDescription>
              {t(
                'docs.delete.confirm',
                'This removes both the file and its metadata. You cannot undo this.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCandidate(null)}>
              {t('docs.delete.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={remove.isPending}>
              {remove.isPending
                ? t('docs.delete.deleting', 'Deleting…')
                : t('docs.delete.confirmCta', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

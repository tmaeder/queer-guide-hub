import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
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

const EXPIRY_CHIP_COLOR: Record<ExpiryLevel, 'default' | 'warning' | 'error' | 'success'> = {
  ok: 'default',
  warning: 'warning',
  urgent: 'error',
  expired: 'error',
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
    <Box>
      {!embedded && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2,
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {tripId === null
              ? t('docs.list.personalTitle', 'Personal documents')
              : t('docs.list.tripTitle', 'Trip documents')}
          </Typography>
          <Button variant="brand" size="sm" onClick={() => setAddOpen(true)}>
            <Plus style={{ width: 14, height: 14, marginRight: 6 }} />
            {t('docs.list.add', 'Add document')}
          </Button>
        </Box>
      )}

      {embedded && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}>
            <Plus style={{ width: 14, height: 14, marginRight: 6 }} />
            {t('docs.list.add', 'Add document')}
          </Button>
        </Box>
      )}

      {isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={68} />
          ))}
        </Box>
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {(docs ?? []).map((doc) => {
            const Icon = ICON_BY_TYPE[doc.doc_type] ?? FileText;
            const status = expiryStatus(doc.expiry_date);
            const label = expiryLabel(status, t as never);
            const isImage = doc.mime_type?.startsWith('image/');

            return (
              <Card key={doc.id}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        bgcolor: 'action.hover',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isImage ? <ImageIcon size={16} /> : <Icon size={16} />}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 600 }}>{doc.title}</Typography>
                        <Chip
                          label={t(`docs.type.${doc.doc_type}`, doc.doc_type.replace('_', ' '))}
                          size="small"
                          sx={{ textTransform: 'capitalize' }}
                        />
                        {label && (
                          <Chip
                            icon={
                              status.level === 'expired' || status.level === 'urgent' ? (
                                <AlertTriangle size={12} />
                              ) : (
                                <Clock size={12} />
                              )
                            }
                            label={label}
                            size="small"
                            color={EXPIRY_CHIP_COLOR[status.level]}
                            variant={status.level === 'ok' ? 'outlined' : 'filled'}
                          />
                        )}
                      </Box>
                      {doc.notes && (
                        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.25 }}>
                          {doc.notes}
                        </Typography>
                      )}
                      <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mt: 0.25 }}>
                        {t('docs.list.uploaded', 'Uploaded')}{' '}
                        {format(new Date(doc.created_at), 'MMM d, yyyy')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <IconButton
                        size="small"
                        onClick={() => void handleDownload(doc)}
                        aria-label={t('docs.list.open', 'Open')}
                        sx={{ minWidth: 44, minHeight: 44 }}
                      >
                        <Download size={14} />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => setDeleteCandidate(doc)}
                        aria-label={t('docs.list.delete', 'Delete')}
                        sx={{ minWidth: 44, minHeight: 44, opacity: 0.6, '&:hover': { opacity: 1 } }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
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
    </Box>
  );
}

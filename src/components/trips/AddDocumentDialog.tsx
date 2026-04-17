import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { Upload, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  useUploadDocument,
  type DocType,
} from '@/hooks/useTripDocuments';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — enough for a passport scan, generous for PDFs.

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
];

const DOC_TYPES: ReadonlyArray<{ value: DocType; labelKey: string; defaultLabel: string }> = [
  { value: 'passport', labelKey: 'docs.type.passport', defaultLabel: 'Passport' },
  { value: 'id_card', labelKey: 'docs.type.id_card', defaultLabel: 'ID card' },
  { value: 'visa', labelKey: 'docs.type.visa', defaultLabel: 'Visa' },
  { value: 'vaccine', labelKey: 'docs.type.vaccine', defaultLabel: 'Vaccine card' },
  { value: 'insurance', labelKey: 'docs.type.insurance', defaultLabel: 'Insurance' },
  { value: 'flight_ticket', labelKey: 'docs.type.flight_ticket', defaultLabel: 'Flight ticket' },
  { value: 'hotel_voucher', labelKey: 'docs.type.hotel_voucher', defaultLabel: 'Hotel voucher' },
  { value: 'event_ticket', labelKey: 'docs.type.event_ticket', defaultLabel: 'Event ticket' },
  { value: 'other', labelKey: 'docs.type.other', defaultLabel: 'Other' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, the document is attached to this trip. Null = personal. */
  tripId: string | null;
  /** Default doc type — passport for personal, visa for trips. */
  defaultType?: DocType;
}

export function AddDocumentDialog({ open, onClose, tripId, defaultType }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const upload = useUploadDocument();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<DocType>(
    defaultType ?? (tripId === null ? 'passport' : 'visa'),
  );
  const [expiry, setExpiry] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setFile(null);
    setTitle('');
    setDocType(defaultType ?? (tripId === null ? 'passport' : 'visa'));
    setExpiry('');
    setNotes('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = () => {
    if (upload.isPending) return;
    reset();
    onClose();
  };

  const onPick = (f: File | null) => {
    if (!f) return;
    if (!ALLOWED_MIME.includes(f.type)) {
      toast({
        title: t('docs.upload.unsupportedTitle', 'Unsupported file type'),
        description: t(
          'docs.upload.unsupportedDescription',
          'Upload PDF, JPG, PNG, HEIC, or WebP only.',
        ),
        variant: 'destructive',
      });
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      toast({
        title: t('docs.upload.tooLargeTitle', 'File too large'),
        description: t('docs.upload.tooLargeDescription', 'Max 25 MB per document.'),
        variant: 'destructive',
      });
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const submit = () => {
    if (!file || !title.trim() || upload.isPending) return;
    upload.mutate(
      {
        file,
        title: title.trim(),
        doc_type: docType,
        expiry_date: expiry || null,
        trip_id: tripId,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          toast({ title: t('docs.upload.success', 'Document saved') });
          reset();
          onClose();
        },
        onError: (err) =>
          toast({
            title: t('docs.upload.failedTitle', 'Upload failed'),
            description: String(err),
            variant: 'destructive',
          }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('docs.upload.title', 'Add document')}</DialogTitle>
          <DialogDescription>
            {t(
              'docs.upload.description',
              'Stored privately. Only you can read it; trip co-members see attached docs.',
            )}
          </DialogDescription>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {/* File picker */}
          <Box>
            <input
              ref={fileRef}
              type="file"
              accept={ALLOWED_MIME.join(',')}
              hidden
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
            >
              <Upload style={{ width: 16, height: 16, marginRight: 6 }} />
              {file
                ? t('docs.upload.replace', 'Replace file')
                : t('docs.upload.pick', 'Choose file')}
            </Button>
            {file && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <FileText size={14} />
                <Typography sx={{ fontSize: '0.875rem' }}>{file.name}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </Typography>
              </Box>
            )}
          </Box>

          <TextField
            label={t('docs.upload.titleLabel', 'Title')}
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            disabled={upload.isPending}
            fullWidth
            size="small"
          />

          <TextField
            select
            label={t('docs.upload.typeLabel', 'Document type')}
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
            disabled={upload.isPending}
            fullWidth
            size="small"
          >
            {DOC_TYPES.map((d) => (
              <MenuItem key={d.value} value={d.value}>
                {t(d.labelKey, d.defaultLabel)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label={t('docs.upload.expiryLabel', 'Expiry date (optional)')}
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            disabled={upload.isPending}
            InputLabelProps={{ shrink: true }}
            fullWidth
            size="small"
          />

          <TextField
            label={t('docs.upload.notesLabel', 'Notes (optional)')}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            disabled={upload.isPending}
            multiline
            minRows={2}
            fullWidth
            size="small"
          />

          {upload.isPending && <LinearProgress />}
        </Box>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={upload.isPending}>
            {t('docs.upload.cancel', 'Cancel')}
          </Button>
          <Button
            variant="brand"
            onClick={submit}
            disabled={!file || !title.trim() || upload.isPending}
          >
            {upload.isPending
              ? t('docs.upload.uploading', 'Uploading…')
              : t('docs.upload.save', 'Save document')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

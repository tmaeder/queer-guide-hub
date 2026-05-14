import { useRef, useState } from 'react';
import { Upload, FileText, Sparkles } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  useUploadDocument,
  type DocType,
} from '@/hooks/useTripDocuments';
import { supabase } from '@/integrations/supabase/client';

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
  const [extracting, setExtracting] = useState(false);

  const reset = () => {
    setFile(null);
    setTitle('');
    setDocType(defaultType ?? (tripId === null ? 'passport' : 'visa'));
    setExpiry('');
    setNotes('');
    setExtracting(false);
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

  /**
   * Auto-fill the form by sending the picked image to the
   * `extract-document-fields` edge function. Only valid for image
   * mime types — PDFs aren't supported by Claude vision today, so we
   * just gate the button on `image/*` files.
   */
  const autoFill = async () => {
    if (!file || extracting) return;
    if (!file.type.startsWith('image/')) return;
    setExtracting(true);
    try {
      const buf = await file.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const image_b64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke('extract-document-fields', {
        body: { image_b64, mime_type: file.type, hint_doc_type: docType },
      });
      if (error) throw error;
      const out = data as {
        title?: string;
        doc_type?: DocType;
        expiry_date?: string;
        country_code?: string;
        confidence: number;
      };
      if (!out || (!out.title && !out.expiry_date && !out.doc_type)) {
        toast({
          title: t('docs.upload.extractEmpty', "Couldn't read this document"),
          description: t(
            'docs.upload.extractEmptyHint',
            'Try a clearer photo, or fill the fields manually.',
          ),
        });
        return;
      }
      if (out.title && !title) setTitle(out.title);
      if (out.doc_type && docType === (defaultType ?? (tripId === null ? 'passport' : 'visa'))) {
        setDocType(out.doc_type);
      }
      if (out.expiry_date && !expiry) setExpiry(out.expiry_date);
      toast({
        title: t('docs.upload.extractApplied', 'Auto-filled fields'),
        description: t('docs.upload.extractAppliedHint', 'Review before saving.'),
      });
    } catch (err) {
      toast({
        title: t('docs.upload.extractFailed', 'Auto-fill failed'),
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setExtracting(false);
    }
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

        <div className="flex flex-col gap-4 mt-2">
          {/* File picker */}
          <div>
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
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <FileText size={14} />
                <span className="text-sm">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
                {file.type.startsWith('image/') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void autoFill()}
                    disabled={extracting || upload.isPending}
                    aria-label={t('docs.upload.autoFill', 'Auto-fill from photo')}
                  >
                    <Sparkles style={{ width: 14, height: 14, marginRight: 4 }} />
                    {extracting
                      ? t('docs.upload.autoFilling', 'Reading…')
                      : t('docs.upload.autoFill', 'Auto-fill from photo')}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('docs.upload.titleLabel', 'Title')}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 200))}
              disabled={upload.isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('docs.upload.typeLabel', 'Document type')}</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)} disabled={upload.isPending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {t(d.labelKey, d.defaultLabel)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('docs.upload.expiryLabel', 'Expiry date (optional)')}</Label>
            <Input
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              disabled={upload.isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('docs.upload.notesLabel', 'Notes (optional)')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              disabled={upload.isPending}
              rows={2}
            />
          </div>

          {upload.isPending && (
            <div className="h-1 bg-muted overflow-hidden rounded">
              <div className="h-full bg-primary animate-pulse" style={{ width: '100%' }} />
            </div>
          )}
        </div>

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

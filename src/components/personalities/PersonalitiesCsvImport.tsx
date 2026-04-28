import { useState, useRef } from "react";
import { Box, Typography } from '@mui/material';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileText, Download, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  classifyEntity,
  expectedKindForTargetTable,
  type EntityKind,
  type ClassifyResult,
} from "@/lib/entityClassifier";

interface ImportResult {
  success: boolean;
  imported: number;
  total_parsed: number;
  errors?: string[];
  error?: string;
  details?: string;
  hint?: string;
}

interface PreviewRow {
  rowNumber: number;
  name: string;
  classification: ClassifyResult;
}

interface Preview {
  file: File;
  totalRows: number;
  rows: PreviewRow[];
  histogram: Record<EntityKind, number>;
  mismatchCount: number;
}

// RFC 4180-ish CSV parser — same shape the edge function uses, kept tiny so
// we can run a per-row entity-type classification before commit.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; continue; }
      if (ch === '"') { inQuotes = false; continue; }
      field += ch;
    } else {
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === ',') { row.push(field); field = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 0 && r.some(c => c.trim()));
}

const TARGET_TABLE = 'personalities';
const EXPECTED_KIND = expectedKindForTargetTable(TARGET_TABLE)!;

export function PersonalitiesCsvImport({ onImportComplete }: { onImportComplete?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [acknowledgeMismatch, setAcknowledgeMismatch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Stage 1: read the file, classify each row locally, surface a preview.
  // The user must confirm before any data is staged — issue #113.
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file",
        variant: "destructive"
      });
      return;
    }

    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        toast({
          title: "Empty CSV",
          description: "The file has no data rows",
          variant: "destructive"
        });
        return;
      }
      const headers = rows[0].map(h => h.trim().toLowerCase());
      const histogram: Record<EntityKind, number> = {
        person: 0, venue: 0, event: 0, glossary_term: 0, unknown: 0,
      };
      const previewRows: PreviewRow[] = [];
      let mismatchCount = 0;

      for (let i = 1; i < rows.length; i++) {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => { obj[h] = (rows[i][idx] ?? '').trim(); });
        const classification = classifyEntity(obj);
        histogram[classification.classified_as]++;
        if (
          classification.classified_as !== EXPECTED_KIND &&
          classification.classified_as !== 'unknown' &&
          classification.confidence >= 0.45
        ) {
          mismatchCount++;
        }
        // Cap the preview list so a 10k-row CSV doesn't render 10k <li>s.
        if (previewRows.length < 50) {
          previewRows.push({
            rowNumber: i + 1,
            name: obj.name || '(no name)',
            classification,
          });
        }
      }

      setPreview({ file, totalRows: rows.length - 1, rows: previewRows, histogram, mismatchCount });
      setAcknowledgeMismatch(false);
      setImportResult(null);
    } catch (error) {
      toast({
        title: "Could not read CSV",
        description: error instanceof Error ? error.message : "Parse failed",
        variant: "destructive",
      });
    }
  };

  // Stage 2: actually upload after the user confirms.
  const handleConfirmUpload = async () => {
    if (!preview) return;
    setIsUploading(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', preview.file);

      const { data, error } = await supabase.functions.invoke('import-personalities-csv', {
        body: formData
      });

      if (error) {
        throw error;
      }

      setImportResult(data);

      if (data.success) {
        toast({
          title: "Import successful",
          description: `Successfully imported ${data.imported} personalities`,
        });
        onImportComplete?.();
      } else {
        toast({
          title: "Import failed",
          description: data.error || "Unknown error occurred",
          variant: "destructive"
        });
      }

    } catch (error: unknown) {
      console.error('Import error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to import CSV file';
      toast({
        title: "Import error",
        description: errorMessage,
        variant: "destructive"
      });

      setImportResult({
        success: false,
        imported: 0,
        total_parsed: 0,
        error: errorMessage
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const downloadTemplate = () => {
    const csvContent = `name,description,birth_date,death_date,is_living,profession,nationality,birth_place,image_url,website_url,pronouns,verification_status,visibility,is_featured,fields
"Elton John","British singer, songwriter and pianist","1947-03-25","","true","musician, singer","United Kingdom","Pinner","","https://en.wikipedia.org/wiki/Elton_John","he/him","verified","public","true","music,activism"
"Freddie Mercury","British singer and songwriter","1946-09-05","1991-11-24","false","singer, songwriter","United Kingdom","Stone Town","","https://en.wikipedia.org/wiki/Freddie_Mercury","he/him","verified","public","true","music"`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'personalities-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const resetImport = () => {
    setImportResult(null);
    setPreview(null);
    setAcknowledgeMismatch(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Personalities from CSV</DialogTitle>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Instructions */}
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <FileText />
                CSV Format Requirements
              </Typography>
              <Box component="ul" sx={{ fontSize: '0.875rem', color: 'text.secondary', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Box component="li"><Typography component="strong">Required columns:</Typography> name</Box>
                <Box component="li"><Typography component="strong">Optional columns:</Typography> description, birth_date (YYYY-MM-DD), death_date (YYYY-MM-DD), is_living (true/false), profession, nationality, birth_place, image_url, website_url, pronouns, verification_status (verified/pending/disputed), visibility (public/private/draft), is_featured (true/false), fields (comma-separated)</Box>
                <Box component="li"><Typography component="strong">Fields:</Typography> music, arts, entertainment, sports, politics, activism, science, business, literature, media</Box>
                <Box component="li"><Typography component="strong">Date format:</Typography> YYYY-MM-DD (e.g., 1947-03-25)</Box>
                <Box component="li"><Typography component="strong">Boolean format:</Typography> true/false</Box>
              </Box>

              <Button
                variant="ghost"
                size="sm"
                onClick={downloadTemplate}

              >
                <Download />
                Download Template
              </Button>
            </CardContent>
          </Card>

          {/* File picker — stage 1: classify locally before commit */}
          {!importResult && !preview && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Label htmlFor="csv-file">Select CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  disabled={isUploading}
                />
              </Box>
            </Box>
          )}

          {/* Preview — stage 2: show detected entity types per row */}
          {!importResult && preview && (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  Preview: detected entity types
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                  {preview.totalRows} rows in <strong>{preview.file.name}</strong>. The
                  AI validator will reject any row whose detected type doesn't
                  match <strong>{EXPECTED_KIND}</strong>.
                </Typography>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                  {(Object.keys(preview.histogram) as EntityKind[]).map((k) => (
                    <Box key={k} sx={{ minWidth: 100 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {k.replace('_', ' ')}
                      </Typography>
                      <Typography variant="h5" sx={{
                        fontWeight: 700,
                        color: k === EXPECTED_KIND
                          ? 'success.main'
                          : (preview.histogram[k] > 0 ? 'warning.main' : 'text.disabled'),
                      }}>
                        {preview.histogram[k]}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {preview.mismatchCount > 0 && (
                  <Box sx={{ p: 2, mb: 2, bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                      ⚠ {preview.mismatchCount} of {preview.totalRows} rows look like
                      a different entity type than {EXPECTED_KIND}. The validator
                      will reject these — they will not be inserted.
                    </Typography>
                    <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={acknowledgeMismatch}
                        onChange={(e) => setAcknowledgeMismatch(e.target.checked)}
                      />
                      <Typography variant="body2">
                        I understand. Proceed and let the validator route mismatches.
                      </Typography>
                    </Box>
                  </Box>
                )}

                <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
                  First {preview.rows.length} rows:
                </Typography>
                <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', maxHeight: 240, overflowY: 'auto', fontSize: '0.875rem' }}>
                  {preview.rows.map((r) => {
                    const mismatch = r.classification.classified_as !== EXPECTED_KIND &&
                      r.classification.classified_as !== 'unknown' &&
                      r.classification.confidence >= 0.45;
                    return (
                      <Box component="li" key={r.rowNumber} sx={{
                        py: 0.5,
                        display: 'grid',
                        gridTemplateColumns: '60px 1fr 120px',
                        gap: 1,
                        color: mismatch ? 'error.main' : 'inherit',
                      }}>
                        <Typography variant="caption">#{r.rowNumber}</Typography>
                        <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name}
                        </Typography>
                        <Typography variant="caption" sx={{ textAlign: 'right' }}>
                          {r.classification.classified_as}{' '}
                          ({Math.round(r.classification.confidence * 100)}%)
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>

                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <Button
                    onClick={handleConfirmUpload}
                    disabled={isUploading || (preview.mismatchCount > 0 && !acknowledgeMismatch)}
                    size="sm"
                  >
                    {isUploading ? 'Uploading…' : `Import ${preview.totalRows} rows`}
                  </Button>
                  <Button onClick={resetImport} variant="outline" size="sm" disabled={isUploading}>
                    Cancel
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Import Results */}
          {importResult && (
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  {importResult.success ? (
                    <CheckCircle />
                  ) : (
                    <AlertCircle />
                  )}
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {importResult.success ? 'Import Successful' : 'Import Failed'}
                  </Typography>
                </Box>

                {importResult.success ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: '0.875rem' }}>
                    <Typography>✅ Successfully imported <Typography component="strong">{importResult.imported}</Typography> personalities</Typography>
                    <Typography>📊 Total personalities processed: <Typography component="strong">{importResult.total_parsed}</Typography></Typography>
                    {importResult.errors && importResult.errors.length > 0 && (
                      <Box>
                        <Typography sx={{ color: 'warning.main' }}>⚠️ Some rows had errors:</Typography>
                        <Box component="ul" sx={{ listStylePosition: 'inside', color: 'warning.main', ml: 2 }}>
                          {importResult.errors.map((error, index) => (
                            <Box component="li" key={index}>{error}</Box>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: '0.875rem' }}>
                    <Typography sx={{ color: 'error.main' }}>❌ {importResult.error}</Typography>
                    {importResult.details && (
                      <Typography sx={{ color: 'text.secondary' }}>{importResult.details}</Typography>
                    )}
                    {importResult.hint && (
                      <Typography sx={{ color: 'info.main' }}>💡 {importResult.hint}</Typography>
                    )}
                    {importResult.errors && importResult.errors.length > 0 && (
                      <Box>
                        <Typography sx={{ color: 'error.main' }}>Errors found:</Typography>
                        <Box component="ul" sx={{ listStylePosition: 'inside', color: 'error.main', ml: 2 }}>
                          {importResult.errors.map((error, index) => (
                            <Box component="li" key={index}>{error}</Box>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <Button
                    onClick={resetImport}
                    variant="outline"
                    size="sm"
                  >
                    Import Another File
                  </Button>
                  <Button
                    onClick={() => setIsOpen(false)}
                    size="sm"
                  >
                    Close
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useRef } from "react";
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

        <div className="flex flex-col gap-6">
          {/* Instructions */}
          <Card>
            <CardContent>
              <h6 className="text-base font-semibold mb-2 flex items-center gap-2">
                <FileText />
                CSV Format Requirements
              </h6>
              <ul className="text-sm text-muted-foreground flex flex-col gap-1">
                <li><strong>Required columns:</strong> name</li>
                <li><strong>Optional columns:</strong> description, birth_date (YYYY-MM-DD), death_date (YYYY-MM-DD), is_living (true/false), profession, nationality, birth_place, image_url, website_url, pronouns, verification_status (verified/pending/disputed), visibility (public/private/draft), is_featured (true/false), fields (comma-separated)</li>
                <li><strong>Fields:</strong> music, arts, entertainment, sports, politics, activism, science, business, literature, media</li>
                <li><strong>Date format:</strong> YYYY-MM-DD (e.g., 1947-03-25)</li>
                <li><strong>Boolean format:</strong> true/false</li>
              </ul>

              <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                <Download />
                Download Template
              </Button>
            </CardContent>
          </Card>

          {!importResult && !preview && (
            <div className="flex flex-col gap-4">
              <div>
                <Label htmlFor="csv-file">Select CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  disabled={isUploading}
                />
              </div>
            </div>
          )}

          {!importResult && preview && (
            <Card>
              <CardContent>
                <h6 className="text-base font-semibold mb-2">Preview: detected entity types</h6>
                <p className="text-sm text-muted-foreground mb-4">
                  {preview.totalRows} rows in <strong>{preview.file.name}</strong>. The
                  AI validator will reject any row whose detected type doesn't
                  match <strong>{EXPECTED_KIND}</strong>.
                </p>

                <div className="flex flex-wrap gap-4 mb-4">
                  {(Object.keys(preview.histogram) as EntityKind[]).map((k) => (
                    <div key={k} className="min-w-[100px]">
                      <span className="text-xs text-muted-foreground">{k.replace('_', ' ')}</span>
                      <div
                        className="text-xl font-bold"
                        style={{
                          color: k === EXPECTED_KIND
                            ? 'hsl(var(--success))'
                            : (preview.histogram[k] > 0 ? 'hsl(var(--warning))' : 'hsl(var(--muted-foreground))'),
                        }}
                      >
                        {preview.histogram[k]}
                      </div>
                    </div>
                  ))}
                </div>

                {preview.mismatchCount > 0 && (
                  <div className="p-4 mb-4" style={{ backgroundColor: 'hsl(var(--warning) / 0.15)' }}>
                    <p className="text-sm font-semibold mb-2">
                      ⚠ {preview.mismatchCount} of {preview.totalRows} rows look like
                      a different entity type than {EXPECTED_KIND}. The validator
                      will reject these — they will not be inserted.
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acknowledgeMismatch}
                        onChange={(e) => setAcknowledgeMismatch(e.target.checked)}
                      />
                      <span className="text-sm">
                        I understand. Proceed and let the validator route mismatches.
                      </span>
                    </label>
                  </div>
                )}

                <span className="text-xs text-muted-foreground mb-1 block">
                  First {preview.rows.length} rows:
                </span>
                <ul className="m-0 p-0 list-none max-h-[240px] overflow-y-auto text-sm">
                  {preview.rows.map((r) => {
                    const mismatch = r.classification.classified_as !== EXPECTED_KIND &&
                      r.classification.classified_as !== 'unknown' &&
                      r.classification.confidence >= 0.45;
                    return (
                      <li
                        key={r.rowNumber}
                        className="py-1 grid gap-2"
                        style={{
                          gridTemplateColumns: '60px 1fr 120px',
                          color: mismatch ? 'hsl(var(--destructive))' : 'inherit',
                        }}
                      >
                        <span className="text-xs">#{r.rowNumber}</span>
                        <p className="text-sm overflow-hidden text-ellipsis whitespace-nowrap">{r.name}</p>
                        <span className="text-xs text-right">
                          {r.classification.classified_as} ({Math.round(r.classification.confidence * 100)}%)
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex gap-2 mt-4">
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
                </div>
              </CardContent>
            </Card>
          )}

          {importResult && (
            <Card>
              <CardContent>
                <div className="flex items-center gap-2 mb-3">
                  {importResult.success ? <CheckCircle /> : <AlertCircle />}
                  <h6 className="text-base font-semibold">
                    {importResult.success ? 'Import Successful' : 'Import Failed'}
                  </h6>
                </div>

                {importResult.success ? (
                  <div className="flex flex-col gap-2 text-sm">
                    <p>✅ Successfully imported <strong>{importResult.imported}</strong> personalities</p>
                    <p>📊 Total personalities processed: <strong>{importResult.total_parsed}</strong></p>
                    {importResult.errors && importResult.errors.length > 0 && (
                      <div>
                        <p style={{ color: 'hsl(var(--warning))' }}>⚠️ Some rows had errors:</p>
                        <ul className="list-inside ml-4" style={{ color: 'hsl(var(--warning))' }}>
                          {importResult.errors.map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 text-sm">
                    <p className="text-destructive">❌ {importResult.error}</p>
                    {importResult.details && (
                      <p className="text-muted-foreground">{importResult.details}</p>
                    )}
                    {importResult.hint && (
                      <p style={{ color: 'hsl(var(--primary))' }}>💡 {importResult.hint}</p>
                    )}
                    {importResult.errors && importResult.errors.length > 0 && (
                      <div>
                        <p className="text-destructive">Errors found:</p>
                        <ul className="list-inside ml-4 text-destructive">
                          {importResult.errors.map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <Button onClick={resetImport} variant="outline" size="sm">
                    Import Another File
                  </Button>
                  <Button onClick={() => setIsOpen(false)} size="sm">
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

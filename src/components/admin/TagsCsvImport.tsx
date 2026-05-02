import { useState, useRef } from "react";
import { Loader2 } from 'lucide-react';
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

interface ImportResult {
  success: boolean;
  imported: number;
  total_parsed: number;
  errors?: string[];
  error?: string;
  details?: string;
  hint?: string;
}

export function TagsCsvImport({ onImportComplete }: { onImportComplete?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    setIsUploading(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data, error } = await supabase.functions.invoke('import-tags-csv', {
        body: formData
      });

      if (error) {
        throw error;
      }

      setImportResult(data);

      if (data.success) {
        toast({
          title: "Import successful",
          description: `Successfully imported ${data.imported} tags`,
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
    const csvContent = `name,category,description,color
"Sample Tag","sexual-orientations","Description of the tag","#6366f1"
"Another Tag","genders","Another description","#10b981"`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tags-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const resetImport = () => {
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload style={{ width: 16, height: 16, marginRight: 8 }} />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Tags from CSV</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {/* Instructions */}
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <FileText style={{ width: 16, height: 16 }} />
                <p className="text-sm font-semibold">CSV Format Requirements</p>
              </div>
              <ul className="flex flex-col gap-1">
                <li className="text-sm text-muted-foreground">* <strong>Required columns:</strong> name, category</li>
                <li className="text-sm text-muted-foreground">* <strong>Optional columns:</strong> description, color</li>
                <li className="text-sm text-muted-foreground">* <strong>Categories:</strong> consent, genders, sexual-orientations, romantic-orientations, relationships, roles, gay-culture, kink-activities, sexual-activities, philia, toys-equipment, play-spaces, events, holidays, sexual-health, mental-health, scene-safety, safety-resources</li>
                <li className="text-sm text-muted-foreground">* <strong>Color format:</strong> Hex color codes (e.g., #6366f1)</li>
              </ul>

              <Button
                variant="ghost"
                size="sm"
                onClick={downloadTemplate}
              >
                <Download style={{ width: 16, height: 16, marginRight: 8 }} />
                Download Template
              </Button>
            </CardContent>
          </Card>

          {/* File Upload */}
          {!importResult && (
            <div className="flex flex-col gap-4">
              <div>
                <Label htmlFor="csv-file">Select CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </div>

              {isUploading && (
                <div className="text-center py-4">
                  <div className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading and processing CSV...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import Results */}
          {importResult && (
            <Card>
              <CardContent>
                <div className="flex items-center gap-2 mb-3">
                  {importResult.success ? (
                    <CheckCircle style={{ width: 20, height: 20, color: '#22c55e' }} />
                  ) : (
                    <AlertCircle style={{ width: 20, height: 20, color: '#ef4444' }} />
                  )}
                  <p className="text-sm font-semibold">
                    {importResult.success ? 'Import Successful' : 'Import Failed'}
                  </p>
                </div>

                {importResult.success ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm">Successfully imported <strong>{importResult.imported}</strong> tags</p>
                    <p className="text-sm">Total tags processed: <strong>{importResult.total_parsed}</strong></p>
                    {importResult.errors && importResult.errors.length > 0 && (
                      <div>
                        <p className="text-sm" style={{ color: 'hsl(var(--warning))' }}>Some rows had errors:</p>
                        <ul className="list-disc pl-6" style={{ color: 'hsl(var(--warning))' }}>
                          {importResult.errors.map((error, index) => (
                            <li className="text-sm" key={index}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-destructive">{importResult.error}</p>
                    {importResult.details && (
                      <p className="text-sm text-muted-foreground">{importResult.details}</p>
                    )}
                    {importResult.hint && (
                      <p className="text-sm" style={{ color: 'hsl(var(--info, 199 89% 48%))' }}>{importResult.hint}</p>
                    )}
                    {importResult.errors && importResult.errors.length > 0 && (
                      <div>
                        <p className="text-sm text-destructive">Errors found:</p>
                        <ul className="list-disc pl-6 text-destructive">
                          {importResult.errors.map((error, index) => (
                            <li className="text-sm" key={index}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 mt-4">
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
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

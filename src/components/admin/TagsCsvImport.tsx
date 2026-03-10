import { useState, useRef } from "react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
import { api } from "@/integrations/api/client";

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

      const { data, error } = await api.functions.invoke('import-tags-csv', {
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

    } catch (error: any) {
      console.error('Import error:', error);

      const errorMessage = error.message || 'Failed to import CSV file';
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
      <DialogContent sx={{ maxWidth: 672 }}>
        <DialogHeader>
          <DialogTitle>Import Tags from CSV</DialogTitle>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Instructions */}
          <Card>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <FileText style={{ width: 16, height: 16 }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>CSV Format Requirements</Typography>
              </Box>
              <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2" color="text.secondary" component="li">* <strong>Required columns:</strong> name, category</Typography>
                <Typography variant="body2" color="text.secondary" component="li">* <strong>Optional columns:</strong> description, color</Typography>
                <Typography variant="body2" color="text.secondary" component="li">* <strong>Categories:</strong> consent, genders, sexual-orientations, romantic-orientations, relationships, roles, gay-culture, kink-activities, sexual-activities, philia, toys-equipment, play-spaces, events, holidays, sexual-health, mental-health, scene-safety, safety-resources</Typography>
                <Typography variant="body2" color="text.secondary" component="li">* <strong>Color format:</strong> Hex color codes (e.g., #6366f1)</Typography>
              </Box>

              <Button
                variant="ghost"
                size="sm"
                onClick={downloadTemplate}
                sx={{ mt: 1.5 }}
              >
                <Download style={{ width: 16, height: 16, marginRight: 8 }} />
                Download Template
              </Button>
            </CardContent>
          </Card>

          {/* File Upload */}
          {!importResult && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Label htmlFor="csv-file">Select CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </Box>

              {isUploading && (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 16, height: 16, border: 2, borderColor: 'primary.main', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }} />
                    Uploading and processing CSV...
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* Import Results */}
          {importResult && (
            <Card>
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  {importResult.success ? (
                    <CheckCircle style={{ width: 20, height: 20, color: '#22c55e' }} />
                  ) : (
                    <AlertCircle style={{ width: 20, height: 20, color: '#ef4444' }} />
                  )}
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {importResult.success ? 'Import Successful' : 'Import Failed'}
                  </Typography>
                </Box>

                {importResult.success ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="body2">Successfully imported <strong>{importResult.imported}</strong> tags</Typography>
                    <Typography variant="body2">Total tags processed: <strong>{importResult.total_parsed}</strong></Typography>
                    {importResult.errors && importResult.errors.length > 0 && (
                      <Box>
                        <Typography variant="body2" sx={{ color: 'warning.main' }}>Some rows had errors:</Typography>
                        <Box component="ul" sx={{ listStyle: 'disc', pl: 3, color: 'warning.main' }}>
                          {importResult.errors.map((error, index) => (
                            <Typography variant="body2" component="li" key={index}>{error}</Typography>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="body2" color="error.main">{importResult.error}</Typography>
                    {importResult.details && (
                      <Typography variant="body2" color="text.secondary">{importResult.details}</Typography>
                    )}
                    {importResult.hint && (
                      <Typography variant="body2" sx={{ color: 'info.main' }}>{importResult.hint}</Typography>
                    )}
                    {importResult.errors && importResult.errors.length > 0 && (
                      <Box>
                        <Typography variant="body2" color="error.main">Errors found:</Typography>
                        <Box component="ul" sx={{ listStyle: 'disc', pl: 3, color: 'error.main' }}>
                          {importResult.errors.map((error, index) => (
                            <Typography variant="body2" component="li" key={index}>{error}</Typography>
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

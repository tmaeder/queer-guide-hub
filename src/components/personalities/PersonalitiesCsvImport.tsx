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

export function PersonalitiesCsvImport({ onImportComplete }: { onImportComplete?: () => void }) {
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

      const { data, error } = await api.functions.invoke('import-personalities-csv', {
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload sx={{ height: '16px', width: '16px', mr: 1 }} />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent sx={{ maxWidth: '768px' }}>
        <DialogHeader>
          <DialogTitle>Import Personalities from CSV</DialogTitle>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Instructions */}
          <Card>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <FileText sx={{ height: '16px', width: '16px' }} />
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
                sx={{ mt: 1.5 }}
              >
                <Download sx={{ height: '16px', width: '16px', mr: 1 }} />
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
                    <Box sx={{ animation: 'spin 1s linear infinite', borderRadius: '50%', height: '16px', width: '16px', border: 2, borderColor: 'primary.main', borderTopColor: 'transparent' }} />
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
                    <CheckCircle sx={{ height: '20px', width: '20px', color: 'success.main' }} />
                  ) : (
                    <AlertCircle sx={{ height: '20px', width: '20px', color: 'error.main' }} />
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

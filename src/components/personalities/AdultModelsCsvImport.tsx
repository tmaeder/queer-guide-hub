import { useState, useRef } from "react";
import { Box, Typography } from '@mui/material';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, CheckCircle, XCircle, AlertCircle } from "lucide-react";
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

export function AdultModelsCsvImport({ onImportComplete }: { onImportComplete?: () => void }) {
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

      const { data, error } = await supabase.functions.invoke('import-adult-models-csv', {
        body: formData
      });

      if (error) throw error;

      setImportResult(data);

      if (data.success) {
        toast({
          title: "Import successful",
          description: `Successfully imported ${data.imported} adult models`
        });
        onImportComplete?.();
      } else {
        toast({
          title: "Import completed with issues",
          description: `Imported ${data.imported} out of ${data.total_parsed} adult models`,
          variant: data.imported > 0 ? "default" : "destructive"
        });
      }
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "Import failed",
        description: "Failed to import adult models from CSV. Please check the file format.",
        variant: "destructive"
      });
      setImportResult({
        success: false,
        imported: 0,
        total_parsed: 0,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = `pornhub-profile,picture,name
https://www.pornhub.com/model/example1,https://example.com/photo1.jpg,Example Model 1
https://www.pornhub.com/model/example2,https://example.com/photo2.jpg,Example Model 2`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'adult_models_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
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
        <Button variant="outline" sx={{ gap: 1 }}>
          <Upload sx={{ height: '16px', width: '16px' }} />
          Import Adult Models CSV
        </Button>
      </DialogTrigger>
      <DialogContent sx={{ maxWidth: '768px', maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>Import Adult Models from CSV</DialogTitle>
        </DialogHeader>

        {!importResult ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Alert>
              <AlertCircle sx={{ height: '16px', width: '16px' }} />
              <AlertDescription>
                Upload a CSV file with adult model data. Each model will be created as a personality with the profession "adult model".
              </AlertDescription>
            </Alert>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Label htmlFor="csv-file">Select CSV File</Label>
                <Input
                  ref={fileInputRef}
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  sx={{ mt: 0.5 }}
                />
              </Box>

              <Box sx={{ fontSize: '0.875rem', color: 'text.secondary', display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Required columns:</Typography>
                <Box component="ul" sx={{ listStylePosition: 'inside', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box component="li"><Typography component="code">pornhub-profile</Typography> - Profile URL</Box>
                  <Box component="li"><Typography component="code">picture</Typography> - Image URL</Box>
                  <Box component="li"><Typography component="code">name</Typography> - Model name</Box>
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  All personalities will be created with profession "adult model" and will not be marked as verified or featured by default.
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button variant="outline" onClick={downloadTemplate} sx={{ gap: 1 }}>
                  <Download sx={{ height: '16px', width: '16px' }} />
                  Download Template
                </Button>
                <Button disabled={isUploading} sx={{ gap: 1 }}>
                  {isUploading ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <Upload sx={{ height: '16px', width: '16px' }} />
                      Upload File
                    </>
                  )}
                </Button>
              </Box>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Card>
              <CardHeader>
                <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {importResult.success ? (
                    <CheckCircle sx={{ height: '20px', width: '20px', color: 'success.main' }} />
                  ) : (
                    <XCircle sx={{ height: '20px', width: '20px', color: 'error.main' }} />
                  )}
                  Import Results
                </CardTitle>
              </CardHeader>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Badge variant="outline">
                    {importResult.imported} imported
                  </Badge>
                  <Badge variant="outline">
                    {importResult.total_parsed} total processed
                  </Badge>
                  {importResult.errors && importResult.errors.length > 0 && (
                    <Badge variant="destructive">
                      {importResult.errors.length} errors
                    </Badge>
                  )}
                </Box>

                {importResult.error && (
                  <Alert variant="destructive">
                    <XCircle sx={{ height: '16px', width: '16px' }} />
                    <AlertDescription>{importResult.error}</AlertDescription>
                  </Alert>
                )}

                {importResult.errors && importResult.errors.length > 0 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>Errors:</Typography>
                    <Box sx={{ maxHeight: '128px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {importResult.errors.map((error, index) => (
                        <Box key={index} sx={{ fontSize: '0.875rem', color: 'error.main', bgcolor: 'error.light', p: 1, borderRadius: 1 }}>
                          {error}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button variant="outline" onClick={resetImport}>
                Import Another File
              </Button>
              <Button onClick={() => setIsOpen(false)}>
                Close
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

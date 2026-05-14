import { useState, useRef } from "react";
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
        <Button variant="outline">
          <Upload className="w-4 h-4 mr-2" />
          Import Adult Models CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Adult Models from CSV</DialogTitle>
        </DialogHeader>

        {!importResult ? (
          <div className="flex flex-col gap-6">
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                Upload a CSV file with adult model data. Each model will be created as a personality with the profession "adult model".
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-4">
              <div>
                <Label htmlFor="csv-file">Select CSV File</Label>
                <Input
                  ref={fileInputRef}
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </div>

              <div className="text-sm text-muted-foreground flex flex-col gap-2">
                <p className="font-semibold">Required columns:</p>
                <ul className="list-inside flex flex-col gap-1">
                  <li><code>pornhub-profile</code> - Profile URL</li>
                  <li><code>picture</code> - Image URL</li>
                  <li><code>name</code> - Model name</li>
                </ul>
                <p className="mt-2">
                  All personalities will be created with profession "adult model" and will not be marked as verified or featured by default.
                </p>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
                <Button disabled={isUploading}>
                  {isUploading ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload File
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  {importResult.success ? (
                    <CheckCircle className="w-5 h-5 inline-block mr-2 text-foreground" />
                  ) : (
                    <XCircle className="w-5 h-5 inline-block mr-2 text-destructive" />
                  )}
                  Import Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
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
                </div>

                {importResult.error && (
                  <Alert variant="destructive" className="mt-4">
                    <XCircle className="w-4 h-4" />
                    <AlertDescription>{importResult.error}</AlertDescription>
                  </Alert>
                )}

                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="flex flex-col gap-2 mt-4">
                    <p className="text-sm font-medium">Errors:</p>
                    <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                      {importResult.errors.map((error, index) => (
                        <div key={index} className="text-sm text-destructive bg-destructive/10 p-2 rounded-sm">
                          {error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={resetImport}>
                Import Another File
              </Button>
              <Button onClick={() => setIsOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

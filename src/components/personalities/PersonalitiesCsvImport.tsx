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
          <Upload className="h-4 w-4 mr-2" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Personalities from CSV</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Instructions */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                CSV Format Requirements
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <strong>Required columns:</strong> name</li>
                <li>• <strong>Optional columns:</strong> description, birth_date (YYYY-MM-DD), death_date (YYYY-MM-DD), is_living (true/false), profession, nationality, birth_place, image_url, website_url, pronouns, verification_status (verified/pending/disputed), visibility (public/private/draft), is_featured (true/false), fields (comma-separated)</li>
                <li>• <strong>Fields:</strong> music, arts, entertainment, sports, politics, activism, science, business, literature, media</li>
                <li>• <strong>Date format:</strong> YYYY-MM-DD (e.g., 1947-03-25)</li>
                <li>• <strong>Boolean format:</strong> true/false</li>
              </ul>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={downloadTemplate}
                className="mt-3"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </CardContent>
          </Card>

          {/* File Upload */}
          {!importResult && (
            <div className="space-y-4">
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
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    Uploading and processing CSV...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import Results */}
          {importResult && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  {importResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                  <h3 className="font-semibold">
                    {importResult.success ? 'Import Successful' : 'Import Failed'}
                  </h3>
                </div>
                
                {importResult.success ? (
                  <div className="space-y-2 text-sm">
                    <p>✅ Successfully imported <strong>{importResult.imported}</strong> personalities</p>
                    <p>📊 Total personalities processed: <strong>{importResult.total_parsed}</strong></p>
                    {importResult.errors && importResult.errors.length > 0 && (
                      <div>
                        <p className="text-amber-600">⚠️ Some rows had errors:</p>
                        <ul className="list-disc list-inside text-amber-600 ml-4">
                          {importResult.errors.map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p className="text-red-600">❌ {importResult.error}</p>
                    {importResult.details && (
                      <p className="text-muted-foreground">{importResult.details}</p>
                    )}
                    {importResult.hint && (
                      <p className="text-blue-600">💡 {importResult.hint}</p>
                    )}
                    {importResult.errors && importResult.errors.length > 0 && (
                      <div>
                        <p className="text-red-600">Errors found:</p>
                        <ul className="list-disc list-inside text-red-600 ml-4">
                          {importResult.errors.map((error, index) => (
                            <li key={index}>{error}</li>
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
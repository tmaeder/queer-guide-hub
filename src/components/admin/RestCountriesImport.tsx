import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Download, Globe, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function RestCountriesImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importStats, setImportStats] = useState<{
    countriesCount: number;
    citiesCount: number;
  } | null>(null);
  const { toast } = useToast();

  const handleImport = async () => {
    setIsImporting(true);
    setProgress(0);
    setImportStats(null);

    try {
      // Show progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      console.log('Invoking import-rest-countries function...');
      const { data, error } = await supabase.functions.invoke('import-rest-countries');

      clearInterval(progressInterval);
      setProgress(100);

      console.log('Function response:', { data, error });

      if (error) {
        console.error('Function invocation error:', error);
        throw new Error(`Function error: ${error.message}`);
      }

      if (data?.success) {
        setImportStats({
          countriesCount: data.countriesCount,
          citiesCount: data.citiesCount
        });
        
        toast({
          title: "Import Successful",
          description: `Imported ${data.countriesCount} countries and ${data.citiesCount} capital cities`,
        });
      } else {
        console.error('Function returned error:', data);
        throw new Error(data?.details || data?.error || 'Import failed - no success flag');
      }

    } catch (error) {
      console.error('Import error:', error);
      
      // Extract meaningful error message
      let errorMessage = "An unexpected error occurred";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error);
      }
      
      toast({
        title: "Import Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          <CardTitle>REST Countries Import</CardTitle>
        </div>
        <CardDescription>
          Import all countries and capital cities from the REST Countries API. This will replace existing country data while preserving LGBTI information.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-800">Important Notes:</p>
            <ul className="mt-1 text-amber-700 space-y-1">
              <li>• This will replace ALL existing countries and cities</li>
              <li>• LGBTI rights data will be preserved for existing countries</li>
              <li>• Capital cities will be automatically created</li>
              <li>• The operation cannot be undone</li>
            </ul>
          </div>
        </div>

        {isImporting && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Importing countries and cities...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {importStats && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Globe className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">Countries</p>
                <p className="text-lg font-bold text-green-900">{importStats.countriesCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <MapPin className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-800">Capital Cities</p>
                <p className="text-lg font-bold text-blue-900">{importStats.citiesCount}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            onClick={handleImport}
            disabled={isImporting}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {isImporting ? 'Importing...' : 'Import Countries & Cities'}
          </Button>
          
          <Badge variant="outline" className="text-xs">
            Source: REST Countries API
          </Badge>
        </div>

        <div className="text-xs text-muted-foreground">
          <p>Data source: <a href="https://restcountries.com" target="_blank" rel="noopener noreferrer" className="underline">restcountries.com</a></p>
          <p>Includes: Basic country info, capitals, currencies, languages, coordinates, and more</p>
        </div>
      </CardContent>
    </Card>
  );
}
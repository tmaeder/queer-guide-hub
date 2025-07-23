import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Database, 
  RefreshCw, 
  Tag, 
  MapPin, 
  Calendar, 
  Store,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SyncResult {
  success: boolean;
  synced_tables: string[];
  total_records: number;
  errors: string[];
  configured: boolean;
  message?: string;
}

export function AlgoliaManager() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const { toast } = useToast();

  const handleSync = async (syncType: 'tags' | 'all' = 'all') => {
    setIsSyncing(true);
    setLastSyncResult(null);

    try {
      console.log(`Starting Algolia ${syncType} sync...`);

      const { data, error } = await supabase.functions.invoke('algolia-sync', {
        body: { 
          action: syncType === 'tags' ? 'sync_tags' : 'sync_all'
        }
      });

      console.log('Algolia sync response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        toast({
          title: "Sync Failed",
          description: `Edge function error: ${error.message}`,
          variant: "destructive",
        });
        setLastSyncResult({
          success: false,
          synced_tables: [],
          total_records: 0,
          errors: [error.message],
          configured: true
        });
        return;
      }

      const result = data as SyncResult;
      setLastSyncResult(result);

      if (!result.configured) {
        toast({
          title: "Configuration Required",
          description: "Please configure your Algolia credentials in Supabase Edge Functions secrets.",
          variant: "destructive",
        });
        return;
      }

      if (result.success) {
        const message = `Successfully synced ${result.total_records} records across ${result.synced_tables.length} tables`;
        toast({
          title: "Sync Complete",
          description: message,
        });

        if (result.errors && result.errors.length > 0) {
          toast({
            title: "Partial Success",
            description: `Some errors occurred: ${result.errors.join(', ')}`,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Sync Failed",
          description: result.message || "Unknown error occurred",
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Error calling Algolia sync:', error);
      toast({
        title: "Error",
        description: "Failed to trigger Algolia sync",
        variant: "destructive",
      });
      setLastSyncResult({
        success: false,
        synced_tables: [],
        total_records: 0,
        errors: [(error as Error).message],
        configured: true
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusIcon = () => {
    if (!lastSyncResult) return null;
    
    if (!lastSyncResult.configured) {
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
    
    return lastSyncResult.success ? 
      <CheckCircle className="h-5 w-5 text-green-500" /> : 
      <XCircle className="h-5 w-5 text-red-500" />;
  };

  const getStatusText = () => {
    if (!lastSyncResult) return "No sync performed yet";
    
    if (!lastSyncResult.configured) {
      return "Algolia not configured";
    }
    
    if (lastSyncResult.success) {
      return `Last sync: ${lastSyncResult.total_records} records across ${lastSyncResult.synced_tables.length} tables`;
    }
    
    return `Last sync failed: ${lastSyncResult.errors.join(', ')}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Algolia Search Index Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Display */}
        {lastSyncResult && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            {getStatusIcon()}
            <div className="flex-1">
              <p className="text-sm font-medium">{getStatusText()}</p>
              {lastSyncResult.synced_tables.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {lastSyncResult.synced_tables.map((table) => (
                    <Badge key={table} variant="outline" className="text-xs">
                      {table}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sync Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Button 
            onClick={() => handleSync('tags')}
            disabled={isSyncing}
            variant="outline"
            className="flex items-center gap-2"
          >
            {isSyncing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Tag className="h-4 w-4" />
            )}
            {isSyncing ? "Syncing..." : "Sync Tags Only"}
          </Button>
          
          <Button 
            onClick={() => handleSync('all')}
            disabled={isSyncing}
            className="flex items-center gap-2"
          >
            {isSyncing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {isSyncing ? "Syncing..." : "Sync All Data"}
          </Button>
        </div>

        {/* Information */}
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-medium">What gets synced:</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <Tag className="h-3 w-3" />
              Tags & Categories
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3" />
              Venues & Locations
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3" />
              Events & Activities
            </div>
            <div className="flex items-center gap-2">
              <Store className="h-3 w-3" />
              Marketplace Items
            </div>
          </div>
          <p className="text-xs">
            Configure Algolia credentials in Supabase Edge Functions secrets to enable search indexing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
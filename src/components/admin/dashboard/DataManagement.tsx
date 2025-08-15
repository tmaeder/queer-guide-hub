import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Database, 
  RefreshCw, 
  Trash2, 
  Download, 
  Upload, 
  Search,
  AlertTriangle,
  CheckCircle,
  FileText,
  HardDrive,
  Settings,
  Zap
} from "lucide-react";

interface DatabaseStats {
  totalTables: number;
  totalRows: number;
  databaseSize: string;
  lastBackup: string;
  activeConnections: number;
}

export function DataManagement() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dbStats, setDbStats] = useState<DatabaseStats>({
    totalTables: 0,
    totalRows: 0,
    databaseSize: "0 MB",
    lastBackup: "Never",
    activeConnections: 0
  });
  const [sqlQuery, setSqlQuery] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [cleanupOptions, setCleanupOptions] = useState({
    oldSessions: true,
    expiredTokens: true,
    oldLogs: true,
    orphanedFiles: true
  });

  const dataManagementSections = [
    {
      title: "Database Overview",
      description: "Monitor database health and performance",
      icon: Database,
      stats: [
        { label: "Total Tables", value: "24", status: "healthy" },
        { label: "Total Records", value: "15.2K", status: "healthy" },
        { label: "Database Size", value: "128 MB", status: "healthy" },
        { label: "Active Connections", value: "3", status: "healthy" }
      ]
    },
    {
      title: "Storage Usage",
      description: "Monitor storage across different buckets",
      icon: HardDrive,
      stats: [
        { label: "Images", value: "45 MB", usage: 60 },
        { label: "Documents", value: "12 MB", usage: 20 },
        { label: "Backups", value: "78 MB", usage: 80 },
        { label: "Temp Files", value: "5 MB", usage: 10 }
      ]
    }
  ];

  const handleDatabaseCleanup = async () => {
    setLoading(true);
    try {
      let cleanupCount = 0;

      if (cleanupOptions.oldSessions) {
        // Clean old session data older than 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from('user_sessions')
          .delete()
          .lt('created_at', thirtyDaysAgo);
        cleanupCount += count || 0;
      }

      if (cleanupOptions.expiredTokens) {
        // Clean expired calendar tokens
        const { count } = await supabase
          .from('calendar_feed_tokens')
          .delete()
          .eq('revoked', true);
        cleanupCount += count || 0;
      }

      if (cleanupOptions.oldLogs) {
        // Clean old security logs older than 90 days
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from('security_events')
          .delete()
          .lt('created_at', ninetyDaysAgo);
        cleanupCount += count || 0;
      }

      toast({
        title: "Database Cleanup Complete",
        description: `Cleaned up ${cleanupCount} records successfully.`
      });
    } catch (error) {
      console.error('Cleanup error:', error);
      toast({
        title: "Cleanup Failed",
        description: "Failed to cleanup database. Check console for details.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSqlQuery = async () => {
    if (!sqlQuery.trim()) return;
    
    setLoading(true);
    try {
      // Only allow SELECT queries for safety
      const trimmedQuery = sqlQuery.trim().toLowerCase();
      if (!trimmedQuery.startsWith('select')) {
        throw new Error('Only SELECT queries are allowed for security reasons');
      }

      // For demo purposes, we'll just show a message
      // In a real implementation, you'd need a secure way to execute SQL
      throw new Error('SQL execution not implemented for security reasons. Please use the export functions instead.');

      setQueryResult({ message: "SQL execution disabled for security. Use export functions instead." });
      toast({
        title: "Query Not Executed",
        description: "For security reasons, direct SQL execution is disabled. Please use the export functions.",
        variant: "destructive"
      });
    } catch (error) {
      console.error('SQL Query error:', error);
      toast({
        title: "Query Failed",
        description: error.message || "Failed to execute query.",
        variant: "destructive"
      });
      setQueryResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async (tableName: string) => {
    setLoading(true);
    try {
      // Type-safe table names
      const validTables = ['profiles', 'events', 'venues', 'marketplace_listings', 'community_groups', 'news_articles'] as const;
      
      if (!validTables.includes(tableName as any)) {
        throw new Error('Invalid table name');
      }

      const { data, error } = await supabase
        .from(tableName as any)
        .select('*')
        .limit(1000); // Limit for safety

      if (error) throw error;

      // Convert to CSV
      if (!data || data.length === 0) {
        throw new Error('No data to export');
      }

      const csvContent = convertToCSV(data);
      
      // Create and download CSV file
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `${tableName} data exported successfully (${data.length} records).`
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export data.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const convertToCSV = (data: any[]): string => {
    if (!data.length) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          if (value === null || value === undefined) return '';
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return String(value);
        }).join(',')
      )
    ];
    
    return csvRows.join('\n');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Data Management</h2>
          <p className="text-muted-foreground">Monitor and manage your database and storage</p>
        </div>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="query">SQL Console</TabsTrigger>
          <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {dataManagementSections.map((section) => {
              const Icon = section.icon;
              return (
                <Card key={section.title}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      {section.title}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {section.stats.map((stat) => (
                      <div key={stat.label} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>{stat.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{stat.value}</span>
                            {'usage' in stat && (
                              <Badge variant={stat.usage < 80 ? "default" : "destructive"}>
                                {stat.usage}%
                              </Badge>
                            )}
                            {'status' in stat && (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            )}
                          </div>
                        </div>
                        {'usage' in stat && (
                          <Progress value={stat.usage} className="h-2" />
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Button variant="outline" onClick={() => handleExportData('profiles')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Users
                </Button>
                <Button variant="outline" onClick={() => handleExportData('events')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Events
                </Button>
                <Button variant="outline" onClick={() => handleExportData('venues')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Venues
                </Button>
                <Button variant="outline" disabled>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="query" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                SQL Console
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Execute read-only SQL queries. Only SELECT statements are allowed.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sql-query">SQL Query</Label>
                <Textarea
                  id="sql-query"
                  placeholder="SELECT * FROM profiles LIMIT 10;"
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  rows={4}
                />
              </div>
              <Button onClick={handleSqlQuery} disabled={loading}>
                {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Execute Query
              </Button>
              
              {queryResult && (
                <div className="mt-6">
                  <h4 className="font-medium mb-2">Query Results:</h4>
                  <div className="bg-muted p-4 rounded-lg overflow-auto">
                    <pre className="text-sm">
                      {JSON.stringify(queryResult, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cleanup" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Database Cleanup
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Remove old and unnecessary data to optimize performance.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="old-sessions"
                    checked={cleanupOptions.oldSessions}
                    onChange={(e) => setCleanupOptions(prev => ({ ...prev, oldSessions: e.target.checked }))}
                  />
                  <Label htmlFor="old-sessions">Remove old session data (30+ days)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="expired-tokens"
                    checked={cleanupOptions.expiredTokens}
                    onChange={(e) => setCleanupOptions(prev => ({ ...prev, expiredTokens: e.target.checked }))}
                  />
                  <Label htmlFor="expired-tokens">Remove expired calendar tokens</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="old-logs"
                    checked={cleanupOptions.oldLogs}
                    onChange={(e) => setCleanupOptions(prev => ({ ...prev, oldLogs: e.target.checked }))}
                  />
                  <Label htmlFor="old-logs">Remove old security logs (90+ days)</Label>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="font-medium text-yellow-800 dark:text-yellow-200">Warning</span>
                </div>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  This action cannot be undone. Make sure you have backups before proceeding.
                </p>
              </div>

              <Button 
                onClick={handleDatabaseCleanup} 
                disabled={loading}
                variant="destructive"
              >
                {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Start Cleanup
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { table: 'profiles', name: 'User Profiles', icon: FileText },
              { table: 'events', name: 'Events', icon: FileText },
              { table: 'venues', name: 'Venues', icon: FileText },
              { table: 'marketplace_listings', name: 'Marketplace', icon: FileText },
              { table: 'community_groups', name: 'Groups', icon: FileText },
              { table: 'news_articles', name: 'News Articles', icon: FileText }
            ].map(({ table, name, icon: Icon }) => (
              <Card key={table}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => handleExportData(table)} 
                    disabled={loading}
                    size="sm"
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
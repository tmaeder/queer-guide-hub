import { useState } from 'react';
import { Plus, Settings, Play, Trash2, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useCMSConnectors } from '@/hooks/useCMSConnectors';

export function CMSConnectorManager() {
  const {
    connectors,
    syncJobs,
    loading,
    createConnector,
    toggleConnector,
    runConnector,
    deleteConnector,
    fetchConnectors
  } = useCMSConnectors();
  
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { isAdmin } = useAdminRoles();

  const [newConnector, setNewConnector] = useState({
    name: '',
    provider: 'wikidata',
    description: '',
    sync_schedule: '0 */6 * * *',
    is_active: true
  });

  const handleCreateConnector = async () => {
    if (!newConnector.name || !newConnector.provider) return;
    
    setCreating(true);
    try {
      await createConnector(newConnector);
      setShowCreateDialog(false);
      setNewConnector({
        name: '',
        provider: 'wikidata',
        description: '',
        sync_schedule: '0 */6 * * *',
        is_active: true
      });
    } finally {
      setCreating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'running': return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-50 text-green-700 border-green-200';
      case 'failed': return 'bg-red-50 text-red-700 border-red-200';
      case 'running': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const formatDuration = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = end.getTime() - start.getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You need admin privileges to access data connectors.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-64 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Data Connectors</h2>
          <p className="text-muted-foreground">Manage external data sources and sync jobs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchConnectors}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Connector
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Data Connector</DialogTitle>
                <DialogDescription>
                  Add a new external data source connector
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={newConnector.name}
                    onChange={(e) => setNewConnector(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Wikidata Events"
                  />
                </div>
                <div>
                  <Label htmlFor="provider">Provider</Label>
                  <Select value={newConnector.provider} onValueChange={(value) => setNewConnector(prev => ({ ...prev, provider: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wikidata">Wikidata</SelectItem>
                      <SelectItem value="openstreetmap">OpenStreetMap</SelectItem>
                      <SelectItem value="eventbrite">Eventbrite</SelectItem>
                      <SelectItem value="meetup">Meetup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newConnector.description}
                    onChange={(e) => setNewConnector(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of what this connector imports"
                  />
                </div>
                <div>
                  <Label htmlFor="schedule">Sync Schedule (Cron)</Label>
                  <Input
                    id="schedule"
                    value={newConnector.sync_schedule}
                    onChange={(e) => setNewConnector(prev => ({ ...prev, sync_schedule: e.target.value }))}
                    placeholder="0 */6 * * *"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateConnector} disabled={creating}>
                    {creating ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="connectors" className="space-y-6">
        <TabsList>
          <TabsTrigger value="connectors">Connectors</TabsTrigger>
          <TabsTrigger value="jobs">Sync Jobs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="connectors" className="space-y-6">
          {connectors.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <h3 className="text-lg font-semibold mb-2">No Connectors Found</h3>
                <p className="text-muted-foreground mb-4">Create your first data connector to start importing external content.</p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Connector
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {connectors.map((connector) => (
                <Card key={connector.id} className="relative">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                          {connector.name}
                          <Badge variant="outline" className="capitalize">
                            {connector.provider}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          {connector.provider === 'wikidata' && 'Import LGBTQ+ events and venues from Wikidata'}
                          {connector.provider === 'openstreetmap' && 'Import LGBTQ+ venues from OpenStreetMap'}
                          {connector.provider === 'eventbrite' && 'Import events from Eventbrite'}
                          {connector.provider === 'meetup' && 'Import events from Meetup'}
                        </CardDescription>
                      </div>
                      <Switch 
                        checked={connector.is_active} 
                        onCheckedChange={(checked) => toggleConnector(connector.id, checked)}
                        className="ml-4" 
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Sync Info */}
                    <div className="text-sm space-y-1">
                      {connector.last_sync_at && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last Sync:</span>
                          <span>{new Date(connector.last_sync_at).toLocaleString()}</span>
                        </div>
                      )}
                      {connector.next_sync_at && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Next Sync:</span>
                          <span>{new Date(connector.next_sync_at).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Schedule:</span>
                        <span className="font-mono text-xs">{connector.sync_schedule}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => runConnector(connector.id)}
                        disabled={!connector.is_active}
                        className="flex-1"
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Run Now
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1"
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        Configure
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => deleteConnector(connector.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Sync Jobs</CardTitle>
              <CardDescription>Latest synchronization attempts and their results</CardDescription>
            </CardHeader>
            <CardContent>
              {syncJobs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No sync jobs found</p>
              ) : (
                <div className="space-y-4">
                  {syncJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        {getStatusIcon(job.status)}
                        <div>
                          <div className="font-medium">
                            {connectors.find(c => c.id === job.connector_id)?.name || 'Unknown Connector'}
                          </div>
                          <div className="text-sm text-muted-foreground capitalize">
                            {job.job_type?.replace('_', ' ')} • {new Date(job.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <Badge className={getStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                        
                        {job.status === 'completed' && (
                          <div className="text-sm text-right">
                            <div className="font-medium">
                              {job.records_processed || 0} processed
                            </div>
                            <div className="text-muted-foreground">
                              {job.records_created || 0} created, {job.records_updated || 0} updated
                            </div>
                          </div>
                        )}
                        
                        {job.completed_at && job.started_at && (
                          <div className="text-xs text-muted-foreground">
                            {formatDuration(job.started_at, job.completed_at)}
                          </div>
                        )}
                        
                        {job.error_details && (
                          <div className="text-sm text-red-600 max-w-xs truncate">
                            {typeof job.error_details === 'string' 
                              ? job.error_details 
                              : job.error_details.message || 'Unknown error'
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Connector Settings</CardTitle>
              <CardDescription>Global configuration for data connectors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Default Sync Interval</Label>
                  <Select defaultValue="6h">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">Every Hour</SelectItem>
                      <SelectItem value="6h">Every 6 Hours</SelectItem>
                      <SelectItem value="12h">Every 12 Hours</SelectItem>
                      <SelectItem value="24h">Daily</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Max Concurrent Jobs</Label>
                  <Input type="number" defaultValue="3" min="1" max="10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Global Rate Limits</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Requests per minute" type="number" defaultValue="60" />
                  <Input placeholder="Requests per hour" type="number" defaultValue="1000" />
                  <Input placeholder="Requests per day" type="number" defaultValue="10000" />
                </div>
              </div>
              <Button className="w-full">Save Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
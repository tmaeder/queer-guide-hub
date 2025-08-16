import { useState } from 'react';
import { Plus, Settings, Play, Pause, AlertCircle, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function CMSConnectorManager() {
  const [connectors] = useState([
    {
      id: '1',
      name: 'Wikidata Events',
      provider: 'wikidata',
      description: 'Import LGBTQ+ events and personalities from Wikidata',
      is_active: true,
      last_sync_at: '2024-01-15T10:00:00Z',
      next_sync_at: '2024-01-16T10:00:00Z',
      sync_schedule: '0 10 * * *', // Daily at 10 AM
      config: {
        endpoint: 'https://query.wikidata.org/sparql',
        query_templates: ['lgbtq_events', 'pride_organizations'],
      },
      stats: {
        total_imported: 1250,
        last_batch_size: 47,
        success_rate: 0.94,
      },
    },
    {
      id: '2',
      name: 'OpenStreetMap Venues',
      provider: 'openstreetmap',
      description: 'Import LGBTQ+ venues and spaces from OpenStreetMap',
      is_active: true,
      last_sync_at: '2024-01-15T14:30:00Z',
      next_sync_at: '2024-01-16T14:30:00Z',
      sync_schedule: '30 14 * * *', // Daily at 2:30 PM
      config: {
        overpass_api: 'https://overpass-api.de/api/interpreter',
        tags: ['lgbtq=yes', 'community_centre=lgbtq'],
      },
      stats: {
        total_imported: 892,
        last_batch_size: 23,
        success_rate: 0.98,
      },
    },
    {
      id: '3',
      name: 'Eventbrite Integration',
      provider: 'eventbrite',
      description: 'Import public LGBTQ+ events from Eventbrite',
      is_active: false,
      last_sync_at: '2024-01-10T09:00:00Z',
      next_sync_at: null,
      sync_schedule: '0 9 * * *', // Daily at 9 AM
      config: {
        api_key: '***hidden***',
        categories: ['103', '199'], // Community & LGBTQ
        keywords: ['pride', 'lgbtq', 'queer', 'transgender'],
      },
      stats: {
        total_imported: 567,
        last_batch_size: 0,
        success_rate: 0.87,
      },
    },
  ]);

  const [syncJobs] = useState([
    {
      id: '1',
      connector_name: 'Wikidata Events',
      job_type: 'delta_update',
      status: 'completed',
      records_processed: 47,
      records_created: 12,
      records_updated: 35,
      records_failed: 0,
      started_at: '2024-01-15T10:00:00Z',
      completed_at: '2024-01-15T10:05:30Z',
    },
    {
      id: '2',
      connector_name: 'OpenStreetMap Venues',
      job_type: 'delta_update',
      status: 'completed',
      records_processed: 23,
      records_created: 8,
      records_updated: 15,
      records_failed: 0,
      started_at: '2024-01-15T14:30:00Z',
      completed_at: '2024-01-15T14:33:12Z',
    },
    {
      id: '3',
      connector_name: 'Eventbrite Integration',
      job_type: 'initial_import',
      status: 'failed',
      records_processed: 0,
      records_created: 0,
      records_updated: 0,
      records_failed: 0,
      started_at: '2024-01-10T09:00:00Z',
      completed_at: '2024-01-10T09:00:15Z',
      error_details: {
        message: 'Invalid API key or insufficient permissions',
        code: 'AUTH_ERROR',
      },
    },
  ]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'running': return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      case 'running': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Data Connectors</h2>
          <p className="text-muted-foreground">Manage external data sources and sync jobs</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Connector
        </Button>
      </div>

      <Tabs defaultValue="connectors" className="space-y-6">
        <TabsList>
          <TabsTrigger value="connectors">Connectors</TabsTrigger>
          <TabsTrigger value="jobs">Sync Jobs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="connectors" className="space-y-6">
          {/* Connectors Grid */}
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
                      <CardDescription>{connector.description}</CardDescription>
                    </div>
                    <Switch checked={connector.is_active} className="ml-4" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{connector.stats.total_imported.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Total Imported</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{connector.stats.last_batch_size}</div>
                      <div className="text-xs text-muted-foreground">Last Batch</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{Math.round(connector.stats.success_rate * 100)}%</div>
                      <div className="text-xs text-muted-foreground">Success Rate</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Success Rate</span>
                      <span>{Math.round(connector.stats.success_rate * 100)}%</span>
                    </div>
                    <Progress value={connector.stats.success_rate * 100} className="h-2" />
                  </div>

                  {/* Sync Info */}
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Sync:</span>
                      <span>{new Date(connector.last_sync_at).toLocaleString()}</span>
                    </div>
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
                    <Button size="sm" variant="outline" className="flex-1">
                      <Play className="h-3 w-3 mr-1" />
                      Run Now
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1">
                      <Settings className="h-3 w-3 mr-1" />
                      Configure
                    </Button>
                    <Button size="sm" variant="outline">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="jobs" className="space-y-6">
          {/* Recent Sync Jobs */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Sync Jobs</CardTitle>
              <CardDescription>Latest synchronization attempts and their results</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {syncJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      {getStatusIcon(job.status)}
                      <div>
                        <div className="font-medium">{job.connector_name}</div>
                        <div className="text-sm text-muted-foreground capitalize">
                          {job.job_type.replace('_', ' ')} • {new Date(job.started_at).toLocaleString()}
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
                            {job.records_processed} processed
                          </div>
                          <div className="text-muted-foreground">
                            {job.records_created} created, {job.records_updated} updated
                          </div>
                        </div>
                      )}
                      
                      {job.completed_at && (
                        <div className="text-xs text-muted-foreground">
                          {formatDuration(job.started_at, job.completed_at)}
                        </div>
                      )}
                      
                      {job.error_details && (
                        <div className="text-sm text-red-600 max-w-xs truncate">
                          {job.error_details.message}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Connector Settings</CardTitle>
              <CardDescription>Global configuration for data connectors</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Connector settings panel coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
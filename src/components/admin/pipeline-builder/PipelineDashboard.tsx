import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Activity, AlertTriangle, CheckCircle, Clock, Database,
  Play, RefreshCw, Shield, XCircle, Zap,
} from 'lucide-react';
import { usePipelineRuns, useCircuitBreakers, useStagingStats, usePipelineDefinitionsList } from './hooks/usePipelineHistory';
import { useNavigate } from 'react-router';

const statusColors: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-yellow-100 text-yellow-700',
  paused: 'bg-purple-100 text-purple-700',
};

const cbStateColors: Record<string, string> = {
  closed: 'bg-green-100 text-green-700',
  open: 'bg-red-100 text-red-700',
  half_open: 'bg-yellow-100 text-yellow-700',
};

const dispositionColors: Record<string, string> = {
  pending: 'bg-gray-500',
  committed: 'bg-green-500',
  rejected: 'bg-red-500',
  skipped: 'bg-yellow-500',
};

export default function PipelineDashboard() {
  const { data: runs, isLoading: runsLoading } = usePipelineRuns(50);
  const { data: circuitBreakers } = useCircuitBreakers();
  const { data: stagingStats } = useStagingStats();
  const { data: definitions } = usePipelineDefinitionsList();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const navigate = useNavigate();

  const selectedRun = runs?.find(r => r.id === selectedRunId);

  const totalStaging = stagingStats?.reduce((sum, s) => sum + s.count, 0) || 0;
  const openCircuits = circuitBreakers?.filter(cb => cb.state === 'open').length || 0;
  const runningPipelines = runs?.filter(r => r.status === 'running').length || 0;
  const recentCompleted = runs?.filter(r => r.status === 'completed').length || 0;
  const recentFailed = runs?.filter(r => r.status === 'failed').length || 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{runningPipelines}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Running</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{recentCompleted}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-2xl font-bold">{recentFailed}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-indigo-500" />
              <span className="text-2xl font-bold">{totalStaging}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Staging Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              {openCircuits > 0 ? <AlertTriangle className="h-4 w-4 text-red-500" /> : <Shield className="h-4 w-4 text-green-500" />}
              <span className="text-2xl font-bold">{openCircuits}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Open Circuits</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Pipeline Runs</TabsTrigger>
          <TabsTrigger value="circuits">Circuit Breakers</TabsTrigger>
          <TabsTrigger value="staging">Staging</TabsTrigger>
          <TabsTrigger value="definitions">Definitions</TabsTrigger>
        </TabsList>

        {/* Pipeline Runs Tab */}
        <TabsContent value="runs">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Recent Runs</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pipeline</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Started</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runsLoading ? (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
                      ) : !runs || runs.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No pipeline runs yet</TableCell></TableRow>
                      ) : runs.map(run => (
                        <TableRow
                          key={run.id}
                          className={`cursor-pointer hover:bg-accent ${selectedRunId === run.id ? 'bg-accent' : ''}`}
                          onClick={() => setSelectedRunId(run.id)}
                        >
                          <TableCell className="font-medium text-sm">{run.pipeline_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${statusColors[run.status] || ''}`}>
                              {run.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {run.items_succeeded}/{run.items_processed}
                            {run.items_failed > 0 && <span className="text-red-500 ml-1">({run.items_failed} failed)</span>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : run.status === 'running' ? '...' : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {run.started_at ? new Date(run.started_at).toLocaleTimeString() : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Run Detail Panel */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {selectedRun ? 'Node States' : 'Select a run'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedRun ? (
                  <ScrollArea className="h-[460px]">
                    <div className="space-y-2">
                      {Object.entries(selectedRun.node_states || {}).map(([nodeId, state]) => (
                        <div key={nodeId} className="border rounded-md p-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono truncate">{nodeId}</span>
                            <Badge variant="outline" className={`text-[10px] ${statusColors[state.status] || ''}`}>
                              {state.status}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                            {state.items_out > 0 && <div>Items out: {state.items_out}</div>}
                            {state.duration_ms && <div>Duration: {(state.duration_ms / 1000).toFixed(1)}s</div>}
                            {state.error && <div className="text-red-500 truncate">{state.error}</div>}
                          </div>
                        </div>
                      ))}
                      {selectedRun.error_message && (
                        <div className="border border-red-200 rounded-md p-2 bg-red-50">
                          <p className="text-xs text-red-700">{selectedRun.error_message}</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground">Click a run to view per-node details</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Circuit Breakers Tab */}
        <TabsContent value="circuits">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" /> API Circuit Breakers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {circuitBreakers?.map(cb => (
                  <div key={cb.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{cb.api_name}</span>
                      <Badge variant="outline" className={`text-xs ${cbStateColors[cb.state]}`}>
                        {cb.state === 'half_open' ? 'HALF OPEN' : cb.state.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div>Failures: <span className={cb.failure_count > 0 ? 'text-red-600 font-medium' : ''}>{cb.failure_count}/{cb.threshold}</span></div>
                      <div>Successes: {cb.success_count}</div>
                      {cb.last_failure_at && <div className="col-span-2">Last fail: {new Date(cb.last_failure_at).toLocaleString()}</div>}
                      {cb.state === 'open' && cb.open_until && (
                        <div className="col-span-2 text-red-500">
                          Opens at: {new Date(cb.open_until).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Staging Tab */}
        <TabsContent value="staging">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4" /> Ingestion Staging
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stagingStats && stagingStats.length > 0 ? (
                  <>
                    <div className="flex gap-1 h-6 rounded-full overflow-hidden">
                      {stagingStats.map(s => (
                        <div
                          key={s.status}
                          className={`${dispositionColors[s.status] || 'bg-gray-400'} transition-all`}
                          style={{ width: `${(s.count / totalStaging) * 100}%` }}
                          title={`${s.status}: ${s.count}`}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {stagingStats.map(s => (
                        <div key={s.status} className="border rounded-md p-3 text-center">
                          <div className="text-xl font-bold">{s.count.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground capitalize">{s.status}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No staging items</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Definitions Tab */}
        <TabsContent value="definitions">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Pipeline Definitions</CardTitle>
              <Button size="sm" onClick={() => navigate('/admin/pipelines')}>
                <Zap className="h-3.5 w-3.5 mr-1.5" /> Open Builder
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {definitions?.map((def: Record<string, unknown>) => (
                    <TableRow key={def.id as string} className="cursor-pointer hover:bg-accent" onClick={() => navigate(`/admin/pipelines`)}>
                      <TableCell className="font-medium">{(def.display_name || def.name) as string}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(def.schedule as string) || 'Manual'}</TableCell>
                      <TableCell>{def.is_template ? <Badge variant="outline" className="text-xs">Template</Badge> : null}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${def.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {def.is_enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

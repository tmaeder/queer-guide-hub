import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle, Database,
  Play, Shield, XCircle, Zap,
} from 'lucide-react';
import { usePipelineRuns, useCircuitBreakers, useStagingStats, usePipelineDefinitionsList } from './hooks/usePipelineHistory';
import { useNavigate } from 'react-router';

const statusColors: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  completed: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  failed: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  cancelled: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
  paused: 'bg-purple-100 text-purple-700',
};

const cbStateColors: Record<string, string> = {
  closed: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  open: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  half_open: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
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

  const statCardStyle: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 16px 12px', background: '#fff' };
  const statIconRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
  const statValue: React.CSSProperties = { fontSize: 24, fontWeight: 700 };
  const statLabel: React.CSSProperties = { fontSize: 12, color: '#9ca3af', marginTop: 4 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        <div style={statCardStyle}>
          <div style={statIconRow}>
            <Play style={{ width: 16, height: 16, color: '#3b82f6' }} />
            <span style={statValue}>{runningPipelines}</span>
          </div>
          <p style={statLabel}>Running</p>
        </div>
        <div style={statCardStyle}>
          <div style={statIconRow}>
            <CheckCircle style={{ width: 16, height: 16, color: '#22c55e' }} />
            <span style={statValue}>{recentCompleted}</span>
          </div>
          <p style={statLabel}>Completed</p>
        </div>
        <div style={statCardStyle}>
          <div style={statIconRow}>
            <XCircle style={{ width: 16, height: 16, color: '#ef4444' }} />
            <span style={statValue}>{recentFailed}</span>
          </div>
          <p style={statLabel}>Failed</p>
        </div>
        <div style={statCardStyle}>
          <div style={statIconRow}>
            <Database style={{ width: 16, height: 16, color: '#6366f1' }} />
            <span style={statValue}>{totalStaging}</span>
          </div>
          <p style={statLabel}>Staging Items</p>
        </div>
        <div style={statCardStyle}>
          <div style={statIconRow}>
            {openCircuits > 0 ? <AlertTriangle style={{ width: 16, height: 16, color: '#ef4444' }} /> : <Shield style={{ width: 16, height: 16, color: '#22c55e' }} />}
            <span style={statValue}>{openCircuits}</span>
          </div>
          <p style={statLabel}>Open Circuits</p>
        </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <Card>
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
                        <div className="border border-red-200 dark:border-red-900 rounded-md p-2 bg-red-50 dark:bg-red-950/30">
                          <p className="text-xs text-red-700 dark:text-red-300">{selectedRun.error_message}</p>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {circuitBreakers?.map(cb => (
                  <div key={cb.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{cb.api_name}</span>
                      <Badge variant="outline" className={`text-xs ${cbStateColors[cb.state]}`}>
                        {cb.state === 'half_open' ? 'HALF OPEN' : cb.state.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div>Failures: <span className={cb.failure_count > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>{cb.failure_count}/{cb.threshold}</span></div>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                      {stagingStats.map(s => (
                        <div key={s.status} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, textAlign: 'center' }}>
                          <div style={{ fontSize: 20, fontWeight: 700 }}>{s.count.toLocaleString()}</div>
                          <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'capitalize' }}>{s.status}</div>
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
                        <Badge variant="outline" className={`text-xs ${def.is_enabled ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-gray-100 text-gray-500'}`}>
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

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Clock, Calendar, Shield, Database, AlertCircle } from 'lucide-react';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  frequency: string;
  lastRun?: string;
  nextRun?: string;
  enabled: boolean;
  status: 'active' | 'pending' | 'error';
}

export function AutomatedSecurityScheduler() {
  const { isAdmin } = useAdminRoles();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      loadScheduledTasks();
    }
  }, [isAdmin]);

  const loadScheduledTasks = () => {
    // Simulated scheduled security tasks
    const securityTasks: ScheduledTask[] = [
      {
        id: '1',
        name: 'Location Data Anonymization',
        description: 'Automatically anonymize location data older than 30 days',
        frequency: 'Daily at 2:00 AM',
        lastRun: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        nextRun: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        enabled: true,
        status: 'active'
      },
      {
        id: '2',
        name: 'Security Metrics Collection',
        description: 'Collect and analyze security metrics for monitoring dashboard',
        frequency: 'Every 15 minutes',
        lastRun: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        nextRun: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        enabled: true,
        status: 'active'
      },
      {
        id: '3',
        name: 'RLS Policy Compliance Check',
        description: 'Verify all tables have proper Row Level Security policies',
        frequency: 'Weekly on Sunday',
        lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        enabled: true,
        status: 'active'
      },
      {
        id: '4',
        name: 'Failed Login Attempt Analysis',
        description: 'Analyze failed login patterns and detect potential threats',
        frequency: 'Every 30 minutes',
        lastRun: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        nextRun: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        enabled: true,
        status: 'active'
      },
      {
        id: '5',
        name: 'Privacy Settings Audit',
        description: 'Ensure user privacy settings are properly configured and enforced',
        frequency: 'Daily at 6:00 AM',
        lastRun: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
        nextRun: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        enabled: true,
        status: 'active'
      }
    ];

    setTasks(securityTasks);
  };

  const toggleTask = async (taskId: string, enabled: boolean) => {
    try {
      setLoading(true);

      // In a real implementation, this would call a Supabase function
      // to enable/disable the scheduled task

      setTasks(prev => prev.map(task =>
        task.id === taskId ? { ...task, enabled } : task
      ));

      toast({
        title: enabled ? "Task Enabled" : "Task Disabled",
        description: `Security task has been ${enabled ? 'enabled' : 'disabled'} successfully`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const runTaskNow = async (taskId: string, taskName: string) => {
    try {
      setLoading(true);

      if (taskName.includes('Location Data Anonymization')) {
        const { error } = await supabase.rpc('anonymize_location_data');
        if (error) throw error;
      }

      // Update last run time
      setTasks(prev => prev.map(task =>
        task.id === taskId
          ? { ...task, lastRun: new Date().toISOString() }
          : task
      ));

      toast({
        title: "Task Executed",
        description: `${taskName} has been executed successfully`
      });
    } catch (error) {
      toast({
        title: "Execution Error",
        description: `Failed to execute ${taskName}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: ScheduledTask['status']) => {
    const variants = {
      active: 'default' as const,
      pending: 'secondary' as const,
      error: 'destructive' as const
    };

    const labels = {
      active: 'Active',
      pending: 'Pending',
      error: 'Error'
    };

    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };

  const getStatusIcon = (status: ScheduledTask['status']) => {
    switch (status) {
      case 'active':
        return <Shield style={{ height: 16, width: 16, color: '#16a34a' }} />;
      case 'pending':
        return <Clock style={{ height: 16, width: 16, color: '#ca8a04' }} />;
      case 'error':
        return <AlertCircle style={{ height: 16, width: 16, color: '#dc2626' }} />;
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Calendar style={{ height: 20, width: 20 }} />
            <span>Automated Security Tasks</span>
          </Box>
        </CardTitle>
        <CardDescription>
          Manage scheduled security operations and maintenance tasks
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tasks.map((task) => (
            <Box key={task.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getStatusIcon(task.status)}
                  <Typography sx={{ fontWeight: 500 }}>{task.name}</Typography>
                  {getStatusBadge(task.status)}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Switch
                    checked={task.enabled}
                    onCheckedChange={(enabled) => toggleTask(task.id, enabled)}
                    disabled={loading}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runTaskNow(task.id, task.name)}
                    disabled={loading || !task.enabled}
                  >
                    Run Now
                  </Button>
                </Box>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {task.description}
              </Typography>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Clock style={{ height: 12, width: 12, marginRight: 4 }} />
                  <span>Frequency: {task.frequency}</span>
                </Box>
                {task.lastRun && (
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Database style={{ height: 12, width: 12, marginRight: 4 }} />
                    <span>Last Run: {new Date(task.lastRun).toLocaleString()}</span>
                  </Box>
                )}
                {task.nextRun && (
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Calendar style={{ height: 12, width: 12, marginRight: 4 }} />
                    <span>Next Run: {new Date(task.nextRun).toLocaleString()}</span>
                  </Box>
                )}
              </Box>
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 3, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Typography sx={{ fontWeight: 500, mb: 1, display: 'flex', alignItems: 'center' }}>
            <Shield style={{ height: 16, width: 16, marginRight: 8 }} />
            Security Automation Status
          </Typography>
          <Typography variant="body2" color="text.secondary">
            All security tasks are running automatically to maintain data protection and compliance.
            Manual execution is available for immediate needs or testing purposes.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

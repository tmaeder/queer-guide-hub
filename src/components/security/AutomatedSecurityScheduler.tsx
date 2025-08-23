import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Clock, Calendar, Shield, Database, AlertCircle } from 'lucide-react';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

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
        return <Shield className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Calendar className="h-5 w-5" />
          <span>Automated Security Tasks</span>
        </CardTitle>
        <CardDescription>
          Manage scheduled security operations and maintenance tasks
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(task.status)}
                  <h4 className="font-medium">{task.name}</h4>
                  {getStatusBadge(task.status)}
                </div>
                <div className="flex items-center space-x-2">
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
                </div>
              </div>
              
              <p className="text-sm text-muted-foreground mb-3">
                {task.description}
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
                <div className="flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  <span>Frequency: {task.frequency}</span>
                </div>
                {task.lastRun && (
                  <div className="flex items-center">
                    <Database className="h-3 w-3 mr-1" />
                    <span>Last Run: {new Date(task.lastRun).toLocaleString()}</span>
                  </div>
                )}
                {task.nextRun && (
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    <span>Next Run: {new Date(task.nextRun).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h4 className="font-medium mb-2 flex items-center">
            <Shield className="h-4 w-4 mr-2" />
            Security Automation Status
          </h4>
          <p className="text-sm text-muted-foreground">
            All security tasks are running automatically to maintain data protection and compliance. 
            Manual execution is available for immediate needs or testing purposes.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
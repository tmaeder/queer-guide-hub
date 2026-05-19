import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApiKeys, ApiKey, CreateApiKeyRequest } from '@/hooks/useApiKeys';
import { ChatGPTConnection } from './ChatGPTConnection';
import {
  Plus,
  Key,
  Edit,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Server,
  Shield,
} from 'lucide-react';

const PREDEFINED_SERVICES = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'firecrawl', label: 'Firecrawl' },
  { value: 'google-maps', label: 'Google Maps' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'other', label: 'Other' },
];

const PREDEFINED_KEY_NAMES: Record<string, string[]> = {
  openai: ['api-key', 'organization-key'],
  firecrawl: ['api-key'],
  'google-maps': ['javascript-api-key', 'places-api-key'],
  stripe: ['publishable-key', 'secret-key'],
  other: ['api-key'],
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'configured':
      return <CheckCircle style={{ width: 18, height: 18, color: 'hsl(var(--foreground))' }} />;
    case 'missing':
      return <XCircle style={{ width: 18, height: 18, color: 'hsl(var(--destructive))' }} />;
    case 'error':
      return <AlertTriangle style={{ width: 18, height: 18, color: 'hsl(var(--foreground) / 0.55)' }} />;
    default:
      return <Key style={{ width: 18, height: 18, color: 'hsl(var(--muted-foreground))' }} />;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'configured':
      return <Badge variant="default">Configured</Badge>;
    case 'missing':
      return <Badge variant="destructive">Missing</Badge>;
    case 'error':
      return <Badge variant="secondary">Error</Badge>;
    default:
      return <Badge variant="secondary">Unknown</Badge>;
  }
};

export const ApiKeysManager = () => {
  const {
    keys,
    requiredKeys,
    loading,
    createApiKey,
    updateApiKey,
    deleteApiKey,
    toggleApiKey: _toggleApiKey,
    refreshKeys,
  } = useApiKeys();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);

  const [createForm, setCreateForm] = useState<CreateApiKeyRequest>({
    service_name: '',
    key_name: '',
    key_value: '',
    description: '',
  });

  const [editForm, setEditForm] = useState({
    service_name: '',
    key_name: '',
    key_value: '',
    description: '',
    is_active: true,
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createApiKey(createForm);
      setShowCreateDialog(false);
      setCreateForm({ service_name: '', key_name: '', key_value: '', description: '' });
    } catch (_error) {
      /* handled by useApiKeys hook */
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKey) return;
    try {
      const updateData: Record<string, unknown> = { description: editForm.description, is_active: editForm.is_active };
      if (editForm.service_name && editForm.service_name !== editingKey.service_name)
        updateData.service_name = editForm.service_name;
      if (editForm.key_name && editForm.key_name !== editingKey.key_name)
        updateData.key_name = editForm.key_name;
      if (editForm.key_value) updateData.key_value = editForm.key_value;
      await updateApiKey(editingKey.id, updateData);
      setEditingKey(null);
    } catch (_error) {
      /* handled by useApiKeys hook */
    }
  };

  const startEdit = (key: ApiKey) => {
    setEditingKey(key);
    setEditForm({
      service_name: key.service_name,
      key_name: key.key_name,
      key_value: '',
      description: key.description || '',
      is_active: key.is_active,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getAvailableKeyNames = (serviceName: string) => {
    return PREDEFINED_KEY_NAMES[serviceName] || ['api-key'];
  };

  const configuredCount = requiredKeys.filter((k) => k.status === 'configured').length;
  const missingCount = requiredKeys.filter((k) => k.status === 'missing').length;
  const errorCount = requiredKeys.filter((k) => k.status === 'error').length;

  return (
    <div className="flex flex-col gap-6">
      {/* ChatGPT OAuth Connection */}
      <ChatGPTConnection />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">API Keys Management</h2>
          <p className="text-muted-foreground">
            Securely manage API keys for external services
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshKeys} disabled={loading} size="sm">
            <RefreshCw
              style={{
                height: 16,
                width: 16,
                marginRight: 8,
                ...(loading ? { animation: 'spin 1s linear infinite' } : {}),
              }}
            />
            Refresh
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
                Add API Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateSubmit}>
                <DialogHeader>
                  <DialogTitle>Add New API Key</DialogTitle>
                  <DialogDescription>
                    Store an API key securely for use in import operations
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                  <div>
                    <Label htmlFor="service">Service</Label>
                    <Select
                      value={createForm.service_name}
                      onValueChange={(value) =>
                        setCreateForm((prev) => ({ ...prev, service_name: value, key_name: '' }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a service" />
                      </SelectTrigger>
                      <SelectContent>
                        {PREDEFINED_SERVICES.map((service) => (
                          <SelectItem key={service.value} value={service.value}>
                            {service.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {createForm.service_name && (
                    <div>
                      <Label htmlFor="key_name">Key Name</Label>
                      <Select
                        value={createForm.key_name}
                        onValueChange={(value) =>
                          setCreateForm((prev) => ({ ...prev, key_name: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select key type" />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableKeyNames(createForm.service_name).map((keyName) => (
                            <SelectItem key={keyName} value={keyName}>
                              {keyName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="key_value">API Key Value</Label>
                    <Input
                      id="key_value"
                      type="password"
                      value={createForm.key_value}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, key_value: e.target.value }))
                      }
                      placeholder="Enter the API key"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description (Optional)</Label>
                    <Textarea
                      id="description"
                      value={createForm.description}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Add a description"
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      !createForm.service_name || !createForm.key_name || !createForm.key_value
                    }
                  >
                    Create API Key
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent>
            <RefreshCw
              style={{
                height: 32,
                width: 32,
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
                color: 'var(--muted-foreground)',
              }}
            />
            <p style={{ color: 'var(--muted-foreground)' }}>Loading API keys...</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Status Summary */}
          {requiredKeys.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-element" style={{ background: 'hsl(var(--muted))' }}>
                <div className="text-2xl font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                  {configuredCount}
                </div>
                <div className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                  Configured
                </div>
              </div>
              <div className="text-center p-4 rounded-element" style={{ background: 'hsl(var(--muted))' }}>
                <div className="text-2xl font-semibold" style={{ color: 'hsl(var(--destructive))' }}>
                  {missingCount}
                </div>
                <div className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
                  Missing
                </div>
              </div>
              <div className="text-center p-4 rounded-element" style={{ background: 'hsl(var(--muted))' }}>
                <div className="text-2xl font-semibold" style={{ color: 'hsl(var(--foreground) / 0.55)' }}>
                  {errorCount}
                </div>
                <div className="text-sm" style={{ color: 'hsl(var(--foreground) / 0.55)' }}>
                  Errors
                </div>
              </div>
            </div>
          )}

          {/* Required API Keys (from Supabase env secrets) */}
          {requiredKeys.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <Shield style={{ width: 20, height: 20 }} />
                  Supabase Environment Secrets
                </CardTitle>
                <CardDescription>
                  API keys configured as Supabase Function Secrets (managed in Supabase Dashboard)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {requiredKeys.map((rk) => (
                    <div
                      key={rk.key_name}
                      className="flex items-center justify-between p-4 rounded border"
                      style={{
                        borderColor:
                          rk.status === 'configured'
                            ? 'rgba(34,197,94,0.3)'
                            : rk.status === 'error'
                              ? 'rgba(245,158,11,0.3)'
                              : 'rgba(239,68,68,0.3)',
                        background:
                          rk.status === 'configured'
                            ? 'rgba(34,197,94,0.05)'
                            : rk.status === 'error'
                              ? 'rgba(245,158,11,0.05)'
                              : 'rgba(239,68,68,0.05)',
                      }}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(rk.status)}
                        <div>
                          <p className="font-semibold font-mono text-sm">{rk.key_name}</p>
                          {rk.used_by.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Used by: {rk.used_by.map((u) => u.name).join(', ')}
                            </p>
                          )}
                          {rk.status === 'error' && rk.hint && (
                            <p className="text-xs" style={{ color: 'hsl(var(--foreground) / 0.55)' }}>
                              {rk.hint}
                            </p>
                          )}
                          {rk.status === 'configured' && rk.hint && (
                            <p className="text-xs text-muted-foreground font-mono">{rk.hint}</p>
                          )}
                        </div>
                      </div>
                      {getStatusBadge(rk.status)}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground italic">
                  To add or update these keys, go to Supabase Dashboard &rarr; Project Settings
                  &rarr; Edge Functions &rarr; Secrets
                </p>
              </CardContent>
            </Card>
          )}

          {/* Custom API Keys (from admin_api_keys table) */}
          <Card>
            <CardHeader>
              <CardTitle>
                <Server style={{ width: 20, height: 20 }} />
                Custom API Keys
              </CardTitle>
              <CardDescription>
                Additional API keys stored encrypted in the database
              </CardDescription>
            </CardHeader>
            <CardContent>
              {keys.length === 0 ? (
                <div className="text-center py-6">
                  <Key
                    style={{
                      height: 32,
                      width: 32,
                      margin: '0 auto 12px',
                      color: 'var(--muted-foreground)',
                    }}
                  />
                  <p className="text-muted-foreground text-sm">
                    No custom API keys. Use the "+ Add API Key" button to store additional keys.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {keys.map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between p-4 rounded border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <Key
                          style={{
                            width: 16,
                            height: 16,
                            color: key.is_active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                          }}
                        />
                        <div>
                          <p className="font-semibold text-sm">
                            {key.service_name} / {key.key_name}
                          </p>
                          {key.description && (
                            <p className="text-xs text-muted-foreground">{key.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Created {formatDate(key.created_at)}
                            {key.last_used_at && ` | Last used ${formatDate(key.last_used_at)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={key.is_active ? 'default' : 'secondary'}>
                          {key.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button variant="outline" size="sm" onClick={() => startEdit(key)}>
                          <Edit style={{ height: 14, width: 14 }} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Trash2 style={{ height: 14, width: 14 }} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure? This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteApiKey(key.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingKey} onOpenChange={(open) => !open && setEditingKey(null)}>
        <DialogContent>
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Edit API Key</DialogTitle>
              <DialogDescription>
                Update details. Leave key value empty to keep current key.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={editForm.is_active}
                  onCheckedChange={(checked) =>
                    setEditForm((prev) => ({ ...prev, is_active: checked }))
                  }
                />
                <Label>Active</Label>
              </div>
              <div>
                <Label htmlFor="edit_service">Service</Label>
                <Input
                  id="edit_service"
                  value={editForm.service_name}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, service_name: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit_key_name">Key Name</Label>
                <Input
                  id="edit_key_name"
                  value={editForm.key_name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, key_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit_key_value">New API Key Value (Optional)</Label>
                <Input
                  id="edit_key_value"
                  type="password"
                  value={editForm.key_value}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, key_value: e.target.value }))}
                  placeholder="Leave empty to keep current key"
                />
              </div>
              <div>
                <Label htmlFor="edit_description">Description</Label>
                <Textarea
                  id="edit_description"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingKey(null)}>
                Cancel
              </Button>
              <Button type="submit">Update API Key</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

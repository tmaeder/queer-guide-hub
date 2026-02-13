import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApiKeys, ApiKey, CreateApiKeyRequest } from '@/hooks/useApiKeys';
import { Plus, Key, Edit, Trash2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const PREDEFINED_SERVICES = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'firecrawl', label: 'Firecrawl' },
  { value: 'mapbox', label: 'Mapbox' },
  { value: 'google-maps', label: 'Google Maps' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'other', label: 'Other' }
];

const PREDEFINED_KEY_NAMES = {
  openai: ['api-key', 'organization-key'],
  firecrawl: ['api-key'],
  mapbox: ['access-token', 'secret-token'],
  'google-maps': ['javascript-api-key', 'places-api-key'],
  stripe: ['publishable-key', 'secret-key'],
  other: ['api-key']
};

export const ApiKeysManager = () => {
  const { keys, loading, createApiKey, updateApiKey, deleteApiKey, toggleApiKey, refreshKeys } = useApiKeys();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [showPasswords, setShowPasswords] = useState<Set<string>>(new Set());

  const [createForm, setCreateForm] = useState<CreateApiKeyRequest>({
    service_name: '',
    key_name: '',
    key_value: '',
    description: ''
  });

  const [editForm, setEditForm] = useState({
    service_name: '',
    key_name: '',
    key_value: '',
    description: '',
    is_active: true
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createApiKey(createForm);
      setShowCreateDialog(false);
      setCreateForm({
        service_name: '',
        key_name: '',
        key_value: '',
        description: ''
      });
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKey) return;

    try {
      const updateData: any = {
        description: editForm.description,
        is_active: editForm.is_active
      };

      // Only include fields that have values
      if (editForm.service_name && editForm.service_name !== editingKey.service_name) {
        updateData.service_name = editForm.service_name;
      }
      if (editForm.key_name && editForm.key_name !== editingKey.key_name) {
        updateData.key_name = editForm.key_name;
      }
      if (editForm.key_value) {
        updateData.key_value = editForm.key_value;
      }

      await updateApiKey(editingKey.id, updateData);
      setEditingKey(null);
    } catch (error) {
      // Error handled in hook
    }
  };

  const startEdit = (key: ApiKey) => {
    setEditingKey(key);
    setEditForm({
      service_name: key.service_name,
      key_name: key.key_name,
      key_value: '',
      description: key.description || '',
      is_active: key.is_active
    });
  };

  const togglePasswordVisibility = (keyId: string) => {
    const newSet = new Set(showPasswords);
    if (newSet.has(keyId)) {
      newSet.delete(keyId);
    } else {
      newSet.add(keyId);
    }
    setShowPasswords(newSet);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getAvailableKeyNames = (serviceName: string) => {
    return PREDEFINED_KEY_NAMES[serviceName as keyof typeof PREDEFINED_KEY_NAMES] || ['api-key'];
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Typography variant="h2" sx={{ fontSize: '1.875rem', fontWeight: 700, color: 'text.primary' }}>API Keys Management</Typography>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Securely manage API keys for external services
          </p>
        </div>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outline"
            onClick={refreshKeys}
            disabled={loading}
            size="sm"
          >
            <RefreshCw style={{ height: 16, width: 16, marginRight: 8, ...(loading ? { animation: 'spin 1s linear infinite' } : {}) }} />
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
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 2 }}>
                  <div>
                    <Label htmlFor="service">Service</Label>
                    <Select
                      value={createForm.service_name}
                      onValueChange={(value) => {
                        setCreateForm(prev => ({
                          ...prev,
                          service_name: value,
                          key_name: '' // Reset key name when service changes
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a service" />
                      </SelectTrigger>
                      <SelectContent>
                        {PREDEFINED_SERVICES.map(service => (
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
                        onValueChange={(value) => setCreateForm(prev => ({ ...prev, key_name: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select key type" />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableKeyNames(createForm.service_name).map(keyName => (
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
                      onChange={(e) => setCreateForm(prev => ({ ...prev, key_value: e.target.value }))}
                      placeholder="Enter the API key"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description (Optional)</Label>
                    <Textarea
                      id="description"
                      value={createForm.description}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Add a description for this API key"
                      rows={3}
                    />
                  </div>
                </Box>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!createForm.service_name || !createForm.key_name || !createForm.key_value}>
                    Create API Key
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </Box>
      </Box>

      {/* API Keys List */}
      {loading ? (
        <Card>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <RefreshCw style={{ height: 32, width: 32, animation: 'spin 1s linear infinite', margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
            <p style={{ color: 'var(--muted-foreground)' }}>Loading API keys...</p>
          </CardContent>
        </Card>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent sx={{ p: 6, textAlign: 'center' }}>
            <Key style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
            <Typography variant="h3" sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}>No API Keys</Typography>
            <Typography sx={{ color: 'text.secondary', mb: 2 }}>
              Add your first API key to enable external service integrations
            </Typography>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
              Add API Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {keys.map((key) => (
            <Card key={key.id}>
              <CardHeader sx={{ pb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ p: 1, bgcolor: 'primary.main' }}>
                      <Key style={{ height: 16, width: 16, color: 'var(--primary-foreground)' }} />
                    </Box>
                    <div>
                      <CardTitle sx={{ fontSize: '1.125rem' }}>{key.service_name}</CardTitle>
                      <CardDescription>{key.key_name}</CardDescription>
                    </div>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Badge variant={key.is_active ? "default" : "secondary"}>
                      {key.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(key)}
                      >
                        <Edit style={{ height: 16, width: 16 }} />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 style={{ height: 16, width: 16 }} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this API key? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteApiKey(key.id)}
                              sx={{ bgcolor: 'error.main', color: 'error.contrastText', '&:hover': { bgcolor: 'error.dark' } }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </Box>
                  </Box>
                </Box>
              </CardHeader>
              <CardContent>
                {key.description && (
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1.5 }}>{key.description}</Typography>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: '0.875rem' }}>
                  <div>
                    <Box component="span" sx={{ fontWeight: 500 }}>Created:</Box> {formatDate(key.created_at)}
                  </div>
                  <div>
                    <Box component="span" sx={{ fontWeight: 500 }}>Updated:</Box> {formatDate(key.updated_at)}
                  </div>
                  {key.last_used_at && (
                    <Box sx={{ gridColumn: 'span 2' }}>
                      <Box component="span" sx={{ fontWeight: 500 }}>Last Used:</Box> {formatDate(key.last_used_at)}
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingKey} onOpenChange={(open) => !open && setEditingKey(null)}>
        <DialogContent>
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Edit API Key</DialogTitle>
              <DialogDescription>
                Update the API key details. Leave the key value empty to keep the current key.
              </DialogDescription>
            </DialogHeader>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Switch
                  checked={editForm.is_active}
                  onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_active: checked }))}
                />
                <Label>Active</Label>
              </Box>

              <div>
                <Label htmlFor="edit_service">Service</Label>
                <Input
                  id="edit_service"
                  value={editForm.service_name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, service_name: e.target.value }))}
                  placeholder="Service name"
                />
              </div>

              <div>
                <Label htmlFor="edit_key_name">Key Name</Label>
                <Input
                  id="edit_key_name"
                  value={editForm.key_name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, key_name: e.target.value }))}
                  placeholder="Key name"
                />
              </div>

              <div>
                <Label htmlFor="edit_key_value">New API Key Value (Optional)</Label>
                <Input
                  id="edit_key_value"
                  type="password"
                  value={editForm.key_value}
                  onChange={(e) => setEditForm(prev => ({ ...prev, key_value: e.target.value }))}
                  placeholder="Leave empty to keep current key"
                />
              </div>

              <div>
                <Label htmlFor="edit_description">Description</Label>
                <Textarea
                  id="edit_description"
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Add a description for this API key"
                  rows={3}
                />
              </div>
            </Box>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingKey(null)}>
                Cancel
              </Button>
              <Button type="submit">
                Update API Key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

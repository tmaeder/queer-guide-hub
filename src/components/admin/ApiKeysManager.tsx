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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">API Keys Management</h2>
          <p className="text-muted-foreground">
            Securely manage API keys for external services
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={refreshKeys}
            disabled={loading}
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
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
                <div className="space-y-4 py-4">
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
                </div>
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
        </div>
      </div>

      {/* API Keys List */}
      {loading ? (
        <Card>
          <CardContent className="p-8 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading API keys...</p>
          </CardContent>
        </Card>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Key className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No API Keys</h3>
            <p className="text-muted-foreground mb-4">
              Add your first API key to enable external service integrations
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add API Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {keys.map((key) => (
            <Card key={key.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary">
                      <Key className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{key.service_name}</CardTitle>
                      <CardDescription>{key.key_name}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={key.is_active ? "default" : "secondary"}>
                      {key.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(key)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="h-4 w-4" />
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
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {key.description && (
                  <p className="text-sm text-muted-foreground mb-3">{key.description}</p>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Created:</span> {formatDate(key.created_at)}
                  </div>
                  <div>
                    <span className="font-medium">Updated:</span> {formatDate(key.updated_at)}
                  </div>
                  {key.last_used_at && (
                    <div className="col-span-2">
                      <span className="font-medium">Last Used:</span> {formatDate(key.last_used_at)}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
            <div className="space-y-4 py-4">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={editForm.is_active}
                  onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_active: checked }))}
                />
                <Label>Active</Label>
              </div>

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
            </div>
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
    </div>
  );
};
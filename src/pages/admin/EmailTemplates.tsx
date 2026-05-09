import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Edit, Save, X, Mail, Loader2, FileText, TestTube } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchEmailTemplates, upsertEmailTemplate } from '@/hooks/usePageFetchers';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ContentSanitizer } from '@/components/security/ContentSanitizer';

interface EmailTemplate {
  id: string;
  template_key: string;
  name: string;
  description?: string;
  subject: string;
  html_content: string;
  text_content?: string;
  variables: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function EmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, string>>({});
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await fetchEmailTemplates();
      if (error) throw error;
      const processedTemplates = (data || []).map((template: Record<string, unknown>) => ({
        ...template,
        variables: Array.isArray(template.variables) ? template.variables : [],
      }));
      setTemplates(processedTemplates);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Error: Failed to load email templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;

    setIsSaving(true);
    try {
      const { error } = await upsertEmailTemplate(
        {
          name: editingTemplate.name,
          description: editingTemplate.description,
          subject: editingTemplate.subject,
          html_content: editingTemplate.html_content,
          text_content: editingTemplate.text_content,
          variables: editingTemplate.variables,
          is_active: editingTemplate.is_active,
          updated_by: user?.id,
        },
        editingTemplate.id,
      );

      if (error) throw error;

      toast.success('Success: Email template saved successfully');

      await fetchTemplates();
      setEditingTemplate(null);
      setSelectedTemplate(editingTemplate);
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Error: Failed to save email template');
    } finally {
      setIsSaving(false);
    }
  };

  const generatePreview = (template: EmailTemplate, data: Record<string, string>) => {
    let htmlContent = template.html_content;
    let textContent = template.text_content || '';
    let subject = template.subject;

    // Replace variables with sample data
    template.variables.forEach(variable => {
      const value = data[variable.name] || `{{${variable.name}}}`;
      const regex = new RegExp(`{{${variable.name}}}`, 'g');
      htmlContent = htmlContent.replace(regex, value);
      textContent = textContent.replace(regex, value);
      subject = subject.replace(regex, value);
    });

    return { htmlContent, textContent, subject };
  };

  const handleSendTestEmail = async () => {
    if (!selectedTemplate || !testEmail) return;

    setIsSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke('send-templated-email', {
        body: {
          template_key: selectedTemplate.template_key,
          to_email: testEmail,
          variables: previewData,
          is_test: true,
        }
      });

      if (error) throw error;

      toast({
        title: "Test Email Sent",
        description: `Test email sent to ${testEmail}`,
      });
      setShowTestDialog(false);
      setTestEmail('');
    } catch (error) {
      console.error('Error sending test email:', error);
      toast.error('Error: Failed to send test email');
    } finally {
      setIsSendingTest(false);
    }
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-2xl font-bold">Email Templates</h4>
          <p className="text-muted-foreground">Manage automated email templates sent by the system</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Templates List */}
        <div className="lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <Mail style={{ height: 20, width: 20 }} />
                  Templates
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="cursor-pointer transition-colors"
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderStyle: 'solid',
                      borderColor: selectedTemplate?.id === template.id ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      backgroundColor: selectedTemplate?.id === template.id ? 'hsl(var(--accent))' : undefined,
                    }}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setEditingTemplate(null);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{template.name}</p>
                        <p className="text-sm text-muted-foreground">{template.template_key}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={template.is_active ? 'default' : 'secondary'}>
                          {template.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Template Details/Editor */}
        <div className="lg:col-span-8">
          {!selectedTemplate ? (
            <Card>
              <CardContent style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24rem' }}>
                <div className="text-center">
                  <Mail style={{ height: 48, width: 48, color: 'var(--muted-foreground)', margin: '0 auto 16px auto', display: 'block' }} />
                  <p className="text-base font-medium">No Template Selected</p>
                  <p className="text-muted-foreground">Select a template from the list to view or edit</p>
                </div>
              </CardContent>
            </Card>
          ) : editingTemplate ? (
            /* Edit Mode */
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      <div className="flex items-center gap-2">
                        <Edit style={{ height: 20, width: 20 }} />
                        Editing: {editingTemplate.name}
                      </div>
                    </CardTitle>
                    <CardDescription>
                      Make changes to the email template
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingTemplate(null);
                      }}
                    >
                      <X style={{ height: 16, width: 16, marginRight: 8 }} />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveTemplate}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 style={{ height: 16, width: 16, marginRight: 8 }} className="animate-spin" />
                      ) : (
                        <Save style={{ height: 16, width: 16, marginRight: 8 }} />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="name">Template Name</Label>
                      <Input
                        id="name"
                        value={editingTemplate.name}
                        onChange={(e) =>
                          setEditingTemplate({
                            ...editingTemplate,
                            name: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="active">Status</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="active"
                          checked={editingTemplate.is_active}
                          onCheckedChange={(checked) =>
                            setEditingTemplate({
                              ...editingTemplate,
                              is_active: checked,
                            })
                          }
                        />
                        <Label htmlFor="active">
                          {editingTemplate.is_active ? 'Active' : 'Inactive'}
                        </Label>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={editingTemplate.description || ''}
                      onChange={(e) =>
                        setEditingTemplate({
                          ...editingTemplate,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="subject">Subject Line</Label>
                    <Input
                      id="subject"
                      value={editingTemplate.subject}
                      onChange={(e) =>
                        setEditingTemplate({
                          ...editingTemplate,
                          subject: e.target.value,
                        })
                      }
                    />
                  </div>

                  <Tabs defaultValue="html" style={{ width: '100%' }}>
                    <TabsList>
                      <TabsTrigger value="html">HTML Content</TabsTrigger>
                      <TabsTrigger value="text">Text Content</TabsTrigger>
                      <TabsTrigger value="variables">Variables</TabsTrigger>
                    </TabsList>

                    <TabsContent value="html">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="html-content">HTML Content</Label>
                        <Textarea
                          id="html-content"
                          value={editingTemplate.html_content}
                          onChange={(e) =>
                            setEditingTemplate({
                              ...editingTemplate,
                              html_content: e.target.value,
                            })
                          }
                          style={{ minHeight: 300, fontFamily: 'monospace', fontSize: '0.875rem' }}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="text">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="text-content">Text Content (Optional)</Label>
                        <Textarea
                          id="text-content"
                          value={editingTemplate.text_content || ''}
                          onChange={(e) =>
                            setEditingTemplate({
                              ...editingTemplate,
                              text_content: e.target.value,
                            })
                          }
                          style={{ minHeight: 300, fontFamily: 'monospace', fontSize: '0.875rem' }}
                          placeholder="Plain text version of the email..."
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="variables">
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="text-base font-medium mb-2">Available Variables</p>
                          <p className="text-sm text-muted-foreground mb-4">
                            Use these variables in your email content by wrapping them in double curly braces: {`{{variable_name}}`}
                          </p>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Variable</TableHead>
                              <TableHead>Description</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {editingTemplate.variables.map((variable, index) => (
                              <TableRow key={index}>
                                <TableCell style={{ fontFamily: 'monospace' }}>
                                  {`{{${variable.name}}}`}
                                </TableCell>
                                <TableCell>{variable.description}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* View Mode */
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      <div className="flex items-center gap-2">
                        <FileText style={{ height: 20, width: 20 }} />
                        {selectedTemplate.name}
                        <Badge variant={selectedTemplate.is_active ? 'default' : 'secondary'}>
                          {selectedTemplate.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </CardTitle>
                    <CardDescription>
                      Template Key: <code style={{ fontSize: '0.75rem' }}>{selectedTemplate.template_key}</code>
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <TestTube style={{ height: 16, width: 16, marginRight: 8 }} />
                          Test Email
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Send Test Email</DialogTitle>
                          <DialogDescription>
                            Send a test email using this template to verify it works correctly.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="test-email">Recipient Email</Label>
                            <Input
                              id="test-email"
                              type="email"
                              value={testEmail}
                              onChange={(e) => setTestEmail(e.target.value)}
                              placeholder="test@example.com"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowTestDialog(false)}>
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSendTestEmail}
                              disabled={!testEmail || isSendingTest}
                            >
                              {isSendingTest ? (
                                <Loader2 style={{ height: 16, width: 16, marginRight: 8 }} className="animate-spin" />
                              ) : (
                                <Mail style={{ height: 16, width: 16, marginRight: 8 }} />
                              )}
                              Send Test
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreview(!showPreview)}
                    >
                      <Eye style={{ height: 16, width: 16, marginRight: 8 }} />
                      {showPreview ? 'Hide Preview' : 'Preview'}
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => setEditingTemplate(selectedTemplate)}
                    >
                      <Edit style={{ height: 16, width: 16, marginRight: 8 }} />
                      Edit
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-6">
                  {selectedTemplate.description && (
                    <Alert>
                      <AlertDescription>{selectedTemplate.description}</AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Created</Label>
                      <p className="text-sm">{formatDate(selectedTemplate.created_at)}</p>
                    </div>
                    <div>
                      <Label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Last Updated</Label>
                      <p className="text-sm">{formatDate(selectedTemplate.updated_at)}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Subject Line</Label>
                    <div className="rounded-md bg-muted" style={{ padding: 12 }}>
                      <code style={{ fontSize: '0.875rem' }}>{selectedTemplate.subject}</code>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Available Variables</Label>
                    <div className="flex flex-col gap-2">
                      {selectedTemplate.variables.map((variable, index) => (
                        <div key={index} className="rounded bg-muted" style={{ padding: 8 }}>
                          <span className="text-sm">
                            <code style={{ fontFamily: 'monospace' }}>{`{{${variable.name}}}`}</code>
                            <span className="text-muted-foreground ml-2">- {variable.description}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {showPreview && (
                    <div className="border-t border-border pt-6">
                      <p className="text-base font-medium mb-4">Email Preview</p>

                      {/* Variable inputs for preview */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {selectedTemplate.variables.map((variable) => (
                          <div key={variable.name} className="flex flex-col gap-1">
                            <Label htmlFor={`preview-${variable.name}`} style={{ fontSize: '0.75rem' }}>
                              {variable.name}
                            </Label>
                            <Input
                              id={`preview-${variable.name}`}
                              value={previewData[variable.name] || ''}
                              onChange={(e) =>
                                setPreviewData({
                                  ...previewData,
                                  [variable.name]: e.target.value,
                                })
                              }
                              placeholder={variable.description}
                            />
                          </div>
                        ))}
                      </div>

                      <Tabs defaultValue="html-preview" style={{ width: '100%' }}>
                        <TabsList>
                          <TabsTrigger value="html-preview">HTML Preview</TabsTrigger>
                          <TabsTrigger value="html-code">HTML Code</TabsTrigger>
                          {selectedTemplate.text_content && (
                            <TabsTrigger value="text-preview">Text Version</TabsTrigger>
                          )}
                        </TabsList>

                        <TabsContent value="html-preview">
                          <div className="border border-border rounded-md p-4 bg-background">
                            <div className="border-b border-border pb-2 mb-4">
                              <strong>Subject:</strong> {generatePreview(selectedTemplate, previewData).subject}
                            </div>
                            <ContentSanitizer
                              style={{ maxWidth: 'none' }}
                              className="prose"
                              content={generatePreview(selectedTemplate, previewData).htmlContent}
                              allowedTags={[
                                'p','br','strong','em','u','a','ul','ol','li','blockquote','code','pre','h1','h2','h3','h4','h5','h6','img','table','thead','tbody','tr','th','td'
                              ]}
                            />
                          </div>
                        </TabsContent>

                        <TabsContent value="html-code">
                          <div className="rounded-md bg-muted p-4">
                            <pre style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                              {generatePreview(selectedTemplate, previewData).htmlContent}
                            </pre>
                          </div>
                        </TabsContent>

                        {selectedTemplate.text_content && (
                          <TabsContent value="text-preview">
                            <div className="rounded-md bg-muted p-4">
                              <div className="border-b border-border pb-2 mb-4">
                                <strong>Subject:</strong> {generatePreview(selectedTemplate, previewData).subject}
                              </div>
                              <pre style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                                {generatePreview(selectedTemplate, previewData).textContent}
                              </pre>
                            </div>
                          </TabsContent>
                        )}
                      </Tabs>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

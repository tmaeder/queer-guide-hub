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
import { useToast } from '@/hooks/use-toast';
import { ContentSanitizer } from '@/components/security/ContentSanitizer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';

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
  const { toast } = useToast();

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
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
      toast({
        title: "Error",
        description: "Failed to load email templates",
        variant: "destructive",
      });
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

      toast({
        title: "Success",
        description: "Email template saved successfully",
      });

      await fetchTemplates();
      setEditingTemplate(null);
      setSelectedTemplate(editingTemplate);
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: "Error",
        description: "Failed to save email template",
        variant: "destructive",
      });
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
      toast({
        title: "Error",
        description: "Failed to send test email",
        variant: "destructive",
      });
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Loader2 style={{ height: 32, width: 32, animation: 'spin 1s linear infinite' }} />
      </Box>
    );
  }

  return (
    <Container sx={{ py: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4">Email Templates</Typography>
          <Typography color="text.secondary">Manage automated email templates sent by the system</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '4fr 8fr' }, gap: 3 }}>
        {/* Templates List */}
        <Box>
          <Card>
            <CardHeader>
              <CardTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Mail style={{ height: 20, width: 20 }} />
                  Templates
                </Box>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {templates.map((template) => (
                  <Box
                    key={template.id}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      border: 1,
                      borderColor: selectedTemplate?.id === template.id ? 'primary.main' : 'divider',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      ...(selectedTemplate?.id === template.id
                        ? { bgcolor: 'action.selected' }
                        : { '&:hover': { bgcolor: 'action.hover' } }
                      ),
                    }}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setEditingTemplate(null);
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontWeight: 500 }}>{template.name}</Typography>
                        <Typography variant="body2" color="text.secondary">{template.template_key}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Badge variant={template.is_active ? 'default' : 'secondary'}>
                          {template.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Template Details/Editor */}
        <Box>
          {!selectedTemplate ? (
            <Card>
              <CardContent style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24rem' }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Mail style={{ height: 48, width: 48, color: 'var(--muted-foreground)', margin: '0 auto 16px auto', display: 'block' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>No Template Selected</Typography>
                  <Typography color="text.secondary">Select a template from the list to view or edit</Typography>
                </Box>
              </CardContent>
            </Card>
          ) : editingTemplate ? (
            /* Edit Mode */
            <Card>
              <CardHeader>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <CardTitle>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Edit style={{ height: 20, width: 20 }} />
                        Editing: {editingTemplate.name}
                      </Box>
                    </CardTitle>
                    <CardDescription>
                      Make changes to the email template
                    </CardDescription>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
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
                        <Loader2 style={{ height: 16, width: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Save style={{ height: 16, width: 16, marginRight: 8 }} />
                      )}
                      Save
                    </Button>
                  </Box>
                </Box>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Label htmlFor="active">Status</Label>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                      </Box>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  </Box>

                  <Tabs defaultValue="html" style={{ width: '100%' }}>
                    <TabsList>
                      <TabsTrigger value="html">HTML Content</TabsTrigger>
                      <TabsTrigger value="text">Text Content</TabsTrigger>
                      <TabsTrigger value="variables">Variables</TabsTrigger>
                    </TabsList>

                    <TabsContent value="html">
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                      </Box>
                    </TabsContent>

                    <TabsContent value="text">
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                      </Box>
                    </TabsContent>

                    <TabsContent value="variables">
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>Available Variables</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Use these variables in your email content by wrapping them in double curly braces: {`{{variable_name}}`}
                          </Typography>
                        </Box>
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
                      </Box>
                    </TabsContent>
                  </Tabs>
                </Box>
              </CardContent>
            </Card>
          ) : (
            /* View Mode */
            <Card>
              <CardHeader>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <CardTitle>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FileText style={{ height: 20, width: 20 }} />
                        {selectedTemplate.name}
                        <Badge variant={selectedTemplate.is_active ? 'default' : 'secondary'}>
                          {selectedTemplate.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </Box>
                    </CardTitle>
                    <CardDescription>
                      Template Key: <code style={{ fontSize: '0.75rem' }}>{selectedTemplate.template_key}</code>
                    </CardDescription>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
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
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Label htmlFor="test-email">Recipient Email</Label>
                            <Input
                              id="test-email"
                              type="email"
                              value={testEmail}
                              onChange={(e) => setTestEmail(e.target.value)}
                              placeholder="test@example.com"
                            />
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                            <Button variant="outline" onClick={() => setShowTestDialog(false)}>
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSendTestEmail}
                              disabled={!testEmail || isSendingTest}
                            >
                              {isSendingTest ? (
                                <Loader2 style={{ height: 16, width: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />
                              ) : (
                                <Mail style={{ height: 16, width: 16, marginRight: 8 }} />
                              )}
                              Send Test
                            </Button>
                          </Box>
                        </Box>
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
                  </Box>
                </Box>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {selectedTemplate.description && (
                    <Alert>
                      <AlertDescription>{selectedTemplate.description}</AlertDescription>
                    </Alert>
                  )}

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <Box>
                      <Label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Created</Label>
                      <Typography variant="body2">{formatDate(selectedTemplate.created_at)}</Typography>
                    </Box>
                    <Box>
                      <Label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Last Updated</Label>
                      <Typography variant="body2">{formatDate(selectedTemplate.updated_at)}</Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Subject Line</Label>
                    <Box sx={{ p: 1.5, bgcolor: 'grey.100', borderRadius: 2 }}>
                      <code style={{ fontSize: '0.875rem' }}>{selectedTemplate.subject}</code>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Available Variables</Label>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {selectedTemplate.variables.map((variable, index) => (
                        <Box key={index} sx={{ p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                          <Typography variant="body2" component="span">
                            <code style={{ fontFamily: 'monospace' }}>{`{{${variable.name}}}`}</code>
                            <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>- {variable.description}</Typography>
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>

                  {showPreview && (
                    <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 3 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 2 }}>Email Preview</Typography>

                      {/* Variable inputs for preview */}
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                        {selectedTemplate.variables.map((variable) => (
                          <Box key={variable.name} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
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
                          </Box>
                        ))}
                      </Box>

                      <Tabs defaultValue="html-preview" style={{ width: '100%' }}>
                        <TabsList>
                          <TabsTrigger value="html-preview">HTML Preview</TabsTrigger>
                          <TabsTrigger value="html-code">HTML Code</TabsTrigger>
                          {selectedTemplate.text_content && (
                            <TabsTrigger value="text-preview">Text Version</TabsTrigger>
                          )}
                        </TabsList>

                        <TabsContent value="html-preview">
                          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, bgcolor: 'background.default' }}>
                            <Box sx={{ borderBottom: 1, borderColor: 'divider', pb: 1, mb: 2 }}>
                              <strong>Subject:</strong> {generatePreview(selectedTemplate, previewData).subject}
                            </Box>
                            <ContentSanitizer
                              style={{ maxWidth: 'none' }}
                              className="prose"
                              content={generatePreview(selectedTemplate, previewData).htmlContent}
                              allowedTags={[
                                'p','br','strong','em','u','a','ul','ol','li','blockquote','code','pre','h1','h2','h3','h4','h5','h6','img','table','thead','tbody','tr','th','td'
                              ]}
                            />
                          </Box>
                        </TabsContent>

                        <TabsContent value="html-code">
                          <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
                            <pre style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                              {generatePreview(selectedTemplate, previewData).htmlContent}
                            </pre>
                          </Box>
                        </TabsContent>

                        {selectedTemplate.text_content && (
                          <TabsContent value="text-preview">
                            <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
                              <Box sx={{ borderBottom: 1, borderColor: 'divider', pb: 1, mb: 2 }}>
                                <strong>Subject:</strong> {generatePreview(selectedTemplate, previewData).subject}
                              </Box>
                              <pre style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                                {generatePreview(selectedTemplate, previewData).textContent}
                              </pre>
                            </Box>
                          </TabsContent>
                        )}
                      </Tabs>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      </Box>
    </Container>
  );
}

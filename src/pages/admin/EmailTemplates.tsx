import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Edit, Save, X, Plus, Mail, Code, Loader2, FileText, TestTube } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface EmailTemplate {
  id: string;
  template_key: string;
  name: string;
  description?: string;
  subject: string;
  html_content: string;
  text_content?: string;
  variables: any; // Using any to handle Json type from Supabase
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
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('name');

      if (error) throw error;
      
      // Ensure variables is always an array
      const processedTemplates = (data || []).map(template => ({
        ...template,
        variables: Array.isArray(template.variables) ? template.variables : []
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
      const { error } = await supabase
        .from('email_templates')
        .update({
          name: editingTemplate.name,
          description: editingTemplate.description,
          subject: editingTemplate.subject,
          html_content: editingTemplate.html_content,
          text_content: editingTemplate.text_content,
          variables: editingTemplate.variables,
          is_active: editingTemplate.is_active,
          updated_by: user?.id,
        })
        .eq('id', editingTemplate.id);

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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Email Templates</h1>
          <p className="text-muted-foreground">Manage automated email templates sent by the system</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Templates List */}
        <div className="lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Templates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTemplate?.id === template.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setEditingTemplate(null);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium">{template.name}</h3>
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
              <CardContent className="flex items-center justify-center h-96">
                <div className="text-center">
                  <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium">No Template Selected</h3>
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
                    <CardTitle className="flex items-center gap-2">
                      <Edit className="h-5 w-5" />
                      Editing: {editingTemplate.name}
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
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveTemplate}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
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
                  <div className="space-y-2">
                    <Label htmlFor="active">Status</Label>
                    <div className="flex items-center space-x-2">
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

                <div className="space-y-2">
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

                <div className="space-y-2">
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

                <Tabs defaultValue="html" className="w-full">
                  <TabsList>
                    <TabsTrigger value="html">HTML Content</TabsTrigger>
                    <TabsTrigger value="text">Text Content</TabsTrigger>
                    <TabsTrigger value="variables">Variables</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="html" className="space-y-2">
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
                      className="min-h-[300px] font-mono text-sm"
                    />
                  </TabsContent>

                  <TabsContent value="text" className="space-y-2">
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
                      className="min-h-[300px] font-mono text-sm"
                      placeholder="Plain text version of the email..."
                    />
                  </TabsContent>

                  <TabsContent value="variables" className="space-y-4">
                    <div>
                      <h3 className="text-lg font-medium mb-2">Available Variables</h3>
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
                            <TableCell className="font-mono">
                              {`{{${variable.name}}}`}
                            </TableCell>
                            <TableCell>{variable.description}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            /* View Mode */
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {selectedTemplate.name}
                      <Badge variant={selectedTemplate.is_active ? 'default' : 'secondary'}>
                        {selectedTemplate.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Template Key: <code className="text-xs">{selectedTemplate.template_key}</code>
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <TestTube className="h-4 w-4 mr-2" />
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
                        <div className="space-y-4">
                          <div className="space-y-2">
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
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Mail className="h-4 w-4 mr-2" />
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
                      <Eye className="h-4 w-4 mr-2" />
                      {showPreview ? 'Hide Preview' : 'Preview'}
                    </Button>
                    
                    <Button
                      size="sm"
                      onClick={() => setEditingTemplate(selectedTemplate)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {selectedTemplate.description && (
                  <Alert>
                    <AlertDescription>{selectedTemplate.description}</AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Created</Label>
                    <p>{formatDate(selectedTemplate.created_at)}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Last Updated</Label>
                    <p>{formatDate(selectedTemplate.updated_at)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Subject Line</Label>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <code className="text-sm">{selectedTemplate.subject}</code>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Available Variables</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {selectedTemplate.variables.map((variable, index) => (
                      <div key={index} className="p-2 bg-muted/50 rounded text-sm">
                        <code className="font-mono">{`{{${variable.name}}}`}</code>
                        <span className="ml-2 text-muted-foreground">- {variable.description}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {showPreview && (
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-medium mb-4">Email Preview</h3>
                    
                    {/* Variable inputs for preview */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {selectedTemplate.variables.map((variable) => (
                        <div key={variable.name} className="space-y-1">
                          <Label htmlFor={`preview-${variable.name}`} className="text-xs">
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

                    <Tabs defaultValue="html-preview" className="w-full">
                      <TabsList>
                        <TabsTrigger value="html-preview">HTML Preview</TabsTrigger>
                        <TabsTrigger value="html-code">HTML Code</TabsTrigger>
                        {selectedTemplate.text_content && (
                          <TabsTrigger value="text-preview">Text Version</TabsTrigger>
                        )}
                      </TabsList>
                      
                      <TabsContent value="html-preview">
                        <div className="border rounded-lg p-4 bg-background">
                          <div className="border-b pb-2 mb-4">
                            <strong>Subject:</strong> {generatePreview(selectedTemplate, previewData).subject}
                          </div>
                          <div
                            dangerouslySetInnerHTML={{
                              __html: generatePreview(selectedTemplate, previewData).htmlContent,
                            }}
                          />
                        </div>
                      </TabsContent>

                      <TabsContent value="html-code">
                        <div className="p-4 bg-muted/50 rounded-lg">
                          <pre className="text-sm whitespace-pre-wrap font-mono">
                            {generatePreview(selectedTemplate, previewData).htmlContent}
                          </pre>
                        </div>
                      </TabsContent>

                      {selectedTemplate.text_content && (
                        <TabsContent value="text-preview">
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <div className="border-b pb-2 mb-4">
                              <strong>Subject:</strong> {generatePreview(selectedTemplate, previewData).subject}
                            </div>
                            <pre className="text-sm whitespace-pre-wrap">
                              {generatePreview(selectedTemplate, previewData).textContent}
                            </pre>
                          </div>
                        </TabsContent>
                      )}
                    </Tabs>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
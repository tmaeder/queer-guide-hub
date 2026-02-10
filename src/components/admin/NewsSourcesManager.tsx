import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Rss, 
  Globe, 
  Play, 
  Tags, 
  Settings2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { validateNewsSource } from "@/utils/contentValidation";

type NewsSource = Tables<'news_sources'>;

export function NewsSourcesManager() {
  const { toast } = useToast();
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [keywordsDialogOpen, setKeywordsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<NewsSource | null>(null);
  const [editingKeywords, setEditingKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    category: "",
    source_type: "",
    fetch_frequency: 120,
    is_active: true,
    keywords: [] as string[]
  });

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const { data, error } = await supabase
        .from('news_sources')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSources(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch news sources",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate before submitting
    const result = validateNewsSource(formData as Record<string, unknown>);
    if (!result.isValid) {
      const fieldErrors: Record<string, string> = {};
      result.errors.forEach(err => {
        fieldErrors[err.field] = err.message;
      });
      setValidationErrors(fieldErrors);
      toast({
        title: "Validation Error",
        description: result.errors[0]?.message || "Please fix the highlighted fields",
        variant: "destructive",
      });
      return;
    }
    setValidationErrors({});

    try {
      if (editingSource) {
        const { error } = await supabase
          .from('news_sources')
          .update(formData)
          .eq('id', editingSource.id);
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "News source updated successfully",
        });
      } else {
        const { error } = await supabase
          .from('news_sources')
          .insert([formData]);
        
        if (error) throw error;
        
        toast({
          title: "Success", 
          description: "News source created successfully",
        });
      }
      
      setDialogOpen(false);
      resetForm();
      fetchSources();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      url: "",
      category: "",
      source_type: "",
      fetch_frequency: 120,
      is_active: true,
      keywords: []
    });
    setEditingSource(null);
  };

  const handleEdit = (source: NewsSource) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      url: source.url,
      category: source.category,
      source_type: source.source_type,
      fetch_frequency: source.fetch_frequency,
      is_active: source.is_active,
      keywords: source.keywords || []
    });
    setDialogOpen(true);
  };

  const handleDelete = async (sourceId: string) => {
    if (!confirm("Are you sure you want to delete this news source?")) return;
    
    try {
      const { error } = await supabase
        .from('news_sources')
        .delete()
        .eq('id', sourceId);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "News source deleted successfully",
      });
      
      fetchSources();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete news source",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (sourceId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('news_sources')
        .update({ is_active: !isActive })
        .eq('id', sourceId);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `News source ${!isActive ? 'activated' : 'deactivated'}`,
      });
      
      fetchSources();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update news source",
        variant: "destructive",
      });
    }
  };

  const triggerFetch = async (sourceId: string) => {
    try {
      const { error } = await supabase.functions.invoke('fetch-news', {
        body: { sourceId }
      });
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "News fetch triggered successfully",
      });
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to trigger news fetch",
        variant: "destructive",
      });
    }
  };

  const handleKeywordsEdit = (source: NewsSource) => {
    setEditingSource(source);
    setEditingKeywords(source.keywords || []);
    setKeywordsDialogOpen(true);
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !editingKeywords.includes(newKeyword.trim())) {
      setEditingKeywords([...editingKeywords, newKeyword.trim()]);
      setNewKeyword("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setEditingKeywords(editingKeywords.filter(k => k !== keyword));
  };

  const saveKeywords = async () => {
    if (!editingSource) return;
    
    try {
      const { error } = await supabase
        .from('news_sources')
        .update({ keywords: editingKeywords })
        .eq('id', editingSource.id);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Keywords updated successfully",
      });
      
      setKeywordsDialogOpen(false);
      setEditingSource(null);
      setEditingKeywords([]);
      fetchSources();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update keywords",
        variant: "destructive",
      });
    }
  };

  const toggleSourceExpanded = (sourceId: string) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(sourceId)) {
      newExpanded.delete(sourceId);
    } else {
      newExpanded.add(sourceId);
    }
    setExpandedSources(newExpanded);
  };

  const activeSourcesCount = sources.filter(s => s.is_active).length;
  const rssSourcesCount = sources.filter(s => s.url && s.url.includes('feed')).length;
  const apiSourcesCount = sources.filter(s => s.source_type === 'api').length;

  if (loading) {
    return <div className="text-center p-4">Loading news sources...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">News Sources Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage RSS feeds and API sources for automated news import
          </p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Source
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingSource ? 'Edit News Source' : 'Add News Source'}
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Source Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => { setFormData({...formData, name: e.target.value}); setValidationErrors(prev => ({...prev, name: ''})); }}
                    required
                    aria-invalid={!!validationErrors.name}
                  />
                  {validationErrors.name && <p className="text-xs text-destructive mt-1">{validationErrors.name}</p>}
                </div>
                
                <div>
                  <Label htmlFor="source_type">Source Type</Label>
                  <Select
                    value={formData.source_type}
                    onValueChange={(value) => setFormData({...formData, source_type: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rss">RSS Feed</SelectItem>
                      <SelectItem value="api">API Source</SelectItem>
                      <SelectItem value="news_api">News API</SelectItem>
                      <SelectItem value="social">Social Media</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => { setFormData({...formData, category: e.target.value}); setValidationErrors(prev => ({...prev, category: ''})); }}
                  placeholder="e.g., LGBTQ+, General News, Politics"
                  required
                  aria-invalid={!!validationErrors.category}
                />
                {validationErrors.category && <p className="text-xs text-destructive mt-1">{validationErrors.category}</p>}
              </div>

              <div>
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  type="url"
                  value={formData.url}
                  onChange={(e) => { setFormData({...formData, url: e.target.value}); setValidationErrors(prev => ({...prev, url: ''})); }}
                  placeholder="https://example.com/feed.xml or API endpoint"
                  required
                  aria-invalid={!!validationErrors.url}
                />
                {validationErrors.url && <p className="text-xs text-destructive mt-1">{validationErrors.url}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fetch_frequency">Fetch Frequency (minutes)</Label>
                  <Input
                    id="fetch_frequency"
                    type="number"
                    min="30"
                    value={formData.fetch_frequency}
                    onChange={(e) => setFormData({...formData, fetch_frequency: parseInt(e.target.value)})}
                  />
                </div>
                
                <div className="flex items-center space-x-2 pt-6">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingSource ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{sources.length}</div>
            <p className="text-xs text-muted-foreground">Total Sources</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{activeSourcesCount}</div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{rssSourcesCount}</div>
            <p className="text-xs text-muted-foreground">RSS Feeds</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{apiSourcesCount}</div>
            <p className="text-xs text-muted-foreground">API Sources</p>
          </CardContent>
        </Card>
      </div>

      {/* Sources List */}
      <Card>
        <CardHeader>
          <CardTitle>News Sources</CardTitle>
          <CardDescription>
            Manage your RSS feeds and API sources
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No news sources configured yet. Add your first source to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {sources.map((source) => (
                <Collapsible key={source.id}>
                  <Card className={`transition-colors ${source.is_active ? 'border-green-200' : 'border-gray-200'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center space-x-2">
                            {source.source_type === 'rss' || source.url?.includes('feed') ? (
                              <Rss className="h-4 w-4 text-orange-500" />
                            ) : (
                              <Globe className="h-4 w-4 text-blue-500" />
                            )}
                            <span className="font-medium">{source.name}</span>
                          </div>
                          
                          <Badge variant={source.is_active ? "default" : "secondary"}>
                            {source.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          
                          <Badge variant="outline">
                            {source.category}
                          </Badge>

                          {source.keywords && source.keywords.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Tags className="h-3 w-3 mr-1" />
                              {source.keywords.length} keywords
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={source.is_active}
                            onCheckedChange={() => handleToggleActive(source.id, source.is_active)}
                          />
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => triggerFetch(source.id)}
                            disabled={!source.is_active}
                            aria-label={`Fetch news from ${source.name}`}
                          >
                            <Play className="h-3 w-3" aria-hidden="true" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleKeywordsEdit(source)}
                            aria-label={`Edit keywords for ${source.name}`}
                          >
                            <Tags className="h-3 w-3" aria-hidden="true" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(source)}
                            aria-label={`Edit ${source.name}`}
                          >
                            <Edit2 className="h-3 w-3" aria-hidden="true" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(source.id)}
                            aria-label={`Delete ${source.name}`}
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          </Button>

                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleSourceExpanded(source.id)}
                            >
                              {expandedSources.has(source.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>

                      <CollapsibleContent className="mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="font-medium">URL:</span>
                            <p className="text-muted-foreground break-all">
                              {source.url || 'N/A'}
                            </p>
                          </div>
                          
                          <div>
                            <span className="font-medium">Frequency:</span>
                            <p className="text-muted-foreground">
                              Every {source.fetch_frequency} minutes
                            </p>
                          </div>
                          
                          <div>
                            <span className="font-medium">Last Fetch:</span>
                            <p className="text-muted-foreground">
                              {source.last_fetched_at 
                                ? new Date(source.last_fetched_at).toLocaleString()
                                : 'Never'
                              }
                            </p>
                          </div>

                          {source.keywords && source.keywords.length > 0 && (
                            <div className="md:col-span-3">
                              <span className="font-medium">Keywords:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {source.keywords.map((keyword, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {source.status && (
                            <div className="md:col-span-3">
                              <span className="font-medium">Status:</span>
                              <p className={`text-sm ${
                                source.status === 'error' ? 'text-red-600' : 
                                source.status === 'processing' ? 'text-yellow-600' : 
                                'text-green-600'
                              }`}>
                                {source.status}
                                {source.last_error && ` - ${source.last_error}`}
                              </p>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </CardContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keywords Management Dialog */}
      <Dialog open={keywordsDialogOpen} onOpenChange={setKeywordsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Keywords for {editingSource?.name}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex space-x-2">
              <Input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="Add keyword..."
                onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
              />
              <Button onClick={addKeyword}>Add</Button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {editingKeywords.map((keyword, index) => (
                <Badge key={index} variant="secondary" className="cursor-pointer">
                  {keyword}
                  <button
                    onClick={() => removeKeyword(keyword)}
                    className="ml-1 text-red-500 hover:text-red-700"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setKeywordsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveKeywords}>Save Keywords</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
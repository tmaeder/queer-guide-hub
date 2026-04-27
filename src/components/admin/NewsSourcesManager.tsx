import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Box, Typography } from "@mui/material";
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
    auto_publish: false,
    keywords: [] as string[]
  });

  useEffect(() => {
    fetchSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const fetchSources = async () => {
    try {
      const { data, error } = await supabase
        .from('news_sources')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSources(data || []);
    } catch (_error) {
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
      auto_publish: false,
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
      auto_publish: (source as NewsSource & { auto_publish?: boolean }).auto_publish ?? false,
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
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
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
    return <Box sx={{ textAlign: 'center', p: 2 }}>Loading news sources...</Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header with stats */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>News Sources Management</Typography>
          <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
            Manage RSS feeds and API sources for automated news import
          </Typography>
        </Box>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
              Add Source
            </Button>
          </DialogTrigger>
          <DialogContent style={{ maxWidth: '42rem' }}>
            <DialogHeader>
              <DialogTitle>
                {editingSource ? 'Edit News Source' : 'Add News Source'}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Label htmlFor="name">Source Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => { setFormData({...formData, name: e.target.value}); setValidationErrors(prev => ({...prev, name: ''})); }}
                    required
                    aria-invalid={!!validationErrors.name}
                  />
                  {validationErrors.name && <Typography sx={{ fontSize: '0.75rem', color: 'error.main', mt: 0.5 }}>{validationErrors.name}</Typography>}
                </Box>

                <Box>
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
                </Box>
              </Box>

              <Box>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => { setFormData({...formData, category: e.target.value}); setValidationErrors(prev => ({...prev, category: ''})); }}
                  placeholder="e.g., LGBTQ+, General News, Politics"
                  required
                  aria-invalid={!!validationErrors.category}
                />
                {validationErrors.category && <Typography sx={{ fontSize: '0.75rem', color: 'error.main', mt: 0.5 }}>{validationErrors.category}</Typography>}
              </Box>

              <Box>
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
                {validationErrors.url && <Typography sx={{ fontSize: '0.75rem', color: 'error.main', mt: 0.5 }}>{validationErrors.url}</Typography>}
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Label htmlFor="fetch_frequency">Fetch Frequency (minutes)</Label>
                  <Input
                    id="fetch_frequency"
                    type="number"
                    min="30"
                    value={formData.fetch_frequency}
                    onChange={(e) => setFormData({...formData, fetch_frequency: parseInt(e.target.value)})}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pt: 3 }}>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Switch
                  id="auto_publish"
                  checked={formData.auto_publish}
                  onCheckedChange={(checked) => setFormData({...formData, auto_publish: checked})}
                />
                <Label htmlFor="auto_publish">Auto-publish (skip review queue)</Label>
                <Typography variant="caption" sx={{ color: 'var(--muted-foreground)', ml: 1 }}>
                  Trusted sources only — new sources are forced through review for the first 24 hours regardless.
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingSource ? 'Update' : 'Create'}
                </Button>
              </Box>
            </form>
          </DialogContent>
        </Dialog>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
        <Card>
          <CardContent style={{ padding: 16 }}>
            <Box sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{sources.length}</Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>Total Sources</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 16 }}>
            <Box sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{activeSourcesCount}</Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>Active</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 16 }}>
            <Box sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{rssSourcesCount}</Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>RSS Feeds</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 16 }}>
            <Box sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{apiSourcesCount}</Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>API Sources</Typography>
          </CardContent>
        </Card>
      </Box>

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
            <Box sx={{ textAlign: 'center', py: 4, color: 'var(--muted-foreground)' }}>
              No news sources configured yet. Add your first source to get started.
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {sources.map((source) => (
                <Collapsible key={source.id}>
                  <Card style={{ transition: 'border-color 0.2s', borderColor: source.is_active ? '#bbf7d0' : '#e5e7eb' }}>
                    <CardContent style={{ padding: 16 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {source.source_type === 'rss' || source.url?.includes('feed') ? (
                              <Rss style={{ height: 16, width: 16, color: '#f97316' }} />
                            ) : (
                              <Globe style={{ height: 16, width: 16, color: '#3b82f6' }} />
                            )}
                            <Box component="span" sx={{ fontWeight: 500 }}>{source.name}</Box>
                          </Box>

                          <Badge variant={source.is_active ? "default" : "secondary"}>
                            {source.is_active ? 'Active' : 'Inactive'}
                          </Badge>

                          {(source as NewsSource & { auto_publish?: boolean }).auto_publish && (
                            <Badge variant="default" style={{ background: '#b60d3d' }}>
                              Auto-publish
                            </Badge>
                          )}

                          <Badge variant="outline">
                            {source.category}
                          </Badge>

                          {source.keywords && source.keywords.length > 0 && (
                            <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                              <Tags style={{ height: 12, width: 12, marginRight: 4 }} />
                              {source.keywords.length} keywords
                            </Badge>
                          )}
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                            <Play style={{ height: 12, width: 12 }} aria-hidden="true" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleKeywordsEdit(source)}
                            aria-label={`Edit keywords for ${source.name}`}
                          >
                            <Tags style={{ height: 12, width: 12 }} aria-hidden="true" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(source)}
                            aria-label={`Edit ${source.name}`}
                          >
                            <Edit2 style={{ height: 12, width: 12 }} aria-hidden="true" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(source.id)}
                            aria-label={`Delete ${source.name}`}
                          >
                            <Trash2 style={{ height: 12, width: 12 }} aria-hidden="true" />
                          </Button>

                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleSourceExpanded(source.id)}
                            >
                              {expandedSources.has(source.id) ? (
                                <ChevronUp style={{ height: 16, width: 16 }} />
                              ) : (
                                <ChevronDown style={{ height: 16, width: 16 }} />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </Box>
                      </Box>

                      <CollapsibleContent style={{ marginTop: 16 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2, fontSize: '0.875rem' }}>
                          <Box>
                            <Box component="span" sx={{ fontWeight: 500 }}>URL:</Box>
                            <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', wordBreak: 'break-all' }}>
                              {source.url || 'N/A'}
                            </Typography>
                          </Box>

                          <Box>
                            <Box component="span" sx={{ fontWeight: 500 }}>Frequency:</Box>
                            <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                              Every {source.fetch_frequency} minutes
                            </Typography>
                          </Box>

                          <Box>
                            <Box component="span" sx={{ fontWeight: 500 }}>Last Fetch:</Box>
                            <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                              {source.last_fetched_at
                                ? new Date(source.last_fetched_at).toLocaleString()
                                : 'Never'
                              }
                            </Typography>
                          </Box>

                          {source.keywords && source.keywords.length > 0 && (
                            <Box sx={{ gridColumn: { md: 'span 3' } }}>
                              <Box component="span" sx={{ fontWeight: 500 }}>Keywords:</Box>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                {source.keywords.map((keyword, index) => (
                                  <Badge key={index} variant="secondary" style={{ fontSize: '0.75rem' }}>
                                    {keyword}
                                  </Badge>
                                ))}
                              </Box>
                            </Box>
                          )}

                          {source.status && (
                            <Box sx={{ gridColumn: { md: 'span 3' } }}>
                              <Box component="span" sx={{ fontWeight: 500 }}>Status:</Box>
                              <Typography variant="body2" sx={{
                                color: source.status === 'error' ? '#dc2626' :
                                  source.status === 'processing' ? '#ca8a04' :
                                  '#16a34a'
                              }}>
                                {source.status}
                                {source.last_error && ` - ${source.last_error}`}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </CollapsibleContent>
                    </CardContent>
                  </Card>
                </Collapsible>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Keywords Management Dialog */}
      <Dialog open={keywordsDialogOpen} onOpenChange={setKeywordsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Keywords for {editingSource?.name}</DialogTitle>
          </DialogHeader>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="Add keyword..."
                onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
              />
              <Button onClick={addKeyword}>Add</Button>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {editingKeywords.map((keyword, index) => (
                <Badge key={index} variant="secondary" style={{ cursor: 'pointer' }}>
                  {keyword}
                  <button
                    onClick={() => removeKeyword(keyword)}
                    style={{ marginLeft: 4, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button variant="outline" onClick={() => setKeywordsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveKeywords}>Save Keywords</Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

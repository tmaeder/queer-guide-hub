import { useState, useEffect } from 'react';
import { Languages, Loader2, Check, Sparkles } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LANGUAGE_NAMES } from '@/i18n/languages';
import type { SupportedLocale } from '@/i18n/languages';

const TRANSLATABLE_FIELDS = ['name', 'title', 'description', 'headline', 'body', 'biography', 'content', 'meta_description'];

interface TranslationPanelProps {
  tableName: string;
  recordId: string;
  originalData: Record<string, unknown>;
}

interface TranslationRow {
  id: string;
  field_name: string;
  language: string;
  value: string;
  status: string;
  machine_source: string | null;
}

export function TranslationPanel({ tableName, recordId, originalData }: TranslationPanelProps) {
  const { toast } = useToast();
  const [selectedLang, setSelectedLang] = useState<SupportedLocale>('de');
  const [translations, setTranslations] = useState<Record<string, TranslationRow>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoTranslating, setAutoTranslating] = useState(false);

  const translatableFields = TRANSLATABLE_FIELDS.filter(
    (f) => originalData[f] && typeof originalData[f] === 'string' && (originalData[f] as string).trim().length > 0,
  );

  const nonDefaultLocales = SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE);

  useEffect(() => {
    loadTranslations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLang, recordId]);

  async function loadTranslations() {
    setLoading(true);
    const { data, error } = await supabase
      .from('content_translations')
      .select('*')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .eq('language', selectedLang);

    if (!error && data) {
      const map: Record<string, TranslationRow> = {};
      for (const row of data as TranslationRow[]) {
        map[row.field_name] = row;
      }
      setTranslations(map);
      const d: Record<string, string> = {};
      for (const row of data as TranslationRow[]) {
        d[row.field_name] = row.value;
      }
      setDrafts(d);
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    for (const field of translatableFields) {
      const value = drafts[field];
      if (!value || value.trim().length === 0) continue;

      const existing = translations[field];
      if (existing) {
        await supabase
          .from('content_translations')
          .update({ value, status: 'human_reviewed', machine_source: null })
          .eq('id', existing.id);
      } else {
        await supabase.from('content_translations').insert({
          table_name: tableName,
          record_id: recordId,
          field_name: field,
          language: selectedLang,
          value,
          status: 'published',
        });
      }
    }
    toast({ title: 'Translations saved' });
    await loadTranslations();
    setSaving(false);
  }

  async function handlePublish() {
    const ids = Object.values(translations)
      .filter((t) => t.status !== 'published')
      .map((t) => t.id);
    if (ids.length === 0) return;

    await supabase
      .from('content_translations')
      .update({ status: 'published' })
      .in('id', ids);

    toast({ title: 'Translations published' });
    await loadTranslations();
  }

  async function handleAutoTranslate() {
    setAutoTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-content', {
        body: {
          table_name: tableName,
          record_id: recordId,
          target_language: selectedLang,
          fields: translatableFields,
          source_data: Object.fromEntries(translatableFields.map((f) => [f, originalData[f]])),
        },
      });

      if (error) throw error;

      if (data?.translations) {
        setDrafts((prev) => ({ ...prev, ...data.translations }));
        toast({ title: 'Auto-translation complete', description: 'Review and save.' });
      }
    } catch {
      toast({ title: 'Auto-translate failed', variant: 'destructive' });
    }
    setAutoTranslating(false);
  }

  const completedCount = translatableFields.filter((f) => translations[f]?.status === 'published').length;
  const totalCount = translatableFields.length;

  if (translatableFields.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Languages style={{ width: 18, height: 18 }} />
          Translations
          <Badge variant="secondary" style={{ marginLeft: 'auto' }}>
            {completedCount}/{totalCount}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Select value={selectedLang} onValueChange={(v) => setSelectedLang(v as SupportedLocale)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {nonDefaultLocales.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {LANGUAGE_NAMES[lang]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
          </Box>
        ) : (
          <>
            {translatableFields.map((field) => {
              const original = String(originalData[field] || '');
              const isLong = original.length > 100;
              const existing = translations[field];

              return (
                <Box key={field} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Label style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                      {field.replace('_', ' ')}
                    </Label>
                    {existing && (
                      <Badge
                        variant={existing.status === 'published' ? 'default' : 'secondary'}
                        style={{ fontSize: '0.6rem', padding: '0 4px' }}
                      >
                        {existing.status}
                      </Badge>
                    )}
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.disabled', fontSize: '0.7rem', lineHeight: 1.3 }}
                  >
                    {original.slice(0, 120)}
                    {original.length > 120 ? '...' : ''}
                  </Typography>
                  {isLong ? (
                    <Textarea
                      value={drafts[field] || ''}
                      onChange={(e) => setDrafts((p) => ({ ...p, [field]: e.target.value }))}
                      style={{ fontSize: '0.8125rem', minHeight: 80 }}
                    />
                  ) : (
                    <Input
                      value={drafts[field] || ''}
                      onChange={(e) => setDrafts((p) => ({ ...p, [field]: e.target.value }))}
                      style={{ fontSize: '0.8125rem' }}
                    />
                  )}
                </Box>
              );
            })}

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button size="sm" onClick={handleAutoTranslate} disabled={autoTranslating} variant="outline">
                {autoTranslating ? (
                  <Loader2 style={{ width: 14, height: 14, marginRight: 6, animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Sparkles style={{ width: 14, height: 14, marginRight: 6 }} />
                )}
                Auto-translate
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 style={{ width: 14, height: 14, marginRight: 6, animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Check style={{ width: 14, height: 14, marginRight: 6 }} />
                )}
                Save
              </Button>
              {Object.values(translations).some((t) => t.status !== 'published') && (
                <Button size="sm" variant="outline" onClick={handlePublish}>
                  Publish all
                </Button>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}

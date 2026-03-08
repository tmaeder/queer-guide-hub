import { useState } from 'react';
import { useTagAliases } from '@/hooks/useTagAliases';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Plus, X } from 'lucide-react';

const ALIAS_TYPES = [
  { value: 'synonym', label: 'Synonym' },
  { value: 'abbreviation', label: 'Abbreviation' },
  { value: 'spelling_variant', label: 'Spelling variant' },
];

interface TagAliasesSectionProps {
  tagId: string;
}

export function TagAliasesSection({ tagId }: TagAliasesSectionProps) {
  const { aliases, isLoading, createAlias, deleteAlias } = useTagAliases(tagId);
  const { toast } = useToast();
  const [newAlias, setNewAlias] = useState('');
  const [newType, setNewType] = useState('synonym');

  const handleAdd = async () => {
    const trimmed = newAlias.trim();
    if (!trimmed) return;
    try {
      await createAlias.mutateAsync({ alias_name: trimmed, alias_type: newType });
      setNewAlias('');
      toast({ title: 'Synonym added' });
    } catch {
      toast({ title: 'Error', description: 'Failed to add synonym', variant: 'destructive' });
    }
  };

  const handleDelete = async (aliasId: string) => {
    try {
      await deleteAlias.mutateAsync(aliasId);
    } catch {
      toast({ title: 'Error', description: 'Failed to remove synonym', variant: 'destructive' });
    }
  };

  const typeBadgeColor = (type: string) => {
    if (type === 'abbreviation') return 'secondary';
    if (type === 'spelling_variant') return 'outline';
    return 'default';
  };

  return (
    <Box>
      <Label>Synonyms / Aliases</Label>
      {isLoading ? (
        <Typography variant="caption" color="text.secondary">
          Loading...
        </Typography>
      ) : (
        <>
          {aliases.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5, mb: 1 }}>
              {aliases.map((alias) => (
                <Badge
                  key={alias.id}
                  variant={typeBadgeColor(alias.alias_type)}
                  style={{ gap: 4, paddingRight: 2 }}
                >
                  {alias.alias_name}
                  <Typography
                    variant="caption"
                    sx={{ opacity: 0.6, fontSize: '0.65rem', ml: 0.25 }}
                  >
                    {alias.alias_type === 'abbreviation'
                      ? 'abbr'
                      : alias.alias_type === 'spelling_variant'
                        ? 'var'
                        : ''}
                  </Typography>
                  <button
                    type="button"
                    onClick={() => handleDelete(alias.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                      opacity: 0.6,
                    }}
                  >
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </Badge>
              ))}
            </Box>
          )}
          {aliases.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              No synonyms yet
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-end' }}>
            <Input
              placeholder="Add synonym..."
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              style={{ flex: 1 }}
            />
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger style={{ width: 130 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALIAS_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={!newAlias.trim() || createAlias.isPending}
            >
              <Plus style={{ width: 14, height: 14 }} />
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}

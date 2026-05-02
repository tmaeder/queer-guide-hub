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
    <div>
      <Label>Synonyms / Aliases</Label>
      {isLoading ? (
        <span className="text-xs text-muted-foreground">Loading...</span>
      ) : (
        <>
          {aliases.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 mb-2">
              {aliases.map((alias) => (
                <Badge
                  key={alias.id}
                  variant={typeBadgeColor(alias.alias_type)}
                  style={{ gap: 4, paddingRight: 2 }}
                >
                  {alias.alias_name}
                  <span className="ml-0.5" style={{ opacity: 0.6, fontSize: '0.65rem' }}>
                    {alias.alias_type === 'abbreviation'
                      ? 'abbr'
                      : alias.alias_type === 'spelling_variant'
                        ? 'var'
                        : ''}
                  </span>
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
            </div>
          )}
          {aliases.length === 0 && (
            <span className="block text-xs text-muted-foreground mb-2">No synonyms yet</span>
          )}
          <div className="flex gap-1 items-end">
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
          </div>
        </>
      )}
    </div>
  );
}

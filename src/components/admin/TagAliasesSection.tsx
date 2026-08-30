import { useState } from 'react';
import { useTagAliases } from '@/hooks/useTagAliases';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';

const ALIAS_TYPES = [
  { value: 'synonym', label: 'Synonym' },
  { value: 'abbreviation', label: 'Abbreviation' },
  { value: 'spelling_variant', label: 'Spelling variant' },
  { value: 'plural', label: 'Plural' },
  { value: 'brand_name', label: 'Brand name' },
  { value: 'historical', label: 'Historical name' },
  { value: 'multilingual', label: 'Translation' },
  // Not a synonym: a narrower term routed to this tag (group member,
  // product form, preparation, sub-topic). Displays as "Also covers".
  { value: 'covers', label: 'Covers (narrower term)' },
];

interface TagAliasesSectionProps {
  tagId: string;
}

export function TagAliasesSection({ tagId }: TagAliasesSectionProps) {
  const { aliases, isLoading, createAlias, deleteAlias } = useTagAliases(tagId);
  const [newAlias, setNewAlias] = useState('');
  const [newType, setNewType] = useState('synonym');

  const handleAdd = async () => {
    const trimmed = newAlias.trim();
    if (!trimmed) return;
    try {
      await createAlias.mutateAsync({ alias_name: trimmed, alias_type: newType });
      setNewAlias('');
      toast.success('Synonym added');
    } catch {
      toast.error('Error: Failed to add synonym');
    }
  };

  const handleDelete = async (aliasId: string) => {
    try {
      await deleteAlias.mutateAsync(aliasId);
    } catch {
      toast.error('Error: Failed to remove synonym');
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
        <AdminTextSkeleton lines={2} />
      ) : (
        <>
          {aliases.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 mb-2">
              {aliases.map((alias) => (
                <Badge
                  key={alias.id}
                  variant={typeBadgeColor(alias.alias_type)}
                  className="gap-1 pr-0.5"
                >
                  {alias.alias_name}
                  <span className="ml-0.5" style={{ opacity: 0.6, fontSize: '0.65rem' }}>
                    {[
                      alias.alias_type === 'abbreviation'
                        ? 'abbr'
                        : alias.alias_type === 'spelling_variant'
                          ? 'var'
                          : alias.alias_type === 'covers'
                            ? 'covers'
                            : alias.alias_type === 'multilingual'
                              ? 'i18n'
                              : '',
                      // Unreviewed rows neither display publicly nor drive
                      // auto-tagging — the admin needs to see which is which.
                      alias.review_status !== 'approved' ? alias.review_status : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {aliases.length === 0 && (
            <AdminEmpty noun="synonyms" variant="inline" className="mb-2 block text-xs" />
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
              <Plus size={14} />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

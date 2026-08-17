/**
 * TagAliasesDisplay — the "also known as" array (spine slot S4).
 *
 * Chips are deliberately NOT links. An alias is a synonym for the term you are
 * already reading; routing it somewhere would either loop back to this page or
 * imply a separate entry that does not exist. Grouped by `alias_type` so
 * "abbreviation" and "historical term" are not presented as equivalent.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTagAliases, type TagAlias } from '@/hooks/useTagAliases';
import { Eyebrow } from '@/components/ui/Eyebrow';

const TYPE_LABELS: Record<string, string> = {
  synonym: 'Also called',
  abbreviation: 'Short for',
  plural: 'Plural',
  misspelling: 'Common misspelling',
  historical: 'Historically',
  slang: 'Slang',
};

export function TagAliasesDisplay({ tagId }: { tagId: string }) {
  const { t } = useTranslation();
  const { aliases } = useTagAliases(tagId);

  const groups = useMemo(() => {
    const map = new Map<string, TagAlias[]>();
    for (const alias of aliases) {
      const key = alias.alias_type || 'synonym';
      map.set(key, [...(map.get(key) ?? []), alias]);
    }
    return [...map.entries()];
  }, [aliases]);

  if (!groups.length) return null;

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([type, list]) => (
        <div key={type} className="flex flex-wrap items-center gap-2">
          <Eyebrow as="span">
            {t(`tags.detail.alias.${type}`, TYPE_LABELS[type] ?? TYPE_LABELS.synonym)}
          </Eyebrow>
          {list.map((alias) => (
            <span key={alias.id} className="bg-muted rounded-element px-2 py-0.5 text-13 font-bold">
              {alias.alias_name}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

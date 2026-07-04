import { useTagAliases } from '@/hooks/useTagAliases';
import { useTranslation } from 'react-i18next';

interface TagAliasesDisplayProps {
  tagId: string;
}

const TYPE_ORDER = ['synonym', 'abbreviation', 'plural', 'spelling_variant', 'historical', 'multilingual', 'brand_name', 'deprecated'] as const;

function groupByType(aliases: { alias_name: string; alias_type: string }[]) {
  const groups = new Map<string, string[]>();
  for (const a of aliases) {
    const list = groups.get(a.alias_type) ?? [];
    list.push(a.alias_name);
    groups.set(a.alias_type, list);
  }
  return TYPE_ORDER
    .filter((t) => groups.has(t))
    .map((t) => ({ type: t, names: groups.get(t)! }));
}

export function TagAliasesDisplay({ tagId }: TagAliasesDisplayProps) {
  const { aliases, isLoading } = useTagAliases(tagId);
  const { t } = useTranslation();

  if (isLoading || aliases.length === 0) return null;

  const grouped = groupByType(aliases);
  if (grouped.length === 0) return null;

  const allNames = aliases.map((a) => a.alias_name);

  if (grouped.length === 1) {
    return (
      <p className="text-sm text-muted-foreground mb-4" style={{ maxWidth: 680 }}>
        {t('resources.tagDetail.alsoKnownAs', 'Also known as')}{' '}
        {allNames.map((name, i) => (
          <span key={name}>
            <span className="font-medium text-foreground">{name}</span>
            {i < allNames.length - 1 ? ', ' : ''}
          </span>
        ))}
      </p>
    );
  }

  return (
    <div className="text-sm text-muted-foreground mb-4" style={{ maxWidth: 680 }}>
      <p className="mb-1">{t('resources.tagDetail.alsoKnownAs', 'Also known as')}:</p>
      <ul className="list-none p-0 flex flex-col gap-0.5">
        {grouped.map(({ type, names }) => (
          <li key={type}>
            <span className="text-xs uppercase tracking-wide opacity-60">{type.replace(/_/g, ' ')}</span>{' '}
            {names.map((name, i) => (
              <span key={name}>
                <span className="font-medium text-foreground">{name}</span>
                {i < names.length - 1 ? ', ' : ''}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

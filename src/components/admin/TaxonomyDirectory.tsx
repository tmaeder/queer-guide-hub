import { useState } from 'react';
import { Link } from 'react-router';
import { getTaxonomyDestinations } from '@/config/taxonomyCatalog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import { ChevronRight } from '@/components/icons';
import { exportAllTaxonomies } from '@/lib/taxonomyExport';

export function TaxonomyDirectory() {
  const [search, setSearch] = useState('');
  const terms = getTaxonomyDestinations().filter((term) =>
    `${term.label} ${term.group}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const groups = new Map<string, typeof terms>();
  for (const term of terms) groups.set(term.group, [...(groups.get(term.group) ?? []), term]);
  return (
    <div className="flex flex-col gap-6">
      <AdminArchetypeHeader title="Taxonomies" />
      <p className="max-w-prose text-15 text-muted-foreground">
        Manage categories, tags, amenities, services, and the choices used across content and
        profiles. Deactivate used terms to preserve their existing references.
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex w-full max-w-md flex-col gap-2">
          <Label htmlFor="taxonomy-search">Find a taxonomy</Label>
          <Input
            id="taxonomy-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            placeholder="Search by name or area"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportExcelButton
            size="sm"
            label="Export all taxonomies (Excel)"
            onExport={() => exportAllTaxonomies('Excel')}
          />
          <ExportExcelButton
            size="sm"
            format="CSV"
            label="Export all taxonomies (CSV)"
            onExport={() => exportAllTaxonomies('CSV')}
          />
          {/* Tags are ~10k rows; these skip them for a quick vocabulary-only file. */}
          <ExportExcelButton
            size="sm"
            label="Export without tags (Excel)"
            onExport={() => exportAllTaxonomies('Excel', { includeTags: false })}
          />
          <ExportExcelButton
            size="sm"
            format="CSV"
            label="Export without tags (CSV)"
            onExport={() => exportAllTaxonomies('CSV', { includeTags: false })}
          />
        </div>
      </div>
      {terms.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          No taxonomies match your search.
        </p>
      )}
      {[...groups].map(([group, items]) => (
        <section key={group} aria-label={group} className="flex flex-col gap-2">
          <h2 className="font-sans text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {items.map(({ label, route }) => (
              <li key={route}>
                <Link
                  className="no-underline card-lift flex min-h-12 items-center justify-between gap-4 rounded-element bg-card px-4 py-2 text-15 font-medium shadow-soft"
                  to={route}
                >
                  <span className="min-w-0">{label}</span>
                  <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import { getTaxonomyDestinations } from '@/config/taxonomyCatalog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';

export function TaxonomyDirectory() {
  const [search, setSearch] = useState('');
  const terms = getTaxonomyDestinations().filter((term) =>
    `${term.label} ${term.group}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div className="flex flex-col gap-6">
      <AdminArchetypeHeader title="Taxonomies" />
      <p className="max-w-prose text-15 text-muted-foreground">
        Manage categories, tags, amenities, services, and the choices used across content and
        profiles. Deactivate used terms to preserve their existing references.
      </p>
      <div className="flex max-w-md flex-col gap-2">
        <Label htmlFor="taxonomy-search">Find a taxonomy</Label>
        <Input
          id="taxonomy-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          type="search"
          placeholder="Search by name or area"
        />
      </div>
      {terms.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          No taxonomies match your search.
        </p>
      )}
      <ul className="divide-y divide-border">
        {terms.map(({ label, group, route }) => (
          <li key={route}>
            <Link
              className="no-underline flex min-h-12 items-center justify-between gap-4 py-4 text-15 font-medium hover:underline"
              to={route}
            >
              <span>
                {label}
                <span
                  aria-hidden="true"
                  className="block text-sm font-normal text-muted-foreground"
                >
                  {group}
                </span>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

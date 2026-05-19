import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Check, X } from 'lucide-react';

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'date' | 'datetime';
  options?: { value: string; label: string }[];
}

const FIELD_DEFINITIONS: Record<string, FieldDef[]> = {
  venues: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'address', label: 'Address', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'category', label: 'Category', type: 'text' },
    { key: 'website', label: 'Website', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'latitude', label: 'Latitude', type: 'number' },
    { key: 'longitude', label: 'Longitude', type: 'number' },
    { key: 'featured', label: 'Featured', type: 'boolean' },
  ],
  events: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'start_date', label: 'Start Date', type: 'datetime' },
    { key: 'end_date', label: 'End Date', type: 'datetime' },
    { key: 'timezone', label: 'Timezone', type: 'text' },
    { key: 'venue_name', label: 'Venue Name', type: 'text' },
    { key: 'venue_address', label: 'Venue Address', type: 'text' },
    { key: 'website', label: 'Website', type: 'text' },
    { key: 'ticket_url', label: 'Ticket URL', type: 'text' },
    { key: 'featured', label: 'Featured', type: 'boolean' },
  ],
  personalities: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'bio', label: 'Bio', type: 'textarea' },
    { key: 'profession', label: 'Profession', type: 'text' },
    { key: 'lgbti_connection', label: 'LGBTI Connection', type: 'textarea' },
    { key: 'birth_date', label: 'Birth Date', type: 'date' },
    { key: 'death_date', label: 'Death Date', type: 'date' },
    { key: 'birth_place', label: 'Birth Place', type: 'text' },
    { key: 'nationality', label: 'Nationality', type: 'text' },
    { key: 'wikipedia_url', label: 'Wikipedia URL', type: 'text' },
    { key: 'featured', label: 'Featured', type: 'boolean' },
  ],
  news_articles: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'excerpt', label: 'Excerpt', type: 'textarea' },
    { key: 'author', label: 'Author', type: 'text' },
    { key: 'source_name', label: 'Source', type: 'text' },
    { key: 'article_url', label: 'Article URL', type: 'text' },
    { key: 'image_url', label: 'Image URL', type: 'text' },
    { key: 'is_featured', label: 'Featured', type: 'boolean' },
    { key: 'category', label: 'Category', type: 'text' },
  ],
  cities: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'country_id', label: 'Country ID', type: 'text' },
    { key: 'region_name', label: 'Region', type: 'text' },
    { key: 'population', label: 'Population', type: 'number' },
    { key: 'latitude', label: 'Latitude', type: 'number' },
    { key: 'longitude', label: 'Longitude', type: 'number' },
    { key: 'is_capital', label: 'Capital', type: 'boolean' },
    { key: 'is_major_city', label: 'Major City', type: 'boolean' },
    { key: 'lgbt_friendly_rating', label: 'LGBTQ+ Rating', type: 'number' },
    { key: 'official_website', label: 'Website', type: 'text' },
    { key: 'image_url', label: 'Image URL', type: 'text' },
  ],
  hotels: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'hotel_type', label: 'Type', type: 'text' },
    { key: 'address', label: 'Address', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'website', label: 'Website', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'lgbtq_friendly', label: 'LGBTQ+ Friendly', type: 'boolean' },
    { key: 'featured', label: 'Featured', type: 'boolean' },
  ],
};

function getFieldsForEntity(entityType: string, data: Record<string, unknown>): FieldDef[] {
  const defined = FIELD_DEFINITIONS[entityType];
  if (defined) return defined;

  return Object.keys(data)
    .filter((k) => !['id', 'created_at', 'updated_at'].includes(k))
    .slice(0, 20)
    .map((key) => {
      const val = data[key];
      let type: FieldDef['type'] = 'text';
      if (typeof val === 'boolean') type = 'boolean';
      else if (typeof val === 'number') type = 'number';
      else if (typeof val === 'string' && val.length > 100) type = 'textarea';
      return { key, label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), type };
    });
}

function isUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value.startsWith('http://') || value.startsWith('https://');
}

function formatValue(value: unknown, type: FieldDef['type']): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-sm italic text-muted-foreground">—</span>;
  }

  switch (type) {
    case 'boolean':
      return value ? (
        <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
          <Check style={{ width: 12, height: 12 }} />
          Yes
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1">
          <X style={{ width: 12, height: 12 }} />
          No
        </Badge>
      );

    case 'date':
      try {
        return <span className="text-sm">{new Date(String(value)).toLocaleDateString()}</span>;
      } catch {
        return <span className="text-sm">{String(value)}</span>;
      }

    case 'datetime':
      try {
        return <span className="text-sm">{new Date(String(value)).toLocaleString()}</span>;
      } catch {
        return <span className="text-sm">{String(value)}</span>;
      }

    case 'number':
      return (
        <span className="text-sm" style={{ fontFamily: 'monospace' }}>
          {String(value)}
        </span>
      );

    case 'textarea':
      return (
        <p
          className="text-sm"
          style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', lineHeight: 1.4 }}
        >
          {String(value).slice(0, 500)}
          {String(value).length > 500 ? '...' : ''}
        </p>
      );

    default:
      if (isUrl(value)) {
        return (
          <span className="flex items-center gap-1">
            <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))', wordBreak: 'break-all' }}>
              {String(value)}
            </span>
            <a
              href={String(value)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flexShrink: 0 }}
            >
              <ExternalLink style={{ width: 12, height: 12, color: 'hsl(var(--muted-foreground))' }} />
            </a>
          </span>
        );
      }
      return (
        <span className="text-sm" style={{ wordBreak: 'break-word' }}>
          {String(value)}
        </span>
      );
  }
}

interface StructuredFieldDisplayProps {
  entityType: string;
  data: Record<string, unknown>;
  compact?: boolean;
  highlightFields?: string[];
}

export function StructuredFieldDisplay({
  entityType,
  data,
  compact = false,
  highlightFields,
}: StructuredFieldDisplayProps) {
  const fields = getFieldsForEntity(entityType, data);

  if (compact) {
    const keyFields = fields.slice(0, 5);
    return (
      <div className="flex flex-wrap gap-2">
        {keyFields.map((field) => {
          const val = data[field.key];
          if (val === null || val === undefined || val === '') return null;
          return (
            <div key={field.key} className="flex items-center gap-1">
              <span className="text-xs font-medium text-muted-foreground">{field.label}:</span>
              <span className="text-xs">{String(val).slice(0, 60)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="grid gap-2 items-start"
      style={{ gridTemplateColumns: '140px 1fr' }}
    >
      {fields.map((field) => {
        const val = data[field.key];
        const isHighlighted = highlightFields?.includes(field.key);
        return (
          <React.Fragment key={field.key}>
            <span
              className="text-muted-foreground font-semibold uppercase"
              style={{ fontSize: '0.65rem', letterSpacing: 0.5, paddingTop: '2.4px' }}
            >
              {field.label}
            </span>
            <div
              className="rounded-badge"
              style={{
                padding: '2.4px 8px',
                backgroundColor: isHighlighted ? 'rgba(250, 204, 21, 0.15)' : 'transparent',
                border: isHighlighted
                  ? '1px solid rgba(250, 204, 21, 0.3)'
                  : '1px solid transparent',
              }}
            >
              {formatValue(val, field.type)}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { FIELD_DEFINITIONS, getFieldsForEntity };
export type { FieldDef };

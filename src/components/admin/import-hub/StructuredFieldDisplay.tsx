import React from 'react';
import { ExternalLink, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

// Generic fallback: render any key from the data as a text field
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
    return <p className="text-sm italic text-muted-foreground">—</p>;
  }

  switch (type) {
    case 'boolean':
      return value ? (
        <Badge variant="outline" className="gap-1 border-green-600 text-green-700">
          <Check className="h-3 w-3" />
          Yes
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1">
          <X className="h-3 w-3" />
          No
        </Badge>
      );

    case 'date':
      try {
        return <p className="text-sm">{new Date(String(value)).toLocaleDateString()}</p>;
      } catch {
        return <p className="text-sm">{String(value)}</p>;
      }

    case 'datetime':
      try {
        return <p className="text-sm">{new Date(String(value)).toLocaleString()}</p>;
      } catch {
        return <p className="text-sm">{String(value)}</p>;
      }

    case 'number':
      return <p className="text-sm font-mono">{String(value)}</p>;

    case 'textarea':
      return (
        <p className="text-sm whitespace-pre-wrap max-h-[120px] overflow-auto leading-snug">
          {String(value).slice(0, 500)}
          {String(value).length > 500 ? '...' : ''}
        </p>
      );

    default:
      if (isUrl(value)) {
        return (
          <div className="flex items-center gap-1">
            <p className="text-sm text-blue-500 break-all">{String(value)}</p>
            <a
              href={String(value)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0"
            >
              <ExternalLink className="h-3 w-3 text-blue-500" />
            </a>
          </div>
        );
      }
      return <p className="text-sm break-words">{String(value)}</p>;
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
    <div className="grid gap-2 items-start grid-cols-1 sm:grid-cols-[140px_1fr]">
      {fields.map((field) => {
        const val = data[field.key];
        const isHighlighted = highlightFields?.includes(field.key);
        return (
          <React.Fragment key={field.key}>
            <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
              {field.label}
            </span>
            <div
              className={`px-2 py-1 rounded-sm border ${
                isHighlighted
                  ? 'bg-yellow-200/15 border-yellow-300/30'
                  : 'bg-transparent border-transparent'
              }`}
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

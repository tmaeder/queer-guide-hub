import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
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

// Generic fallback: render any key from the data as a text field
function getFieldsForEntity(entityType: string, data: Record<string, unknown>): FieldDef[] {
  const defined = FIELD_DEFINITIONS[entityType];
  if (defined) return defined;

  // Build field defs dynamically from data keys
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
    return (
      <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
        —
      </Typography>
    );
  }

  switch (type) {
    case 'boolean':
      return value ? (
        <Chip
          icon={<Check style={{ width: 12, height: 12 }} />}
          label="Yes"
          size="small"
          color="success"
          variant="outlined"
        />
      ) : (
        <Chip
          icon={<X style={{ width: 12, height: 12 }} />}
          label="No"
          size="small"
          variant="outlined"
        />
      );

    case 'date':
      try {
        return (
          <Typography variant="body2">{new Date(String(value)).toLocaleDateString()}</Typography>
        );
      } catch {
        return <Typography variant="body2">{String(value)}</Typography>;
      }

    case 'datetime':
      try {
        return <Typography variant="body2">{new Date(String(value)).toLocaleString()}</Typography>;
      } catch {
        return <Typography variant="body2">{String(value)}</Typography>;
      }

    case 'number':
      return (
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {String(value)}
        </Typography>
      );

    case 'textarea':
      return (
        <Typography
          variant="body2"
          sx={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', lineHeight: 1.4 }}
        >
          {String(value).slice(0, 500)}
          {String(value).length > 500 ? '...' : ''}
        </Typography>
      );

    default:
      if (isUrl(value)) {
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" sx={{ color: '#3b82f6', wordBreak: 'break-all' }}>
              {String(value)}
            </Typography>
            <a
              href={String(value)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flexShrink: 0 }}
            >
              <ExternalLink style={{ width: 12, height: 12, color: '#3b82f6' }} />
            </a>
          </Box>
        );
      }
      return (
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {String(value)}
        </Typography>
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
    // Single-line badges for key fields (name, city, country, etc.)
    const keyFields = fields.slice(0, 5);
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {keyFields.map((field) => {
          const val = data[field.key];
          if (val === null || val === undefined || val === '') return null;
          return (
            <Box key={field.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography
                variant="caption"
                sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}
              >
                {field.label}:
              </Typography>
              <Typography variant="caption">{String(val).slice(0, 60)}</Typography>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' },
        gap: 1,
        alignItems: 'start',
      }}
    >
      {fields.map((field) => {
        const val = data[field.key];
        const isHighlighted = highlightFields?.includes(field.key);
        return (
          <React.Fragment key={field.key}>
            <Typography
              variant="caption"
              sx={{
                color: 'var(--muted-foreground)',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: '0.65rem',
                letterSpacing: 0.5,
                pt: 0.3,
              }}
            >
              {field.label}
            </Typography>
            <Box
              sx={{
                px: 1,
                py: 0.3,
                borderRadius: 0.5,
                bgcolor: isHighlighted ? 'rgba(250, 204, 21, 0.15)' : 'transparent',
                border: isHighlighted
                  ? '1px solid rgba(250, 204, 21, 0.3)'
                  : '1px solid transparent',
              }}
            >
              {formatValue(val, field.type)}
            </Box>
          </React.Fragment>
        );
      })}
    </Box>
  );
}

export { FIELD_DEFINITIONS, getFieldsForEntity };
export type { FieldDef };

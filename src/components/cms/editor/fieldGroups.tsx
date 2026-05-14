import { Calendar, Clock, Globe, MapPin, Tag, Upload, User, Users, Building, Star, Eye } from 'lucide-react';

export interface FieldConfig {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  readonly?: boolean;
  options?: string[];
  icon?: React.ReactNode;
}

export type FieldGroups = Record<string, FieldConfig[]>;

const icon = (Icon: typeof Tag) => <Icon style={{ height: 16, width: 16 }} />;

export function getFieldGroups(contentType: unknown, formData: Record<string, unknown>): FieldGroups {
  switch (contentType) {
    case 'events':
      return {
        basic: [
          { key: 'name', label: 'Event Name', type: 'text', required: true, icon: icon(Calendar) },
          { key: 'description', label: 'Description', type: 'textarea', icon: icon(Tag) },
          { key: 'event_type', label: 'Event Type', type: 'text', icon: icon(Tag) },
          { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'cancelled'], icon: icon(Star) }
        ],
        datetime: [
          { key: 'start_date', label: 'Start Date', type: 'datetime', icon: icon(Clock) },
          { key: 'end_date', label: 'End Date', type: 'datetime', icon: icon(Clock) },
          { key: 'is_recurring', label: 'Recurring Event', type: 'boolean', icon: icon(Clock) }
        ],
        location: [
          { key: 'venue_id', label: 'Venue', type: 'text', icon: icon(MapPin) },
          { key: 'address', label: 'Address', type: 'text', icon: icon(MapPin) },
          { key: 'latitude', label: 'Latitude', type: 'number', icon: icon(MapPin) },
          { key: 'longitude', label: 'Longitude', type: 'number', icon: icon(MapPin) }
        ],
        details: [
          { key: 'price', label: 'Price', type: 'number', icon: icon(Tag) },
          { key: 'capacity', label: 'Capacity', type: 'number', icon: icon(Users) },
          { key: 'age_restriction', label: 'Age Restriction', type: 'text', icon: icon(Users) },
          { key: 'website', label: 'Website', type: 'url', icon: icon(Globe) },
          { key: 'image_url', label: 'Image URL', type: 'url', icon: icon(Upload) }
        ]
      };

    case 'venues':
      return {
        basic: [
          { key: 'name', label: 'Venue Name', type: 'text', required: true, icon: icon(Building) },
          { key: 'description', label: 'Description', type: 'textarea', icon: icon(Tag) },
          { key: 'venue_type', label: 'Venue Type', type: 'text', icon: icon(Building) },
          { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'temporarily_closed'], icon: icon(Star) }
        ],
        location: [
          { key: 'address', label: 'Address', type: 'text', icon: icon(MapPin) },
          { key: 'city', label: 'City', type: 'text', icon: icon(MapPin) },
          { key: 'country', label: 'Country', type: 'text', icon: icon(MapPin) },
          { key: 'latitude', label: 'Latitude', type: 'number', icon: icon(MapPin) },
          { key: 'longitude', label: 'Longitude', type: 'number', icon: icon(MapPin) }
        ],
        contact: [
          { key: 'phone', label: 'Phone', type: 'tel', icon: icon(Users) },
          { key: 'email', label: 'Email', type: 'email', icon: icon(Users) },
          { key: 'website', label: 'Website', type: 'url', icon: icon(Globe) },
          { key: 'social_media', label: 'Social Media', type: 'json', icon: icon(Globe) }
        ],
        details: [
          { key: 'capacity', label: 'Capacity', type: 'number', icon: icon(Users) },
          { key: 'accessibility_features', label: 'Accessibility Features', type: 'array', icon: icon(Users) },
          { key: 'amenities', label: 'Amenities', type: 'array', icon: icon(Star) },
          { key: 'image_url', label: 'Image URL', type: 'url', icon: icon(Upload) }
        ]
      };

    case 'personalities':
      return {
        basic: [
          { key: 'name', label: 'Name', type: 'text', required: true, icon: icon(User) },
          { key: 'bio', label: 'Biography', type: 'textarea', icon: icon(Tag) },
          { key: 'profession', label: 'Profession', type: 'text', icon: icon(Building) },
          { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'], icon: icon(Star) }
        ],
        personal: [
          { key: 'birth_date', label: 'Birth Date', type: 'date', icon: icon(Calendar) },
          { key: 'death_date', label: 'Death Date', type: 'date', icon: icon(Calendar) },
          { key: 'nationality', label: 'Nationality', type: 'text', icon: icon(Globe) },
          { key: 'gender', label: 'Gender', type: 'text', icon: icon(User) }
        ],
        media: [
          { key: 'image_url', label: 'Profile Image', type: 'url', icon: icon(Upload) },
          { key: 'website', label: 'Website', type: 'url', icon: icon(Globe) },
          { key: 'social_links', label: 'Social Links', type: 'json', icon: icon(Globe) }
        ],
        metadata: [
          { key: 'tags', label: 'Tags', type: 'array', icon: icon(Tag) },
          { key: 'categories', label: 'Categories', type: 'array', icon: icon(Tag) },
          { key: 'view_count', label: 'View Count', type: 'number', readonly: true, icon: icon(Eye) }
        ]
      };

    case 'community_groups':
      return {
        basic: [
          { key: 'name', label: 'Group Name', type: 'text', required: true, icon: icon(Users) },
          { key: 'description', label: 'Description', type: 'textarea', icon: icon(Tag) },
          { key: 'rules', label: 'Group Rules', type: 'textarea', icon: icon(Tag) }
        ],
        settings: [
          { key: 'is_private', label: 'Private Group', type: 'boolean', icon: icon(Users) },
          { key: 'member_count', label: 'Member Count', type: 'number', readonly: true, icon: icon(Users) }
        ],
        media: [
          { key: 'image_url', label: 'Group Image', type: 'url', icon: icon(Upload) },
          { key: 'tags', label: 'Tags', type: 'array', icon: icon(Tag) }
        ]
      };

    case 'community_posts':
      return {
        basic: [
          { key: 'content', label: 'Post Content', type: 'textarea', required: true, icon: icon(Tag) },
          { key: 'post_type', label: 'Post Type', type: 'select', options: ['text', 'image', 'link', 'poll'], icon: icon(Tag) }
        ],
        settings: [
          { key: 'visibility', label: 'Visibility', type: 'select', options: ['public', 'private', 'friends'], icon: icon(Eye) },
          { key: 'pinned', label: 'Pinned Post', type: 'boolean', icon: icon(Star) }
        ],
        engagement: [
          { key: 'likes_count', label: 'Likes', type: 'number', readonly: true, icon: icon(Star) },
          { key: 'comments_count', label: 'Comments', type: 'number', readonly: true, icon: icon(Users) },
          { key: 'shares_count', label: 'Shares', type: 'number', readonly: true, icon: icon(Globe) }
        ],
        media: [
          { key: 'images', label: 'Images', type: 'array', icon: icon(Upload) },
          { key: 'link_url', label: 'Link URL', type: 'url', icon: icon(Globe) },
          { key: 'tags', label: 'Tags', type: 'array', icon: icon(Tag) }
        ]
      };

    case 'cms_content':
      return {
        basic: [
          { key: 'title', label: 'Title', type: 'text', required: true, icon: icon(Tag) },
          { key: 'description', label: 'Description', type: 'textarea', icon: icon(Tag) },
          { key: 'content_type', label: 'Content Type', type: 'select', options: ['page', 'article', 'blog_post'], icon: icon(Tag) },
          { key: 'workflow_state', label: 'Workflow State', type: 'select', options: ['draft', 'review', 'published', 'archived'], icon: icon(Star) }
        ],
        settings: [
          { key: 'visibility_level', label: 'Visibility', type: 'select', options: ['public', 'private', 'restricted'], icon: icon(Eye) },
          { key: 'featured_weight', label: 'Featured Weight', type: 'number', icon: icon(Star) }
        ],
        meta: [
          { key: 'meta_title', label: 'Meta Title', type: 'text', icon: icon(Globe) },
          { key: 'meta_description', label: 'Meta Description', type: 'textarea', icon: icon(Globe) },
          { key: 'slug', label: 'URL Slug', type: 'text', icon: icon(Globe) },
          { key: 'tags', label: 'Tags', type: 'array', icon: icon(Tag) }
        ]
      };

    case 'news_articles':
      return {
        basic: [
          { key: 'title', label: 'Article Title', type: 'text', required: true, icon: icon(Tag) },
          { key: 'description', label: 'Description', type: 'textarea', icon: icon(Tag) },
          { key: 'excerpt', label: 'Excerpt', type: 'textarea', icon: icon(Tag) },
          { key: 'content', label: 'Article Content', type: 'textarea', icon: icon(Tag) }
        ],
        meta: [
          { key: 'author', label: 'Author', type: 'text', icon: icon(User) },
          { key: 'category', label: 'Category', type: 'text', icon: icon(Tag) },
          { key: 'status', label: 'Status', type: 'select', options: ['draft', 'published', 'archived'], icon: icon(Star) },
          { key: 'published_at', label: 'Published Date', type: 'datetime', icon: icon(Calendar) }
        ],
        media: [
          { key: 'image_url', label: 'Featured Image', type: 'url', icon: icon(Upload) },
          { key: 'source_url', label: 'Source URL', type: 'url', icon: icon(Globe) }
        ],
        settings: [
          { key: 'is_featured', label: 'Featured Article', type: 'boolean', icon: icon(Star) },
          { key: 'views_count', label: 'Views', type: 'number', readonly: true, icon: icon(Eye) },
          { key: 'tags', label: 'Tags', type: 'array', icon: icon(Tag) }
        ]
      };

    case 'tags':
      return {
        basic: [
          { key: 'name', label: 'Tag Name', type: 'text', required: true, icon: icon(Tag) },
          { key: 'description', label: 'Description', type: 'textarea', icon: icon(Tag) },
          { key: 'category', label: 'Category', type: 'text', icon: icon(Tag) },
          { key: 'slug', label: 'URL Slug', type: 'text', icon: icon(Globe) }
        ],
        appearance: [
          { key: 'color', label: 'Tag Color', type: 'text', icon: icon(Star) },
          { key: 'image_url', label: 'Tag Image', type: 'url', icon: icon(Upload) }
        ],
        metadata: [
          { key: 'usage_count', label: 'Usage Count', type: 'number', readonly: true, icon: icon(Users) },
          { key: 'wikipedia_url', label: 'Wikipedia URL', type: 'url', icon: icon(Globe) }
        ]
      };

    case 'cities':
      return {
        basic: [
          { key: 'name', label: 'City Name', type: 'text', required: true, icon: icon(Building) },
          { key: 'description', label: 'Description', type: 'textarea', icon: icon(Tag) },
          { key: 'region_name', label: 'Region', type: 'text', icon: icon(MapPin) }
        ],
        location: [
          { key: 'latitude', label: 'Latitude', type: 'number', icon: icon(MapPin) },
          { key: 'longitude', label: 'Longitude', type: 'number', icon: icon(MapPin) },
          { key: 'timezone', label: 'Timezone', type: 'text', icon: icon(Clock) }
        ],
        details: [
          { key: 'population', label: 'Population', type: 'number', icon: icon(Users) },
          { key: 'is_capital', label: 'Is Capital', type: 'boolean', icon: icon(Star) },
          { key: 'is_major_city', label: 'Is Major City', type: 'boolean', icon: icon(Star) },
          { key: 'image_url', label: 'City Image', type: 'url', icon: icon(Upload) }
        ]
      };

    case 'countries':
      return {
        basic: [
          { key: 'name', label: 'Country Name', type: 'text', required: true, icon: icon(Globe) },
          { key: 'code', label: 'Country Code', type: 'text', icon: icon(Globe) },
          { key: 'description', label: 'Description', type: 'textarea', icon: icon(Tag) },
          { key: 'capital', label: 'Capital City', type: 'text', icon: icon(Building) }
        ],
        details: [
          { key: 'population', label: 'Population', type: 'number', icon: icon(Users) },
          { key: 'area_km2', label: 'Area (km²)', type: 'number', icon: icon(MapPin) },
          { key: 'currency', label: 'Currency', type: 'text', icon: icon(Tag) },
          { key: 'languages', label: 'Languages', type: 'array', icon: icon(Globe) }
        ],
        location: [
          { key: 'latitude', label: 'Latitude', type: 'number', icon: icon(MapPin) },
          { key: 'longitude', label: 'Longitude', type: 'number', icon: icon(MapPin) },
          { key: 'timezone', label: 'Timezone', type: 'text', icon: icon(Clock) }
        ]
      };

    case 'marketplace_listings':
      return {
        basic: [
          { key: 'title', label: 'Listing Title', type: 'text', required: true, icon: icon(Tag) },
          { key: 'business_name', label: 'Business Name', type: 'text', icon: icon(Building) },
          { key: 'description', label: 'Description', type: 'textarea', icon: icon(Tag) },
          { key: 'category', label: 'Category', type: 'text', icon: icon(Tag) }
        ],
        pricing: [
          { key: 'price', label: 'Price', type: 'number', icon: icon(Tag) },
          { key: 'currency', label: 'Currency', type: 'text', icon: icon(Tag) },
          { key: 'business_type', label: 'Business Type', type: 'text', icon: icon(Building) }
        ],
        contact: [
          { key: 'contact_email', label: 'Contact Email', type: 'email', icon: icon(Users) },
          { key: 'contact_phone', label: 'Contact Phone', type: 'tel', icon: icon(Users) },
          { key: 'website', label: 'Website', type: 'url', icon: icon(Globe) }
        ],
        details: [
          { key: 'location', label: 'Location', type: 'text', icon: icon(MapPin) },
          { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'pending'], icon: icon(Star) },
          { key: 'images', label: 'Images', type: 'array', icon: icon(Upload) }
        ]
      };

    default: {
      const allFields = Object.keys(formData).filter(key => !['id', 'created_at', 'updated_at', 'content_type'].includes(key));

      const categorize = (patterns: string[]) =>
        allFields.filter(key => patterns.some(p => key.includes(p)));

      const basicFields = categorize(['name', 'title', 'description', 'bio', 'content', 'slug', 'type', 'category', 'status']);
      const locationFields = categorize(['latitude', 'longitude', 'address', 'city', 'country', 'location', 'timezone', 'region']);
      const mediaFields = categorize(['image_url', 'images', 'video', 'audio', 'media', 'avatar', 'photo', 'picture']);
      const contactFields = categorize(['email', 'phone', 'website', 'social', 'contact']);
      const metaFields = categorize(['tags', 'categories', 'meta_', 'seo_', 'keywords', 'featured', 'priority', 'weight', 'order']);
      const statsFields = categorize(['count', 'views', 'likes', 'shares', 'rating', 'score', 'popularity', 'usage']);
      const dateFields = categorize(['_at', '_date', 'published', 'expires', 'start', 'end', 'birth', 'death']);
      const assigned = [...basicFields, ...locationFields, ...mediaFields, ...contactFields, ...metaFields, ...statsFields, ...dateFields];
      const otherFields = allFields.filter(key => !assigned.includes(key));

      const toFields = (keys: string[], defaultIcon: typeof Tag, readonly = false): FieldConfig[] =>
        keys.map(key => ({
          key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          type: 'auto',
          icon: icon(defaultIcon),
          ...(readonly && { readonly: true }),
        }));

      const fieldGroups: FieldGroups = {};
      if (basicFields.length) fieldGroups.basic = toFields(basicFields, Tag);
      if (locationFields.length) fieldGroups.location = toFields(locationFields, MapPin);
      if (contactFields.length) fieldGroups.contact = toFields(contactFields, Users);
      if (mediaFields.length) fieldGroups.media = toFields(mediaFields, Upload);
      if (dateFields.length) fieldGroups.dates = toFields(dateFields, Calendar);
      if (metaFields.length) fieldGroups.metadata = toFields(metaFields, Tag);
      if (statsFields.length) fieldGroups.statistics = toFields(statsFields, Star, true);
      if (otherFields.length) fieldGroups.other = toFields(otherFields, Tag);

      if (Object.keys(fieldGroups).length === 0) {
        fieldGroups.basic = toFields(allFields, Tag);
      }

      return fieldGroups;
    }
  }
}

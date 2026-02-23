/**
 * Content Type Registry
 * Central configuration mapping each content type to its table, fields, validation, and UI.
 * Powers the dynamic CMS editor — no hardcoded forms per content type.
 */

import {
  Building,
  Calendar,
  Users,
  Newspaper,
  MapPin,
  Globe,
  Tag,
  ShoppingBag,
  UsersRound,
  FileText,
} from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import {
  validateVenue,
  validateEvent,
  validateNewsArticle,
} from '@/utils/contentValidation';

// ── Venue Fields ───────────────────────────────────────────────────

const venueFields: FieldConfig[] = [
  // Basic
  { name: 'name', label: 'Name', type: 'text', required: true, group: 'basic', searchable: true, sortable: true, maxLength: 255 },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'category', label: 'Category', type: 'select', required: true, group: 'basic', filterable: true, options: [
    { value: 'bar', label: 'Bar' }, { value: 'club', label: 'Club' }, { value: 'restaurant', label: 'Restaurant' },
    { value: 'cafe', label: 'Café' }, { value: 'sauna', label: 'Sauna' }, { value: 'hotel', label: 'Hotel' },
    { value: 'shop', label: 'Shop' }, { value: 'community_center', label: 'Community Center' },
    { value: 'beach', label: 'Beach' }, { value: 'cruise_club', label: 'Cruise Club' },
    { value: 'theater', label: 'Theater' }, { value: 'gallery', label: 'Gallery' },
    { value: 'bookstore', label: 'Bookstore' }, { value: 'gym', label: 'Gym' }, { value: 'other', label: 'Other' },
  ]},
  // Location
  { name: 'address', label: 'Address', type: 'location', group: 'location', resolverType: 'address',
    relatedFields: { city: 'city', state: 'state', country: 'country', postal_code: 'postal_code', latitude: 'latitude', longitude: 'longitude', city_id: 'city_id', country_id: 'country_id' } },
  { name: 'city', label: 'City', type: 'text', required: true, group: 'location', filterable: true },
  { name: 'state', label: 'State/Province', type: 'text', group: 'location' },
  { name: 'country', label: 'Country', type: 'text', required: true, group: 'location', filterable: true },
  { name: 'postal_code', label: 'Postal Code', type: 'text', group: 'location' },
  { name: 'latitude', label: 'Latitude', type: 'number', group: 'location', hidden: true, min: -90, max: 90 },
  { name: 'longitude', label: 'Longitude', type: 'number', group: 'location', hidden: true, min: -180, max: 180 },
  // Details
  { name: 'phone', label: 'Phone', type: 'phone', group: 'details' },
  { name: 'email', label: 'Email', type: 'email', group: 'details' },
  { name: 'website', label: 'Website', type: 'url', group: 'details' },
  { name: 'instagram', label: 'Instagram', type: 'text', group: 'details', placeholder: '@handle' },
  { name: 'price_range', label: 'Price Range', type: 'select', group: 'details', options: [
    { value: '1', label: '$ (Budget)' }, { value: '2', label: '$$ (Mid-range)' },
    { value: '3', label: '$$$ (Upscale)' }, { value: '4', label: '$$$$ (Fine Dining)' },
  ]},
  { name: 'hours', label: 'Opening Hours', type: 'json', group: 'details', helpText: 'JSON with day names as keys' },
  { name: 'amenities', label: 'Amenities', type: 'tags', group: 'details' },
  { name: 'services', label: 'Services', type: 'tags', group: 'details' },
  { name: 'tags', label: 'Tags', type: 'tags', group: 'details' },
  { name: 'accessibility_attributes', label: 'Accessibility', type: 'tags', group: 'details' },
  { name: 'target_groups', label: 'Target Groups', type: 'tags', group: 'details' },
  { name: 'accessibility_notes', label: 'Accessibility Notes', type: 'textarea', group: 'details' },
  // Media
  { name: 'images', label: 'Images', type: 'images', group: 'media' },
  // Settings
  { name: 'featured', label: 'Featured', type: 'boolean', group: 'settings' },
  { name: 'verified', label: 'Verified', type: 'boolean', group: 'settings' },
  // External (read-only)
  { name: 'foursquare_id', label: 'Foursquare ID', type: 'text', group: 'external', readOnly: true },
  { name: 'foursquare_rating', label: 'Foursquare Rating', type: 'number', group: 'external', readOnly: true },
  { name: 'data_source', label: 'Data Source', type: 'text', group: 'external', readOnly: true },
  { name: 'city_id', label: 'City Reference', type: 'text', group: 'external', hidden: true },
  { name: 'country_id', label: 'Country Reference', type: 'text', group: 'external', hidden: true },
];

// ── Event Fields ───────────────────────────────────────────────────

const eventFields: FieldConfig[] = [
  { name: 'title', label: 'Title', type: 'text', required: true, group: 'basic', searchable: true, sortable: true, maxLength: 255 },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'event_type', label: 'Event Type', type: 'select', required: true, group: 'basic', filterable: true, options: [
    { value: 'party', label: 'Party' }, { value: 'festival', label: 'Festival' }, { value: 'pride', label: 'Pride' },
    { value: 'meetup', label: 'Meetup' }, { value: 'workshop', label: 'Workshop' }, { value: 'concert', label: 'Concert' },
    { value: 'exhibition', label: 'Exhibition' }, { value: 'fundraiser', label: 'Fundraiser' },
    { value: 'sports', label: 'Sports' }, { value: 'community', label: 'Community' }, { value: 'other', label: 'Other' },
  ]},
  { name: 'start_date', label: 'Start Date', type: 'datetime', required: true, group: 'basic', sortable: true },
  { name: 'end_date', label: 'End Date', type: 'datetime', group: 'basic' },
  { name: 'timezone', label: 'Timezone', type: 'text', group: 'basic' },
  { name: 'status', label: 'Status', type: 'select', group: 'basic', filterable: true, options: [
    { value: 'active', label: 'Active' }, { value: 'cancelled', label: 'Cancelled' },
    { value: 'postponed', label: 'Postponed' }, { value: 'completed', label: 'Completed' },
  ]},
  // Location
  { name: 'venue_name', label: 'Venue Name', type: 'text', group: 'location' },
  { name: 'venue_address', label: 'Venue Address', type: 'text', group: 'location' },
  { name: 'address', label: 'Address', type: 'location', group: 'location', resolverType: 'address',
    relatedFields: { city: 'city', state: 'state', country: 'country', latitude: 'latitude', longitude: 'longitude', city_id: 'city_id', country_id: 'country_id' } },
  { name: 'city', label: 'City', type: 'text', required: true, group: 'location', filterable: true },
  { name: 'state', label: 'State', type: 'text', group: 'location' },
  { name: 'country', label: 'Country', type: 'text', required: true, group: 'location', filterable: true },
  { name: 'latitude', label: 'Latitude', type: 'number', group: 'location', hidden: true, min: -90, max: 90 },
  { name: 'longitude', label: 'Longitude', type: 'number', group: 'location', hidden: true, min: -180, max: 180 },
  // Details
  { name: 'website', label: 'Website', type: 'url', group: 'details' },
  { name: 'ticket_url', label: 'Ticket URL', type: 'url', group: 'details' },
  { name: 'price_min', label: 'Min Price', type: 'number', group: 'details', min: 0 },
  { name: 'price_max', label: 'Max Price', type: 'number', group: 'details', min: 0 },
  { name: 'is_free', label: 'Free Event', type: 'boolean', group: 'details' },
  { name: 'age_restriction', label: 'Age Restriction', type: 'text', group: 'details' },
  { name: 'max_attendees', label: 'Max Attendees', type: 'number', group: 'details', min: 0 },
  { name: 'organizer_name', label: 'Organizer', type: 'text', group: 'details' },
  { name: 'organizer_contact', label: 'Organizer Contact', type: 'text', group: 'details' },
  { name: 'is_recurring', label: 'Recurring', type: 'boolean', group: 'details' },
  { name: 'recurrence_pattern', label: 'Recurrence Pattern', type: 'text', group: 'details' },
  { name: 'accessibility_attributes', label: 'Accessibility', type: 'tags', group: 'details' },
  { name: 'target_groups', label: 'Target Groups', type: 'tags', group: 'details' },
  // Media
  { name: 'images', label: 'Images', type: 'images', group: 'media' },
  // Settings
  { name: 'featured', label: 'Featured', type: 'boolean', group: 'settings' },
  { name: 'is_public', label: 'Public', type: 'boolean', group: 'settings' },
  // External (hidden FKs)
  { name: 'venue_id', label: 'Venue Reference', type: 'text', group: 'external', hidden: true },
  { name: 'city_id', label: 'City Reference', type: 'text', group: 'external', hidden: true },
  { name: 'country_id', label: 'Country Reference', type: 'text', group: 'external', hidden: true },
];

// ── Personality Fields ─────────────────────────────────────────────

const personalityFields: FieldConfig[] = [
  { name: 'name', label: 'Name', type: 'text', required: true, group: 'basic', searchable: true, sortable: true, maxLength: 255 },
  { name: 'pronouns', label: 'Pronouns', type: 'text', group: 'basic' },
  { name: 'profession', label: 'Profession', type: 'text', group: 'basic', searchable: true },
  { name: 'description', label: 'Short Description', type: 'textarea', group: 'basic', colSpan: 2 },
  { name: 'bio', label: 'Biography', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'birth_date', label: 'Birth Date', type: 'date', group: 'details' },
  { name: 'death_date', label: 'Death Date', type: 'date', group: 'details' },
  { name: 'is_living', label: 'Living', type: 'boolean', group: 'details' },
  { name: 'nationality', label: 'Nationality', type: 'text', group: 'details', resolverType: 'nationality',
    relatedFields: { country_id: 'country_id' } },
  { name: 'birth_place', label: 'Birth Place', type: 'text', group: 'details', resolverType: 'birthplace',
    relatedFields: { city_id: 'city_id', country_id: 'country_id' }, placeholder: 'City, Country' },
  { name: 'website_url', label: 'Website', type: 'url', group: 'details' },
  { name: 'social_links', label: 'Social Links', type: 'json', group: 'details' },
  { name: 'fields', label: 'Fields/Disciplines', type: 'json', group: 'details' },
  { name: 'achievements', label: 'Achievements', type: 'json', group: 'details' },
  { name: 'tags', label: 'Tags', type: 'tags', group: 'details' },
  // LGBTQ
  { name: 'lgbti_connection', label: 'LGBTQ+ Connection', type: 'textarea', group: 'lgbtq', colSpan: 2 },
  { name: 'lgbti_details', label: 'LGBTQ+ Details', type: 'textarea', group: 'lgbtq', colSpan: 2 },
  // Media
  { name: 'image_url', label: 'Profile Image', type: 'image', group: 'media' },
  // Settings
  { name: 'is_featured', label: 'Featured', type: 'boolean', group: 'settings' },
  { name: 'verification_status', label: 'Verification', type: 'select', group: 'settings', options: [
    { value: 'pending', label: 'Pending' }, { value: 'verified', label: 'Verified' }, { value: 'rejected', label: 'Rejected' },
  ]},
  { name: 'visibility', label: 'Visibility', type: 'select', group: 'settings', options: [
    { value: 'public', label: 'Public' }, { value: 'private', label: 'Private' }, { value: 'restricted', label: 'Restricted' },
  ]},
  // External (hidden FKs — auto-populated by address resolver)
  { name: 'city_id', label: 'City Reference', type: 'text', group: 'external', hidden: true },
  { name: 'country_id', label: 'Country Reference', type: 'text', group: 'external', hidden: true },
];

// ── News Article Fields ────────────────────────────────────────────

const newsArticleFields: FieldConfig[] = [
  { name: 'title', label: 'Title', type: 'text', required: true, group: 'basic', searchable: true, sortable: true, maxLength: 255 },
  { name: 'excerpt', label: 'Excerpt', type: 'textarea', group: 'basic' },
  { name: 'content', label: 'Content', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'url', label: 'Source URL', type: 'url', required: true, group: 'basic' },
  { name: 'author', label: 'Author', type: 'text', group: 'basic' },
  { name: 'category', label: 'Category', type: 'select', required: true, group: 'basic', filterable: true, options: [
    { value: 'general', label: 'General' }, { value: 'politics', label: 'Politics' },
    { value: 'culture', label: 'Culture' }, { value: 'health', label: 'Health' },
    { value: 'travel', label: 'Travel' }, { value: 'community', label: 'Community' },
    { value: 'rights', label: 'Rights' }, { value: 'entertainment', label: 'Entertainment' },
  ]},
  { name: 'published_at', label: 'Published At', type: 'datetime', group: 'basic', sortable: true },
  { name: 'sentiment', label: 'Sentiment', type: 'select', group: 'details', filterable: true, options: [
    { value: 'positive', label: 'Positive' }, { value: 'neutral', label: 'Neutral' }, { value: 'negative', label: 'Negative' },
  ]},
  { name: 'tags', label: 'Tags', type: 'tags', group: 'details' },
  { name: 'image_url', label: 'Image', type: 'image', group: 'media' },
  { name: 'is_featured', label: 'Featured', type: 'boolean', group: 'settings' },
];

// ── City Fields ────────────────────────────────────────────────────

const cityFields: FieldConfig[] = [
  { name: 'name', label: 'City Name', type: 'text', required: true, group: 'basic', searchable: true, sortable: true },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'region_name', label: 'Region', type: 'text', group: 'basic' },
  { name: 'population', label: 'Population', type: 'number', group: 'details', sortable: true },
  { name: 'is_capital', label: 'Capital City', type: 'boolean', group: 'details' },
  { name: 'is_major_city', label: 'Major City', type: 'boolean', group: 'details' },
  { name: 'latitude', label: 'Latitude', type: 'number', group: 'location', min: -90, max: 90 },
  { name: 'longitude', label: 'Longitude', type: 'number', group: 'location', min: -180, max: 180 },
  { name: 'timezone', label: 'Timezone', type: 'text', group: 'location' },
  { name: 'elevation_m', label: 'Elevation (m)', type: 'number', group: 'details' },
  { name: 'climate_type', label: 'Climate', type: 'text', group: 'details' },
  { name: 'founded_year', label: 'Founded Year', type: 'number', group: 'details' },
  { name: 'area_km2', label: 'Area (km²)', type: 'number', group: 'details' },
  { name: 'local_language', label: 'Local Language', type: 'text', group: 'details' },
  { name: 'official_website', label: 'Official Website', type: 'url', group: 'details' },
  { name: 'major_airport_code', label: 'Airport Code', type: 'text', group: 'details' },
  { name: 'best_time_to_visit', label: 'Best Time to Visit', type: 'text', group: 'details' },
  { name: 'local_customs', label: 'Local Customs', type: 'textarea', group: 'details' },
  { name: 'lgbt_friendly_rating', label: 'LGBTQ+ Friendly Rating', type: 'number', group: 'lgbtq', min: 0, max: 10 },
  { name: 'image_url', label: 'City Image', type: 'image', group: 'media' },
  { name: 'country_id', label: 'Country Reference', type: 'text', group: 'external', hidden: true },
];

// ── Country Fields ─────────────────────────────────────────────────

const countryFields: FieldConfig[] = [
  { name: 'name', label: 'Country Name', type: 'text', required: true, group: 'basic', searchable: true, sortable: true },
  { name: 'code', label: 'Country Code', type: 'text', required: true, group: 'basic', maxLength: 3 },
  { name: 'flag_emoji', label: 'Flag Emoji', type: 'text', group: 'basic' },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'capital', label: 'Capital', type: 'text', group: 'details' },
  { name: 'population', label: 'Population', type: 'number', group: 'details', sortable: true },
  { name: 'area_km2', label: 'Area (km²)', type: 'number', group: 'details' },
  { name: 'currency', label: 'Currency', type: 'text', group: 'details' },
  { name: 'calling_code', label: 'Calling Code', type: 'text', group: 'details' },
  { name: 'internet_tld', label: 'Internet TLD', type: 'text', group: 'details' },
  { name: 'driving_side', label: 'Driving Side', type: 'select', group: 'details', options: [
    { value: 'right', label: 'Right' }, { value: 'left', label: 'Left' },
  ]},
  { name: 'government_type', label: 'Government Type', type: 'text', group: 'details' },
  { name: 'continent', label: 'Continent', type: 'text', group: 'details' },
  { name: 'latitude', label: 'Latitude', type: 'number', group: 'location', min: -90, max: 90 },
  { name: 'longitude', label: 'Longitude', type: 'number', group: 'location', min: -180, max: 180 },
  // LGBTQ
  { name: 'equality_score', label: 'Equality Score', type: 'number', group: 'lgbtq', min: 0, max: 100 },
  { name: 'lgbt_rights_status', label: 'LGBTQ+ Rights Status', type: 'text', group: 'lgbtq' },
  { name: 'lgbt_legal_status', label: 'Legal Status', type: 'text', group: 'lgbtq' },
  { name: 'lgbti_same_sex_unions', label: 'Same-Sex Unions', type: 'text', group: 'lgbtq' },
  { name: 'lgbti_adoption_rights', label: 'Adoption Rights', type: 'text', group: 'lgbtq' },
  { name: 'lgbti_conversion_therapy_regulation', label: 'Conversion Therapy', type: 'text', group: 'lgbtq' },
  { name: 'lgbti_intersex_protection', label: 'Intersex Protection', type: 'text', group: 'lgbtq' },
  { name: 'lgbti_criminalization', label: 'Criminalization Data', type: 'json', group: 'lgbtq', readOnly: true },
  { name: 'lgbti_employment_protection', label: 'Employment Protection', type: 'json', group: 'lgbtq', readOnly: true },
  { name: 'lgbti_constitutional_protection', label: 'Constitutional Protection', type: 'json', group: 'lgbtq', readOnly: true },
  { name: 'lgbti_gender_recognition', label: 'Gender Recognition', type: 'json', group: 'lgbtq', readOnly: true },
];

// ── Tag Fields ─────────────────────────────────────────────────────

const tagFields: FieldConfig[] = [
  { name: 'name', label: 'Tag Name', type: 'text', required: true, group: 'basic', searchable: true, sortable: true },
  { name: 'slug', label: 'Slug', type: 'text', required: true, group: 'basic' },
  { name: 'description', label: 'Description', type: 'textarea', group: 'basic', colSpan: 2 },
  { name: 'category', label: 'Category', type: 'text', group: 'basic', filterable: true },
  { name: 'color', label: 'Color', type: 'text', group: 'details', placeholder: '#6366f1' },
  { name: 'usage_count', label: 'Usage Count', type: 'number', group: 'details', readOnly: true, sortable: true },
  { name: 'wikipedia_url', label: 'Wikipedia URL', type: 'url', group: 'details' },
  { name: 'image_url', label: 'Image', type: 'image', group: 'media' },
];

// ── Marketplace Fields ─────────────────────────────────────────────

const marketplaceFields: FieldConfig[] = [
  { name: 'title', label: 'Title', type: 'text', required: true, group: 'basic', searchable: true, sortable: true },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'category', label: 'Category', type: 'text', required: true, group: 'basic', filterable: true },
  { name: 'subcategory', label: 'Subcategory', type: 'text', group: 'basic' },
  { name: 'business_name', label: 'Business Name', type: 'text', required: true, group: 'basic' },
  { name: 'business_type', label: 'Business Type', type: 'text', group: 'basic' },
  { name: 'price', label: 'Price', type: 'number', group: 'details', min: 0 },
  { name: 'price_type', label: 'Price Type', type: 'select', group: 'details', options: [
    { value: 'fixed', label: 'Fixed' }, { value: 'negotiable', label: 'Negotiable' },
    { value: 'free', label: 'Free' }, { value: 'contact', label: 'Contact for Price' },
  ]},
  { name: 'currency', label: 'Currency', type: 'text', group: 'details' },
  { name: 'contact_email', label: 'Contact Email', type: 'email', group: 'details' },
  { name: 'contact_phone', label: 'Contact Phone', type: 'phone', group: 'details' },
  { name: 'website', label: 'Website', type: 'url', group: 'details' },
  { name: 'location', label: 'Location', type: 'text', group: 'location' },
  { name: 'shipping_available', label: 'Shipping Available', type: 'boolean', group: 'details' },
  { name: 'shipping_info', label: 'Shipping Info', type: 'text', group: 'details' },
  { name: 'images', label: 'Images', type: 'images', group: 'media' },
  { name: 'featured', label: 'Featured', type: 'boolean', group: 'settings' },
  { name: 'status', label: 'Status', type: 'select', group: 'settings', filterable: true, options: [
    { value: 'active', label: 'Active' }, { value: 'sold', label: 'Sold' },
    { value: 'expired', label: 'Expired' }, { value: 'draft', label: 'Draft' },
  ]},
];

// ── Community Group Fields ─────────────────────────────────────────

const groupFields: FieldConfig[] = [
  { name: 'name', label: 'Group Name', type: 'text', required: true, group: 'basic', searchable: true, sortable: true },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'rules', label: 'Group Rules', type: 'textarea', group: 'details', colSpan: 2 },
  { name: 'tags', label: 'Tags', type: 'tags', group: 'details' },
  { name: 'image_url', label: 'Group Image', type: 'image', group: 'media' },
  { name: 'is_private', label: 'Private Group', type: 'boolean', group: 'settings' },
  { name: 'member_count', label: 'Member Count', type: 'number', group: 'settings', readOnly: true, sortable: true },
];

// ── CMS Pages Fields ───────────────────────────────────────────────

const pageFields: FieldConfig[] = [
  { name: 'title', label: 'Title', type: 'text', required: true, group: 'basic', searchable: true, sortable: true },
  { name: 'slug', label: 'Slug', type: 'text', required: true, group: 'basic' },
  { name: 'subtitle', label: 'Subtitle', type: 'text', group: 'basic' },
  { name: 'excerpt', label: 'Excerpt', type: 'textarea', group: 'basic', helpText: 'Short summary for listings' },
  { name: 'page_type', label: 'Page Type', type: 'select', required: true, group: 'basic', filterable: true, options: [
    { value: 'page', label: 'Static Page' }, { value: 'blog_post', label: 'Blog Post' },
    { value: 'guide', label: 'Guide' }, { value: 'resource', label: 'Resource' },
  ]},
  { name: 'category', label: 'Category', type: 'text', group: 'basic', filterable: true },
  { name: 'tags', label: 'Tags', type: 'tags', group: 'basic' },
  // SEO
  { name: 'meta_title', label: 'Meta Title', type: 'text', group: 'seo', maxLength: 70 },
  { name: 'meta_description', label: 'Meta Description', type: 'textarea', group: 'seo', maxLength: 160 },
  { name: 'canonical_url', label: 'Canonical URL', type: 'url', group: 'seo' },
  { name: 'og_image_url', label: 'OG Image URL', type: 'url', group: 'seo' },
  // Media
  { name: 'cover_image_url', label: 'Cover Image', type: 'image', group: 'media' },
  { name: 'cover_image_alt', label: 'Cover Image Alt Text', type: 'text', group: 'media' },
];

// ── Registry ───────────────────────────────────────────────────────

export const contentTypeRegistry: Record<string, ContentTypeConfig> = {
  venues: {
    id: 'venues',
    tableName: 'venues',
    primaryKey: 'id',
    titleField: 'name',
    descriptionField: 'description',
    imageField: 'images',
    icon: Building,
    label: { singular: 'Venue', plural: 'Venues' },
    color: '#8b5cf6',
    fields: venueFields,
    defaults: { country: 'US', featured: false, verified: false },
    validate: validateVenue,
    fieldGroupOrder: ['basic', 'location', 'details', 'media', 'settings', 'external'],
  },
  events: {
    id: 'events',
    tableName: 'events',
    primaryKey: 'id',
    titleField: 'title',
    descriptionField: 'description',
    imageField: 'images',
    icon: Calendar,
    label: { singular: 'Event', plural: 'Events' },
    color: '#ec4899',
    fields: eventFields,
    defaults: { country: 'US', featured: false, is_free: false, is_public: true, status: 'active' },
    validate: validateEvent,
    fieldGroupOrder: ['basic', 'location', 'details', 'media', 'settings'],
  },
  personalities: {
    id: 'personalities',
    tableName: 'personalities',
    primaryKey: 'id',
    titleField: 'name',
    descriptionField: 'description',
    imageField: 'image_url',
    icon: Users,
    label: { singular: 'Personality', plural: 'Personalities' },
    color: '#f59e0b',
    fields: personalityFields,
    defaults: { is_living: true, visibility: 'public', verification_status: 'pending' },
    fieldGroupOrder: ['basic', 'details', 'lgbtq', 'media', 'settings'],
  },
  news_articles: {
    id: 'news_articles',
    tableName: 'news_articles',
    primaryKey: 'id',
    titleField: 'title',
    descriptionField: 'excerpt',
    imageField: 'image_url',
    icon: Newspaper,
    label: { singular: 'News Article', plural: 'News Articles' },
    color: '#3b82f6',
    fields: newsArticleFields,
    defaults: { category: 'general', is_featured: false },
    validate: validateNewsArticle,
    fieldGroupOrder: ['basic', 'details', 'media', 'settings'],
  },
  cities: {
    id: 'cities',
    tableName: 'cities',
    primaryKey: 'id',
    titleField: 'name',
    descriptionField: 'description',
    imageField: 'image_url',
    icon: MapPin,
    label: { singular: 'City', plural: 'Cities' },
    color: '#10b981',
    fields: cityFields,
    fieldGroupOrder: ['basic', 'location', 'details', 'lgbtq', 'media'],
  },
  countries: {
    id: 'countries',
    tableName: 'countries',
    primaryKey: 'id',
    titleField: 'name',
    descriptionField: 'description',
    icon: Globe,
    label: { singular: 'Country', plural: 'Countries' },
    color: '#6366f1',
    fields: countryFields,
    fieldGroupOrder: ['basic', 'details', 'location', 'lgbtq'],
  },
  unified_tags: {
    id: 'unified_tags',
    tableName: 'unified_tags',
    primaryKey: 'id',
    titleField: 'name',
    descriptionField: 'description',
    imageField: 'image_url',
    icon: Tag,
    label: { singular: 'Tag', plural: 'Tags' },
    color: '#14b8a6',
    fields: tagFields,
    fieldGroupOrder: ['basic', 'details', 'media'],
  },
  marketplace_listings: {
    id: 'marketplace_listings',
    tableName: 'marketplace_listings',
    primaryKey: 'id',
    titleField: 'title',
    descriptionField: 'description',
    imageField: 'images',
    icon: ShoppingBag,
    label: { singular: 'Listing', plural: 'Marketplace Listings' },
    color: '#f97316',
    fields: marketplaceFields,
    defaults: { status: 'active', featured: false, shipping_available: false, currency: 'USD', price_type: 'fixed' },
    fieldGroupOrder: ['basic', 'details', 'location', 'media', 'settings'],
  },
  community_groups: {
    id: 'community_groups',
    tableName: 'community_groups',
    primaryKey: 'id',
    titleField: 'name',
    descriptionField: 'description',
    imageField: 'image_url',
    icon: UsersRound,
    label: { singular: 'Group', plural: 'Groups' },
    color: '#a855f7',
    fields: groupFields,
    defaults: { is_private: false },
    fieldGroupOrder: ['basic', 'details', 'media', 'settings'],
  },
  cms_pages: {
    id: 'cms_pages',
    tableName: 'cms_pages',
    primaryKey: 'id',
    titleField: 'title',
    descriptionField: 'excerpt',
    imageField: 'cover_image_url',
    icon: FileText,
    label: { singular: 'Page', plural: 'Pages' },
    color: '#64748b',
    fields: pageFields,
    hasRichText: true,
    defaults: { page_type: 'blog_post', workflow_state: 'draft', visibility_level: 'private' },
    fieldGroupOrder: ['basic', 'seo', 'media'],
  },
};

// ── Helper Functions ───────────────────────────────────────────────

/** Get all content type IDs */
export function getContentTypeIds(): string[] {
  return Object.keys(contentTypeRegistry);
}

/** Get a content type config by ID */
export function getContentType(id: string): ContentTypeConfig | undefined {
  return contentTypeRegistry[id];
}

/** Get field configs for a content type, optionally filtered by group */
export function getFieldsByGroup(contentTypeId: string, group?: FieldGroup): FieldConfig[] {
  const config = contentTypeRegistry[contentTypeId];
  if (!config) return [];
  if (!group) return config.fields.filter(f => !f.hidden);
  return config.fields.filter(f => f.group === group && !f.hidden);
}

/** Get all available field groups for a content type */
export function getFieldGroups(contentTypeId: string): FieldGroup[] {
  const config = contentTypeRegistry[contentTypeId];
  if (!config) return [];
  if (config.fieldGroupOrder) return config.fieldGroupOrder;
  const groups = new Set(config.fields.filter(f => !f.hidden).map(f => f.group));
  return Array.from(groups);
}

/** Field group labels */
export const fieldGroupLabels: Record<FieldGroup, string> = {
  basic: 'Basic Info',
  details: 'Details',
  location: 'Location',
  media: 'Media',
  seo: 'SEO',
  settings: 'Settings',
  lgbtq: 'LGBTQ+ Data',
  external: 'External Data',
};

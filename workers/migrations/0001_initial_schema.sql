-- D1 Migration: Initial schema
-- Converted from Supabase PostgreSQL to SQLite for Cloudflare D1
-- UUID is stored as TEXT, TIMESTAMP as TEXT (ISO 8601), BOOLEAN as INTEGER (0/1)
-- JSON/JSONB stored as TEXT

-- ═══════════════════════════════════════════
-- Auth & Users
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  encrypted_password TEXT NOT NULL,
  raw_user_meta_data TEXT DEFAULT '{}',
  email_confirmed_at TEXT,
  last_sign_in_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  location TEXT,
  pronouns TEXT,
  is_business INTEGER DEFAULT 0,
  gender_identity TEXT,
  age_range TEXT,
  looking_for TEXT, -- JSON array
  first_name TEXT,
  last_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS user_passkey_enrollment (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_enrolled INTEGER DEFAULT 0,
  enrolled_at TEXT,
  device_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  device_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS user_photos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT,
  is_primary INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_relationships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  related_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, related_user_id)
);

-- ═══════════════════════════════════════════
-- Security
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id TEXT,
  metadata TEXT DEFAULT '{}',
  severity TEXT DEFAULT 'info',
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id TEXT PRIMARY KEY,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS access_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  endpoint TEXT,
  method TEXT,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS captcha_verifications (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  success INTEGER DEFAULT 0,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Geography
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS continents (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  continent_id TEXT REFERENCES continents(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS countries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  iso_code TEXT UNIQUE,
  iso3_code TEXT,
  continent_id TEXT REFERENCES continents(id),
  region_id TEXT REFERENCES regions(id),
  capital TEXT,
  currency_code TEXT,
  currency_name TEXT,
  phone_code TEXT,
  languages TEXT, -- JSON array
  timezones TEXT, -- JSON array
  flag_emoji TEXT,
  flag_url TEXT,
  latitude REAL,
  longitude REAL,
  population INTEGER,
  area_km2 REAL,
  lgbtq_safety_index REAL,
  lgbtq_legal_status TEXT,
  marriage_equality INTEGER DEFAULT 0,
  description TEXT,
  travel_advisory TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country_id TEXT REFERENCES countries(id),
  region_id TEXT REFERENCES regions(id),
  latitude REAL,
  longitude REAL,
  population INTEGER,
  timezone TEXT,
  description TEXT,
  lgbtq_scene_description TEXT,
  image_url TEXT,
  is_featured INTEGER DEFAULT 0,
  slug TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS queer_villages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city_id TEXT REFERENCES cities(id),
  description TEXT,
  history TEXT,
  latitude REAL,
  longitude REAL,
  boundary_geojson TEXT, -- JSON
  image_url TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Venues
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  short_description TEXT,
  venue_type TEXT,
  address TEXT,
  city TEXT,
  city_id TEXT REFERENCES cities(id),
  country TEXT,
  country_id TEXT REFERENCES countries(id),
  postal_code TEXT,
  latitude REAL,
  longitude REAL,
  phone TEXT,
  email TEXT,
  website TEXT,
  social_media TEXT, -- JSON
  opening_hours TEXT, -- JSON
  price_range TEXT,
  rating REAL,
  review_count INTEGER DEFAULT 0,
  image_url TEXT,
  images TEXT, -- JSON array
  tags TEXT, -- JSON array
  amenities TEXT, -- JSON array
  accessibility_features TEXT, -- JSON array
  is_verified INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  is_permanently_closed INTEGER DEFAULT 0,
  data_source TEXT,
  external_id TEXT,
  created_by TEXT,
  view_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Events
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS event_types (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  short_description TEXT,
  event_type TEXT,
  event_type_id TEXT REFERENCES event_types(id),
  venue_id TEXT REFERENCES venues(id),
  city_id TEXT REFERENCES cities(id),
  country_id TEXT REFERENCES countries(id),
  address TEXT,
  latitude REAL,
  longitude REAL,
  start_date TEXT,
  end_date TEXT,
  start_time TEXT,
  end_time TEXT,
  is_recurring INTEGER DEFAULT 0,
  recurrence_rule TEXT,
  timezone TEXT,
  organizer_name TEXT,
  organizer_email TEXT,
  organizer_url TEXT,
  ticket_url TEXT,
  ticket_price TEXT,
  is_free INTEGER DEFAULT 0,
  image_url TEXT,
  images TEXT, -- JSON array
  tags TEXT, -- JSON array
  target_audience TEXT,
  age_restriction TEXT,
  capacity INTEGER,
  is_featured INTEGER DEFAULT 0,
  is_cancelled INTEGER DEFAULT 0,
  data_source TEXT,
  external_id TEXT,
  view_count INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_attendees (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'going',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS event_favorites (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS event_amenities (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_services (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- News
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS news_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  content TEXT,
  summary TEXT,
  excerpt TEXT,
  source_name TEXT,
  source_url TEXT,
  author TEXT,
  image_url TEXT,
  category TEXT,
  tags TEXT, -- JSON array
  city_id TEXT REFERENCES cities(id),
  country_id TEXT REFERENCES countries(id),
  is_featured INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 1,
  published_at TEXT,
  view_count INTEGER DEFAULT 0,
  sentiment TEXT,
  language TEXT DEFAULT 'en',
  data_source TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Personalities
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS personalities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  bio TEXT,
  short_bio TEXT,
  birth_date TEXT,
  death_date TEXT,
  birth_place TEXT,
  nationality TEXT,
  country_id TEXT REFERENCES countries(id),
  city_id TEXT REFERENCES cities(id),
  occupation TEXT,
  known_for TEXT,
  image_url TEXT,
  images TEXT, -- JSON array
  social_media TEXT, -- JSON
  website TEXT,
  wikipedia_url TEXT,
  tags TEXT, -- JSON array
  categories TEXT, -- JSON array
  is_featured INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 1,
  view_count INTEGER DEFAULT 0,
  data_source TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Hotels & Festivals
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS hotels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  address TEXT,
  city_id TEXT REFERENCES cities(id),
  country_id TEXT REFERENCES countries(id),
  latitude REAL,
  longitude REAL,
  star_rating INTEGER,
  price_range TEXT,
  amenities TEXT, -- JSON array
  image_url TEXT,
  images TEXT, -- JSON array
  website TEXT,
  phone TEXT,
  email TEXT,
  is_lgbtq_friendly INTEGER DEFAULT 1,
  is_featured INTEGER DEFAULT 0,
  booking_url TEXT,
  data_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS festivals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  city_id TEXT REFERENCES cities(id),
  country_id TEXT REFERENCES countries(id),
  start_date TEXT,
  end_date TEXT,
  frequency TEXT,
  website TEXT,
  image_url TEXT,
  tags TEXT, -- JSON array
  attendance INTEGER,
  is_featured INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Tags & Categories
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tag_categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  color TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS unified_tags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  category_id TEXT REFERENCES tag_categories(id),
  icon TEXT,
  color TEXT,
  image_url TEXT,
  is_active INTEGER DEFAULT 1,
  is_featured INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tag_aliases (
  id TEXT PRIMARY KEY,
  tag_id TEXT NOT NULL REFERENCES unified_tags(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tag_id, alias)
);

CREATE TABLE IF NOT EXISTS unified_tag_assignments (
  id TEXT PRIMARY KEY,
  tag_id TEXT NOT NULL REFERENCES unified_tags(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tag_id, entity_id, entity_type)
);

CREATE TABLE IF NOT EXISTS accessibility_attributes (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT,
  icon TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Community & Social
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS community_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  image_url TEXT,
  cover_image_url TEXT,
  group_type TEXT,
  privacy TEXT DEFAULT 'public',
  city_id TEXT REFERENCES cities(id),
  country_id TEXT REFERENCES countries(id),
  member_count INTEGER DEFAULT 0,
  is_verified INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  rules TEXT, -- JSON array
  tags TEXT, -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_memberships (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'active',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES community_groups(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  post_type TEXT DEFAULT 'discussion',
  image_url TEXT,
  images TEXT, -- JSON array
  poll_options TEXT, -- JSON array
  is_pinned INTEGER DEFAULT 0,
  is_locked INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id TEXT REFERENCES post_comments(id),
  likes_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_post_likes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_poll_votes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  submission_type TEXT NOT NULL,
  title TEXT,
  content TEXT,
  data TEXT, -- JSON
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Marketplace
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  price REAL,
  currency TEXT DEFAULT 'EUR',
  condition TEXT,
  category TEXT,
  image_url TEXT,
  images TEXT, -- JSON array
  city_id TEXT REFERENCES cities(id),
  country_id TEXT REFERENCES countries(id),
  is_active INTEGER DEFAULT 1,
  is_featured INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  tags TEXT, -- JSON array
  shipping_options TEXT, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marketplace_favorites (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(listing_id, user_id)
);

CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Messaging
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  is_group INTEGER DEFAULT 0,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_read_at TEXT,
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  metadata TEXT, -- JSON
  is_edited INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS mailbox_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_email TEXT,
  to_email TEXT,
  subject TEXT,
  body TEXT,
  html_body TEXT,
  is_read INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  folder TEXT DEFAULT 'inbox',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Notifications
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT,
  message TEXT,
  data TEXT, -- JSON
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Content Management
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cms_content (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  content TEXT,
  content_type TEXT,
  status TEXT DEFAULT 'draft',
  author_id TEXT REFERENCES users(id),
  published_at TEXT,
  metadata TEXT, -- JSON
  seo_title TEXT,
  seo_description TEXT,
  featured_image TEXT,
  tags TEXT, -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cms_revisions (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES cms_content(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,
  author_id TEXT REFERENCES users(id),
  revision_number INTEGER,
  change_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cms_audit_log (
  id TEXT PRIMARY KEY,
  content_id TEXT,
  action TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  details TEXT, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Content Moderation
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS content_flags (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  flagged_by TEXT REFERENCES users(id),
  reason TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_links (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  link_type TEXT,
  is_valid INTEGER DEFAULT 1,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS moderation_flags (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  flag_type TEXT NOT NULL,
  description TEXT,
  flagged_by TEXT REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  resolved_by TEXT,
  resolved_at TEXT,
  resolution_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Admin & Audit
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_edit_log (
  id TEXT PRIMARY KEY,
  editor_id TEXT NOT NULL REFERENCES users(id),
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  before_data TEXT NOT NULL, -- JSON
  after_data TEXT NOT NULL, -- JSON
  changed_fields TEXT, -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_api_keys (
  id TEXT PRIMARY KEY,
  service_name TEXT NOT NULL,
  key_name TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  last_used_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Misc
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS redirects (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  target_url TEXT NOT NULL,
  click_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS affiliate_partners (
  id TEXT PRIMARY KEY,
  partner_name TEXT NOT NULL,
  domains TEXT, -- JSON array
  url_patterns TEXT, -- JSON array
  parameters TEXT DEFAULT '{}', -- JSON
  redirect_template TEXT,
  enabled INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS airports (
  id TEXT PRIMARY KEY,
  iata_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  city_name TEXT,
  city_iata TEXT,
  country_code TEXT,
  latitude REAL,
  longitude REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Import & Automation
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  error_log TEXT, -- JSON
  started_by TEXT REFERENCES users(id),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_venues_city_id ON venues(city_id);
CREATE INDEX IF NOT EXISTS idx_venues_country_id ON venues(country_id);
CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(slug);
CREATE INDEX IF NOT EXISTS idx_events_city_id ON events(city_id);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_news_articles_slug ON news_articles(slug);
CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON news_articles(published_at);
CREATE INDEX IF NOT EXISTS idx_personalities_slug ON personalities(slug);
CREATE INDEX IF NOT EXISTS idx_cities_country_id ON cities(country_id);
CREATE INDEX IF NOT EXISTS idx_cities_slug ON cities(slug);
CREATE INDEX IF NOT EXISTS idx_countries_iso_code ON countries(iso_code);
CREATE INDEX IF NOT EXISTS idx_unified_tags_slug ON unified_tags(slug);
CREATE INDEX IF NOT EXISTS idx_unified_tags_category_id ON unified_tags(category_id);
CREATE INDEX IF NOT EXISTS idx_tag_assignments_entity ON unified_tag_assignments(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_community_posts_group_id ON community_posts(group_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_author_id ON community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller ON marketplace_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_failed_logins_email ON failed_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_content_flags_status ON content_flags(status);
CREATE INDEX IF NOT EXISTS idx_cms_content_slug ON cms_content(slug);
CREATE INDEX IF NOT EXISTS idx_cms_content_status ON cms_content(status);
CREATE INDEX IF NOT EXISTS idx_redirects_slug ON redirects(slug);

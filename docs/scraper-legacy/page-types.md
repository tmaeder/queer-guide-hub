# Queer Guide — Page Types

One-line reference for every route. Source of truth: `web/src/App.tsx`.
Format: `` `/path` `` → `web/src/pages/File.tsx` — purpose

## Core discovery
- `/` → `Index.tsx` — homepage
- `/venues` → `Venues.tsx` — venue list/search
- `/venues/:slug` → `VenueDetail.tsx` — single venue
- `/events` → `Events.tsx` — event list/search
- `/events/:slug` → `EventDetail.tsx` — single event
- `/hotels` → `Hotels.tsx` — hotel list
- `/hotels/:slug` → `HotelDetail.tsx` — single hotel
- `/villages/:slug` → `QueerVillageDetail.tsx` — single queer village
- `/marketplace` → `Marketplace.tsx` — marketplace listings
- `/marketplace/:slug` → `MarketplaceItemDetail.tsx` — single listing
- `/places` → `Places.tsx` — combined places browse
- `/map` → `Map.tsx` — global interactive map

## Travel & trips
- `/travel` → `Travel.tsx` — travel hub
- `/trips` → `trips/TripsPage.tsx` — user's trips
- `/trips/:tripId` → `trips/TripPlannerPage.tsx` — trip planner
- `/trips/shared/:token` → `trips/SharedTripPage.tsx` — read-only shared trip

## Geography
- `/city/:slug` → `CityDetail.tsx` — city page
- `/country/:slug` → `CountryDetail.tsx` — country page

## People, tags, resources
- `/users` → `UserDirectory.tsx` — user directory
- `/personalities` → `Personalities.tsx` — personality list
- `/personalities/:slug` → `PersonalityDetail.tsx` — personality profile
- `/professions/:professionName` → `ProfessionDetail.tsx` — profession index
- `/resources` → `Ressources.tsx` — resources/tag browse
- `/resources/:tagName` → `Ressources.tsx` — resources filtered by tag

## News
- `/news` → `News.tsx` — news feed
- `/news/:slug` → `NewsDetail.tsx` — single article

## Community
- `/feed` → `Feed.tsx` — social feed
- `/groups` → `Groups.tsx` — group browser
- `/groups/:groupId` → `GroupDetail.tsx` — group page
- `/my-groups` → `MyGroups.tsx` — user's groups
- `/friends` → `Friends.tsx` — friends list
- `/messages` → `Messages.tsx` — DMs
- `/inbox` → `Inbox.tsx` — notifications inbox
- `/user/:userId` → `UserProfile.tsx` — public user profile
- `/favorites` → `Favorites.tsx` — saved items

## Account
- `/auth` → `Auth.tsx` — sign in / sign up
- `/onboarding/welcome` → `onboarding/Welcome.tsx` — first-run onboarding
- `/profile/settings` → `ProfileSettings.tsx` — account settings

## Engagement & utility
- `/submit` → `SubmitHub.tsx` — submission hub
- `/submit/:contentType` → `SubmitForm.tsx` — typed submission form
- `/feedback` → `FeedbackBoard.tsx` — public feedback board
- `/donate` → `Donate.tsx` — donations
- `/help` → `HelpHotlines.tsx` — help & crisis hotlines
- `/search` → `SearchResults.tsx` — universal search
- `/sitemap` → `Sitemap.tsx` — HTML sitemap
- `/share-target` → `ShareTarget.tsx` — PWA share target

## CMS-managed slugs (`CMSRoutePage`)
Content loaded from `cms_pages` table by fixed slug.
- `/about-hub`, `/about`, `/contact`, `/vision`, `/values`, `/press`, `/blog`, `/sustainability`, `/legal`, `/terms`, `/privacy`, `/cookies`, `/dmca`, `/accessibility`

## Generic CMS
- `/p/:slug` → `Page.tsx` — arbitrary CMS page by slug

## Admin (`/admin/*`, wrapped in `AdminShell` + `AdminRouteGuard`)

### Dashboard
- `/admin` (index) → `AdminDashboard.tsx`
- `/admin/analytics` → `AdminAnalytics.tsx`
- `/admin/security` → `components/admin/SecurityMonitoringDashboard.tsx`
- `/admin/cloudflare` → `components/admin/CloudflareDashboard.tsx`

### Content & CMS
- `/admin/content` → `components/cms/ContentListPanel.tsx`
- `/admin/content/:type` → `components/cms/ContentListPanel.tsx`
- `/admin/pages` → `ContentListPanel` (contentTypeId=cms_pages)
- `/admin/media` → `components/cms/MediaLibrary.tsx`
- `/admin/cms` (legacy) → `AdminCMS.tsx`
- `/admin/audit` → `components/cms/AuditLog.tsx`

### Imports & pipelines
- `/admin/imports` → `AdminImportHub.tsx`
- `/admin/imports/news-sources` → `components/admin/NewsSourcesManager.tsx`
- `/admin/imports/pipeline` → `components/admin/PipelineMonitor.tsx`
- `/admin/imports/venues` → `components/admin/VenueImportQuickActions.tsx`
- `/admin/imports/email-ingestions` → `AdminEmailIngestions.tsx`
- `/admin/imports/history` → `AdminImportHub.tsx`
- `/admin/pipelines` → `AdminPipelines.tsx`
- `/admin/import-hub` (legacy) → `AdminImportHub.tsx`

### Review & moderation
- `/admin/review` → `AdminReview.tsx`
- `/admin/feedback` → `AdminFeedback.tsx`
- `/admin/affiliates` → `components/admin/AffiliatePartnersManager.tsx`

### Content type admin
- `/admin/hotels` → `AdminHotels.tsx`
- `/admin/villages` → `AdminQueerVillages.tsx`
- `/admin/venues` → `AdminVenues.tsx`
- `/admin/events` → `AdminEvents.tsx`
- `/admin/marketplace` → `AdminMarketplace.tsx`
- `/admin/personalities` → `AdminPersonalities.tsx`
- `/admin/cities` → `AdminCities.tsx`
- `/admin/countries` → `AdminCountries.tsx`
- `/admin/groups` → `AdminGroups.tsx`
- `/admin/news-sources` → `AdminNewsSources.tsx`
- `/admin/tags` → `AdminTags.tsx`

### System
- `/admin/users` → `AdminUsers.tsx`
- `/admin/api-keys` → `components/admin/ApiKeysManager.tsx`
- `/admin/redirects` → `AdminRedirects.tsx`
- `/admin/email-templates` → `admin/EmailTemplates.tsx`

### Settings (taxonomies)
- `/admin/settings` → `AdminTags.tsx`
- `/admin/settings/venue-categories` → `AdminVenueCategories.tsx`
- `/admin/settings/venue-amenities` → `AdminVenueAmenities.tsx`
- `/admin/settings/venue-services` → `AdminVenueServices.tsx`
- `/admin/settings/event-types` → `AdminEventTypes.tsx`
- `/admin/settings/event-amenities` → `AdminEventAmenities.tsx`
- `/admin/settings/event-services` → `AdminEventServices.tsx`
- `/admin/settings/accessibility` → `AdminAccessibilityAttributes.tsx`
- `/admin/settings/target-groups` → `AdminTargetGroups.tsx`

## Redirects
Public:
- `/villages` → `/places`
- `/festivals`, `/festivals/:id` → `/events`
- `/flights` → `/travel`
- `/ressources`, `/ressources/:tagName` → `/resources`
- `/tags`, `/tags/:tagName` → `/resources`
- `/community` → `/feed`

Admin:
- `/admin/imports/create` → `/admin/imports`
- `/admin/imports/enrichment` → `/admin/pipelines?tab=monitor`
- `/admin/workflows` → `/admin/pipelines?tab=health`
- `/admin/pipelines/dashboard` → `/admin/pipelines?tab=monitor`
- `/admin/scraping` → `/admin/imports`
- `/admin/automation` → `/admin/pipelines?tab=modules`
- `/admin/moderation` → `/admin/review?tab=moderation`
- `/admin/links` → `/admin/automation`
- `/admin/submissions` → `/admin/review?tab=submissions`
- `/admin/festivals` → `/admin/events`
- `/admin/venue-categories` → `/admin/settings/venue-categories`
- `/admin/venue-amenities` → `/admin/settings/venue-amenities`
- `/admin/venue-services` → `/admin/settings/venue-services`
- `/admin/event-types` → `/admin/settings/event-types`
- `/admin/event-amenities` → `/admin/settings/event-amenities`
- `/admin/event-services` → `/admin/settings/event-services`
- `/admin/accessibility-attributes` → `/admin/settings/accessibility`
- `/admin/target-groups` → `/admin/settings/target-groups`

## Catch-all
- `*` → `NotFound.tsx`

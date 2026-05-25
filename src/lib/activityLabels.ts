// Human-readable labels + lucide icon names for activity events. The icon
// strings match lucide-react component names; consumers can dynamic-import or
// switch on them. Keep this in sync with public.activity_event_rules.

export const EVENT_LABELS: Record<string, string> = {
  'venue.checkin': 'Checked in at a venue',
  'venue.first_visit_bonus': 'Discovered a new venue',
  'marketplace.favorite_added': 'Saved a marketplace listing',
  'marketplace.review_posted': 'Wrote a marketplace review',
  'marketplace.guide_completed': 'Finished a marketplace guide',
  'profile.completion_milestone': 'Profile milestone',
  'profile.field_filled': 'Filled a profile field',
  'contribution.submission_accepted': 'Submission accepted',
  'contribution.endorsement_received': 'Received an endorsement',
  'group.joined': 'Joined a group',
  'group.post_created': 'Posted in a group',
  'social.friend_accepted': 'New friend connection',
  'event.rsvp': 'RSVPd to an event',
  'trip.created': 'Started a trip',
};

export const EVENT_ICONS: Record<string, string> = {
  'venue.checkin': 'MapPin',
  'venue.first_visit_bonus': 'Sparkles',
  'marketplace.favorite_added': 'Heart',
  'marketplace.review_posted': 'MessageSquare',
  'marketplace.guide_completed': 'BookOpen',
  'profile.completion_milestone': 'CircleCheck',
  'profile.field_filled': 'PencilLine',
  'contribution.submission_accepted': 'CheckCircle2',
  'contribution.endorsement_received': 'Award',
  'group.joined': 'Users',
  'group.post_created': 'Megaphone',
  'social.friend_accepted': 'UserPlus',
  'event.rsvp': 'Calendar',
  'trip.created': 'Plane',
};

export function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType;
}

export function eventIcon(eventType: string): string {
  return EVENT_ICONS[eventType] ?? 'Activity';
}

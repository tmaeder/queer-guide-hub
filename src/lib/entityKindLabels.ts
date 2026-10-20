import type { TFunction } from 'i18next';

/** The two kinds a business detail page can be — often both at once. */
export type EntityKind = 'venue' | 'organization';

export function entityKindLabel(kind: EntityKind, t: TFunction): string {
  return kind === 'venue'
    ? t('pages.entityDetail.kindVenue', 'Venue')
    : t('pages.entityDetail.kindOrganization', 'Organization');
}

export function orgRoleLabel(role: string, t: TFunction): string {
  const map: Record<string, string> = {
    publisher: t('pages.entityDetail.rolePublisher', 'News outlet'),
    seller: t('pages.entityDetail.roleSeller', 'Shop'),
    venue: t('pages.entityDetail.roleVenue', 'Physical venue'),
    organizer: t('pages.entityDetail.roleOrganizer', 'Organizer'),
    community: t('pages.entityDetail.roleCommunity', 'Community'),
    support: t('pages.entityDetail.roleSupport', 'Support organization'),
    advocacy: t('pages.entityDetail.roleAdvocacy', 'Advocacy group'),
  };
  return map[role] ?? role;
}

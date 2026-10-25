export { verifyWebhook } from './webhooks.js';
export interface PasswordBranding {
  linkId: string;
  version: string | null;
  updatedAt: string | null;
  brandName: string | null;
  canEdit: boolean;
  logoAsset: {
    id: string;
    key: string;
    url: string;
    mime: 'image/png' | 'image/jpeg';
    bytes: number;
    width: number;
    height: number;
    sha256: string;
  } | null;
}
export type WebhookEvent =
  | 'link.created'
  | 'link.updated'
  | 'link.deleted'
  | 'link.clicked'
  | 'lead.created'
  | 'sale.created';
export interface WebhookInput {
  name: string;
  url: string;
  eventTypes?: WebhookEvent[];
  linkIds?: string[] | null;
  includeCustomerId?: boolean;
  enabled?: boolean;
}
export interface Webhook extends Required<WebhookInput> {
  id: string;
  version: string;
  keyVersion: string;
  previousKeyExpiresAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface WebhookAttempt {
  id: string;
  number: number;
  keyVersion: string | null;
  startedAt: string;
  finishedAt: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  responseExcerpt: string;
  durationMs: number | null;
}
export interface WebhookDelivery {
  id: string;
  sequence: string;
  webhookId: string;
  eventId: string;
  eventType: WebhookEvent | 'webhook.test';
  version: string;
  state: 'queued' | 'leased' | 'retry' | 'delivered' | 'failed' | 'cancelled';
  attempts: number;
  cycleAttempts: number;
  replays: number;
  createdAt: string;
  finishedAt: string | null;
  nextAttemptAt: string;
  httpStatus: number | null;
  errorCode: string | null;
}
export interface WebhookReceipt extends WebhookDelivery {
  body: string;
  responseExcerpt: string;
  recentAttempts: WebhookAttempt[];
}
export type WebhookMutation<T> = T | { retryAfter: number };
export type JsonObject = Record<string, unknown>;
export interface RedirectWorkspace {
  id: string;
  name: string;
  slug: string;
}
export interface RedirectWorkspaceSession {
  role: 'owner' | 'member' | 'viewer' | 'billing';
  label: string | null;
  workspace: RedirectWorkspace;
}
export interface RedirectWorkspaceList {
  data: (RedirectWorkspace & { role: RedirectWorkspaceSession['role'] })[];
  currentWorkspaceId: string | null;
  count: number;
  nextOffset: number | null;
}
export type WorkspaceInformationKind = 'domains' | 'tokens' | 'webhooks';
export interface WorkspaceOwner {
  userId: string;
  label: string;
  memberRole: 'member' | 'viewer' | 'billing' | null;
  grantedAt: string | null;
  version: string | null;
  canRemove: boolean;
}
export interface OwnerCandidate {
  memberId: string;
  userId: string;
  label: string;
  role: 'member' | 'viewer' | 'billing';
  verified: boolean;
}
export interface WorkspaceOwnershipPage<T> extends Page<T> {
  workspace: { id: string; name: string; slug: string; status: 'active' | 'provisioning' };
  legacy: boolean;
}
export interface IntegrationSetupInput {
  requestId: string;
  provider: 'segment' | 'gtm';
  name: string;
  linkIds: string[];
  expiresAt: string;
}
export interface IntegrationInstallation {
  id: string;
  provider: 'segment' | 'gtm';
  name: string;
  createdAt: string;
  expiresAt: string;
  credentialPrefix: string;
  credentialLastUsedAt: string | null;
  linkCount: number;
  status: 'configured' | 'revoked' | 'expired' | 'unavailable';
  canRevoke: boolean;
}
export interface IntegrationSetupResult {
  created: boolean;
  installation: IntegrationInstallation;
  credential: string | null;
}
export interface WorkspaceInformationRow {
  id: string;
  name: string;
  status:
    | 'active'
    | 'expired'
    | 'revoked'
    | 'archived'
    | 'disabled'
    | 'ready'
    | 'setup_required'
    | 'unavailable';
  createdAt: string;
  prefix?: string;
  scopes?: string[];
  linkCount?: number | null;
  memberBound?: boolean;
  expiresAt?: string;
  lastUsedAt?: string | null;
  receiverHost?: string | null;
  eventTypes?: string[];
}
export interface WorkspaceInformationPage {
  data: WorkspaceInformationRow[];
  count: number;
  nextCursor: string | null;
}
export interface CustomerProfile {
  customerExternalId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  version: string | null;
  updatedAt: string | null;
  canEdit: boolean;
}
export interface CustomerProfileChanges {
  version: string | null;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}
export interface CustomerJourneyCursor {
  at: string;
  id: string;
}
export interface CustomerJourneyPage {
  data: {
    id: string;
    kind: 'click' | 'lead' | 'sale';
    occurred_at: string;
    source: string | null;
    event_name: string;
    amount: string | null;
    currency: string | null;
    click_id: string;
  }[];
  nextCursor: CustomerJourneyCursor | null;
}
export interface ReportFilters {
  linkIds?: string[];
  folderId?: string;
  tagId?: string;
  start?: string;
  end?: string;
  event?: 'all' | 'click' | 'lead' | 'sale';
  country?: string;
  city?: string;
  device?: string;
  browser?: string;
  os?: string;
  domain?: string;
  referrer?: string;
  variant?: string;
  excludeBots?: boolean;
  qr?: boolean;
  interval?: 'hour' | 'day' | 'week' | 'month';
}
export interface SavedReport {
  id: string;
  owner_user_id?: string;
  visibility?: 'private' | 'team';
  canEdit?: boolean;
  name: string;
  filters: ReportFilters;
  version: string;
  created_at: string;
  updated_at: string;
}
export interface ReportAggregate {
  snapshot: string;
  interval: 'hour' | 'day' | 'week' | 'month';
  totals: { clicks: number; leads: number; sales: number; customers: number };
  revenue: { currency: string; amount: string }[];
  series: { at: string; clicks: number; leads: number; sales: number }[];
  breakdowns: Record<string, { label: string; count: number }[]>;
}
export interface ReportShareInput {
  title: string;
  reportVersion: string;
  includeConversions?: boolean;
  scopeMode?: 'snapshot' | 'folder';
  expiresAt?: string | null;
  password?: string;
  allowIndexing?: boolean;
}
export interface ReportShare {
  id: string;
  title: string;
  linkCount: number;
  scopeMode: 'snapshot' | 'folder';
  includeConversions: boolean;
  hasPassword: boolean;
  allowIndexing: boolean;
  expiresAt: string | null;
  createdAt?: string;
  revokedAt?: string | null;
}
export interface PublicReportInput {
  password?: string;
  dates?: { start?: string; end?: string };
}
export interface PublicReport {
  title: string;
  linkCount: number;
  scopeMode: 'snapshot' | 'folder';
  includeConversions: boolean;
  allowIndexing: boolean;
  expiresAt: string | null;
  dateRange?: {
    start: string | null;
    end: string | null;
    earliest: string | null;
    latest: string | null;
  };
  report: Omit<ReportAggregate, 'totals' | 'series'> & {
    totals: { clicks: number; leads?: number; sales?: number; customers?: number };
    series: { at: string; clicks: number; leads?: number; sales?: number }[];
  };
}
export interface QrImageOptions {
  /** App installation is supported only with a managed linkId. */
  purpose?: 'visit' | 'install';
  /** Encoded public campaign query for install entries; no private handoff fields. */
  entryQuery?: string;
  label?: string;
  expiresAt?: string | null;
  style?: Partial<{
    dots: 'square' | 'circle' | 'joined';
    border: 'square' | 'rounded' | 'circle';
    center: 'square' | 'circle';
    foreground: string;
    background: string;
  }> | null;
  logoMode?: 'inherit' | 'none' | 'custom';
  logo?: string;
}
export type QrImageInput = QrImageOptions &
  ({ linkId: string; url?: never } | { url: string; linkId?: never });
export interface QrImageLink {
  purpose?: 'visit' | 'install';
  id: string;
  label: string;
  linkId: string | null;
  version: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  style: NonNullable<QrImageOptions['style']>;
  logoMode: 'inherit' | 'none' | 'custom';
  state: 'pending' | 'published';
  logoAsset: {
    id: string;
    key: string;
    url: string;
    mime: 'image/png' | 'image/jpeg';
    bytes: number;
    width: number;
    height: number;
    sha256: string;
  } | null;
}
export interface CreatedQrImageLink extends QrImageLink {
  imageUrls: { png: string; jpg: string; svg: string };
}
export interface LinkInput {
  isDomainRoot?: boolean;
  slug?: string;
  target?: string;
  statusCode?: 301 | 302 | 307 | 308;
  isEnabled?: boolean;
  isArchived?: boolean;
  queryMode?: 'PRESERVE' | 'DROP' | 'OVERRIDE';
  queryOverride?: Record<string, string> | null;
  utmDefaults?: Record<string, string> | null;
  expiresAt?: string | null;
  startsAt?: string | null;
  clickLimit?: number | null;
  notes?: string | null;
  domainId?: string | null;
  folderId?: string | null;
  tagIds?: string[];
  comment?: string;
}
export interface Link extends LinkInput {
  id: string;
  slug: string;
  target: string;
  clicks: number;
  shortUrl: string;
  domainHostname: string | null;
  updatedAt: string;
}
export interface DomainChoice {
  id: string;
  hostname: string;
}
export interface DomainChoices extends Page<DomainChoice> {
  primaryDomainId: string | null;
  primaryUnavailable: boolean;
}
export interface LinkedDomain extends DomainChoice {
  linkCount: number;
}
export interface LinkedDomainsPage extends Page<LinkedDomain> {
  builtinCount: number;
  revision: string;
}
export interface LinkPolicy {
  preview?: { title?: string; description?: string; image?: string; video?: string };
  cloaked?: boolean;
  track_conversions?: boolean;
  device_targets?: Partial<Record<'ios' | 'android', string>>;
  geo_targets?: Record<string, string>;
  experiment?: {
    starts_at: string;
    ends_at: string;
    variants: Array<{ id: string; url: string; weight: number }>;
    completed_target?: string;
  };
  expires_at?: string;
  expired_target?: string;
}
export interface PolicyResponse {
  policy: LinkPolicy;
  hasPassword: boolean;
}
export interface PolicyUpdate {
  policy?: { [K in keyof LinkPolicy]?: LinkPolicy[K] | null };
  password?: string | null;
}
export interface Page<T> {
  count: number;
  data: T[];
  nextCursor: string | null;
}
export interface Mutation {
  operation: string;
  created?: boolean;
  deleted?: boolean;
  id?: string;
  link?: Link;
}
export interface Conversion {
  clickId?: string;
  customerExternalId: string;
  eventId: string;
  eventName?: string;
  amount?: string | number;
  currency?: string;
  metadata?: JsonObject;
  occurredAt?: string;
}
export type ResourceKind = 'folders' | 'tags' | 'templates';
export class RedirectApiError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;
  constructor(status: number, message: string, retryAfter: string | null) {
    super(message);
    this.name = 'RedirectApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
export class RedirectsClient {
  private readonly token: string;
  private readonly base: string;
  private readonly timeout: number;
  private readonly workspaceId?: string;
  constructor(
    token: string,
    options: { baseUrl?: string; timeoutMs?: number; workspaceId?: string } = {},
  ) {
    if (!token.trim() || /[\r\n]/.test(token)) throw new Error('A server credential is required');
    const url = new URL(options.baseUrl ?? 'https://queer.guide/api/redirects');
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
    )
      throw new Error('Use HTTPS or a loopback development API');
    if (
      options.workspaceId !== undefined &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(options.workspaceId)
    )
      throw new Error('Provide a valid workspace ID');
    this.workspaceId = options.workspaceId?.toLowerCase();
    this.token = token;
    this.base = url.href.replace(/\/$/, '');
    this.timeout = options.timeoutMs ?? 10000;
    if (!Number.isFinite(this.timeout) || this.timeout <= 0)
      throw new Error('Timeout must be positive');
  }
  getSession(): Promise<RedirectWorkspaceSession> {
    return this.request('GET', '/session');
  }
  listWorkspaces(offset = 0): Promise<RedirectWorkspaceList> {
    return this.request('GET', '/workspaces', undefined, { offset });
  }
  listWorkspaceInformation(
    kind: WorkspaceInformationKind,
    limit = 50,
    after?: string,
  ): Promise<WorkspaceInformationPage> {
    return this.request('GET', '/workspace-information', undefined, { kind, limit, after });
  }
  listIntegrationSetups(limit = 50, after?: string): Promise<Page<IntegrationInstallation>> {
    return this.request('GET', '/integrations', undefined, { limit, after });
  }
  createIntegrationSetup(input: IntegrationSetupInput): Promise<IntegrationSetupResult> {
    return this.request('POST', '/integrations', input);
  }
  lookupIntegrationSetup(
    requestId: string,
  ): Promise<{ installation: IntegrationInstallation | null }> {
    return this.request('GET', '/integrations', undefined, { requestId });
  }
  revokeIntegrationSetup(id: string): Promise<IntegrationInstallation> {
    return this.request('DELETE', '/integrations/' + encodeURIComponent(id));
  }
  listWorkspaceOwners(limit = 50, after?: string): Promise<WorkspaceOwnershipPage<WorkspaceOwner>> {
    return this.request('GET', '/workspace-ownership', undefined, { view: 'owners', limit, after });
  }
  listOwnerCandidates(limit = 50, after?: string): Promise<WorkspaceOwnershipPage<OwnerCandidate>> {
    return this.request('GET', '/workspace-ownership', undefined, {
      view: 'candidates',
      limit,
      after,
    });
  }
  admitWorkspaceOwner(
    memberId: string,
    expectedRole: OwnerCandidate['role'],
  ): Promise<WorkspaceOwner> {
    return this.request('POST', '/workspace-ownership', { memberId, expectedRole });
  }
  removeWorkspaceOwner(
    userId: string,
    version: string,
  ): Promise<{ userId: string; removed: boolean; remainingOwners: number }> {
    return this.request('DELETE', '/workspace-ownership/' + encodeURIComponent(userId), {
      version,
    });
  }
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query: JsonObject = {},
    signal?: AbortSignal,
  ): Promise<T> {
    if (!/^\/[a-zA-Z0-9_/-]+$/.test(path) || path.includes('//'))
      throw new Error('Invalid API path');
    const url = new URL(this.base + path);
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== null)
        url.searchParams.set(
          key,
          typeof value === 'object' ? JSON.stringify(value) : String(value),
        );
    const response = await fetch(url, {
      method,
      redirect: 'manual',
      headers: {
        Authorization: 'Bearer ' + this.token,
        'Content-Type': 'application/json',
        ...(this.workspaceId ? { 'X-Qg-Redirect-Workspace': this.workspaceId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(this.timeout)])
        : AbortSignal.timeout(this.timeout),
    });
    const reader = response.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('API response exceeds 8 MiB');
        }
        chunks.push(value);
      }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let data: JsonObject = {};
    try {
      data = size ? JSON.parse(new TextDecoder().decode(bytes)) : {};
    } catch {
      if (response.ok) throw new Error('API returned invalid JSON');
    }
    if (!response.ok)
      throw new RedirectApiError(
        response.status,
        typeof data.error === 'string' ? data.error : 'Redirect API request failed',
        response.headers.get('Retry-After'),
      );
    return data as T;
  }
  getPolicy(id: string) {
    return this.request<PolicyResponse>('GET', '/links/' + id + '/policy');
  }
  updatePolicy(id: string, data: PolicyUpdate) {
    return this.request<PolicyResponse>('PATCH', '/links/' + id + '/policy', data);
  }
  getPresentation(id: string) {
    return this.request<JsonObject>('GET', '/links/' + id + '/presentation');
  }
  updatePresentation(id: string, data: JsonObject) {
    return this.request<JsonObject>('PATCH', '/links/' + id + '/presentation', data);
  }
  uploadPreviewImage(id: string, imageBase64: string) {
    return this.request<{ image: string; width: number; height: number }>(
      'POST',
      '/links/' + id + '/preview-image',
      { image: imageBase64 },
    );
  }
  createLink(data: LinkInput & { target: string }) {
    return this.request<Mutation>('POST', '/links', data);
  }
  getLink(id: string) {
    return this.request<Link>('GET', '/links/' + id);
  }
  updateLink(id: string, data: LinkInput) {
    return this.request<Mutation>('PATCH', '/links/' + id, data);
  }
  upsertLink(
    data: LinkInput & { target: string } & (
        { slug: string } | { isDomainRoot: true; domainId: string }
      ),
  ) {
    return this.request<Mutation>('PUT', '/links/upsert', data);
  }
  deleteLink(id: string) {
    return this.request<Mutation>('DELETE', '/links/' + id);
  }
  listLinkedDomains(limit = 100, cursor?: string) {
    return this.request<LinkedDomainsPage>('GET', '/linked-domains', undefined, { limit, cursor });
  }
  getQrStyle(id: string) {
    return this.request<{
      id: string;
      style: {
        dots: string;
        border: string;
        center: string;
        foreground: string;
        background: string;
      };
      source: string;
      effectiveLogo?: {
        id: string;
        key: string;
        mime: string;
        bytes: number;
        width: number;
        height: number;
        sha256: string;
        url: string;
      } | null;
      logoSource?: string;
    }>('GET', '/qr-styles/links/' + encodeURIComponent(id));
  }
  createQrImage(data: QrImageInput) {
    return this.request<CreatedQrImageLink>('POST', '/qr-images', data);
  }
  listQrImages(limit = 100, cursor?: string) {
    return this.request<Pick<Page<QrImageLink>, 'data' | 'nextCursor'>>(
      'GET',
      '/qr-images',
      undefined,
      { limit, cursor },
    );
  }
  revokeQrImage(id: string, version: string) {
    return this.request<QrImageLink>('DELETE', '/qr-images/' + encodeURIComponent(id), { version });
  }
  listDomainChoices(limit = 100, cursor?: string) {
    return this.request<DomainChoices>('GET', '/domain-choices', undefined, { limit, cursor });
  }
  listInventory(filters: JsonObject = {}, limit = 100, after?: string) {
    return this.request<Page<JsonObject>>('GET', '/inventory', undefined, {
      ...filters,
      limit,
      after,
    });
  }
  getInventoryMetadata(id: string) {
    return this.request<JsonObject>('GET', '/inventory/metadata', undefined, { id });
  }
  organizeInventory(operations: JsonObject[]) {
    return this.request<{ data: JsonObject[] }>('POST', '/inventory/organization', operations);
  }
  listLinks(filters: JsonObject = {}, limit = 100, cursor?: string) {
    return this.request<Page<Link>>('GET', '/links', undefined, { filters, limit, cursor });
  }
  countLinks(filters: JsonObject = {}) {
    return this.request<{ count: number }>('GET', '/links/count', undefined, { filters });
  }
  bulk(operations: JsonObject[]) {
    return this.request<{ data: Mutation[] }>('POST', '/links/bulk', { operations });
  }
  async *iterateLinks(filters: JsonObject = {}) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await this.listLinks(filters, 100, cursor);
      for (const link of page.data) yield link;
      cursor = page.nextCursor ?? undefined;
      if (cursor && seen.has(cursor)) throw new Error('Repeated pagination cursor');
      if (cursor) seen.add(cursor);
    } while (cursor);
  }
  trackLead(data: Conversion) {
    return this.request<JsonObject>('POST', '/track/lead', data);
  }
  trackSale(data: Conversion & { amount: string | number; currency: string }) {
    return this.request<JsonObject>('POST', '/track/sale', data);
  }
  analytics(filters: JsonObject = {}) {
    return this.request<JsonObject>('GET', '/analytics', undefined, { filters });
  }
  events(filters: JsonObject = {}, options: JsonObject = {}) {
    return this.request<JsonObject>('GET', '/events', undefined, { ...options, filters });
  }
  getCustomer(id: string) {
    return this.request<CustomerProfile>('GET', '/customers/profile', undefined, { id });
  }
  updateCustomer(id: string, data: CustomerProfileChanges) {
    return this.request<CustomerProfile>('PATCH', '/customers/profile', {
      ...data,
      customerExternalId: id,
    });
  }
  clearCustomer(id: string, version: string | null) {
    return this.request<CustomerProfile>('DELETE', '/customers/profile', {
      customerExternalId: id,
      version,
    });
  }
  customerJourney(id: string, limit = 50, cursor?: CustomerJourneyCursor) {
    return this.request<CustomerJourneyPage>('GET', '/customers/journey', undefined, {
      id,
      limit,
      cursor,
    });
  }
  getPasswordBranding(id: string) {
    return this.request<PasswordBranding>(
      'GET',
      '/links/' + encodeURIComponent(id) + '/password-branding',
    );
  }
  updatePasswordBranding(
    id: string,
    data: { version: string | null; brandName?: string | null; clearLogo?: boolean },
  ) {
    return this.request<PasswordBranding>(
      'PATCH',
      '/links/' + encodeURIComponent(id) + '/password-branding',
      data,
    );
  }
  uploadPasswordLogo(id: string, version: string | null, image: string) {
    return this.request<PasswordBranding | { retryAfter: number }>(
      'POST',
      '/links/' + encodeURIComponent(id) + '/password-branding/logo',
      { version, image },
    );
  }
  createWebhook(data: WebhookInput) {
    return this.request<WebhookMutation<Webhook & { secret: string }>>('POST', '/webhooks', data);
  }
  getWebhook(id: string) {
    return this.request<Webhook>('GET', '/webhooks/' + encodeURIComponent(id));
  }
  listWebhooks(limit = 50, cursor?: string, archived = false) {
    return this.request<Page<Webhook>>('GET', '/webhooks', undefined, { limit, cursor, archived });
  }
  updateWebhook(id: string, data: Partial<WebhookInput> & { version: string; restore?: boolean }) {
    return this.request<Webhook>('PATCH', '/webhooks/' + encodeURIComponent(id), data);
  }
  archiveWebhook(id: string, version: string) {
    return this.request<Webhook>('DELETE', '/webhooks/' + encodeURIComponent(id), { version });
  }
  rotateWebhookSecret(id: string, version: string) {
    return this.request<WebhookMutation<Webhook & { secret: string }>>(
      'POST',
      '/webhooks/' + encodeURIComponent(id) + '/rotate',
      { version },
    );
  }
  testWebhook(id: string, version: string) {
    return this.request<WebhookMutation<{ eventId: string; deliveryId: string; queued: true }>>(
      'POST',
      '/webhooks/' + encodeURIComponent(id) + '/test',
      { version },
    );
  }
  listWebhookDeliveries(id: string, limit = 50, cursor?: string) {
    return this.request<Page<WebhookDelivery>>(
      'GET',
      '/webhooks/' + encodeURIComponent(id) + '/deliveries',
      undefined,
      { limit, cursor },
    );
  }
  getWebhookDelivery(id: string, deliveryId: string) {
    return this.request<WebhookReceipt>(
      'GET',
      '/webhooks/' + encodeURIComponent(id) + '/deliveries/' + encodeURIComponent(deliveryId),
    );
  }
  listWebhookAttempts(id: string, deliveryId: string, limit = 50, cursor?: string) {
    return this.request<{ data: WebhookAttempt[]; nextCursor: string | null }>(
      'GET',
      '/webhooks/' +
        encodeURIComponent(id) +
        '/deliveries/' +
        encodeURIComponent(deliveryId) +
        '/attempts',
      undefined,
      { limit, cursor },
    );
  }
  replayWebhookDelivery(id: string, deliveryId: string, version: string) {
    return this.request<WebhookMutation<WebhookDelivery>>(
      'POST',
      '/webhooks/' +
        encodeURIComponent(id) +
        '/deliveries/' +
        encodeURIComponent(deliveryId) +
        '/replay',
      { version },
    );
  }
  createReport(data: { name: string; filters: ReportFilters; visibility?: 'private' | 'team' }) {
    return this.request<SavedReport>('POST', '/reports', data);
  }
  getReport(id: string) {
    return this.request<SavedReport>('GET', '/reports/' + encodeURIComponent(id));
  }
  listReports(limit = 50, cursor?: string, view?: 'personal' | 'team' | 'all') {
    return this.request<Page<SavedReport> & { canPublishToTeam?: boolean }>(
      'GET',
      '/reports',
      undefined,
      { limit, cursor, view },
    );
  }
  updateReport(
    id: string,
    data: {
      version: string;
      name?: string;
      filters?: ReportFilters;
      visibility?: 'private' | 'team';
    },
  ) {
    return this.request<SavedReport>('PATCH', '/reports/' + encodeURIComponent(id), data);
  }
  deleteReport(id: string) {
    return this.request<{ id: string; deleted: boolean }>(
      'DELETE',
      '/reports/' + encodeURIComponent(id),
    );
  }
  runReport(id: string) {
    return this.request<ReportAggregate>('GET', '/reports/' + encodeURIComponent(id) + '/run');
  }
  createReportShare(id: string, data: ReportShareInput) {
    return this.request<ReportShare>(
      'POST',
      '/reports/' + encodeURIComponent(id) + '/shares',
      data,
    );
  }
  listReportShares(id: string) {
    return this.request<{ data: ReportShare[] }>(
      'GET',
      '/reports/' + encodeURIComponent(id) + '/shares',
    );
  }
  revokeReportShare(id: string, shareId: string) {
    return this.request<{ id: string; revoked: boolean }>(
      'DELETE',
      '/reports/' + encodeURIComponent(id) + '/shares/' + encodeURIComponent(shareId),
    );
  }
  readPublicReport(data?: PublicReportInput) {
    return this.request<PublicReport>(data === undefined ? 'GET' : 'POST', '/public-report', data);
  }
  getResource(kind: ResourceKind, id: string) {
    return this.request<JsonObject>('GET', '/' + kind + '/' + id);
  }
  listResources(kind: ResourceKind, limit = 100, cursor?: string) {
    return this.request<Page<JsonObject>>('GET', '/' + kind, undefined, { limit, cursor });
  }
  createResource(kind: ResourceKind, data: JsonObject) {
    return this.request<JsonObject>('POST', '/' + kind, data);
  }
  updateResource(kind: ResourceKind, id: string, data: JsonObject) {
    return this.request<JsonObject>('PATCH', '/' + kind + '/' + id, data);
  }
  deleteResource(kind: ResourceKind, id: string) {
    return this.request<JsonObject>('DELETE', '/' + kind + '/' + id);
  }
}

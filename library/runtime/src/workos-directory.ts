/**
 * WorkOS Directory Sync client — typed, port-injected, cursor-paginated.
 *
 * Uses an injected `fetchImpl: typeof fetch` against the WorkOS REST API
 * instead of `@workos-inc/node`: the SDK's transitive footprint is far
 * larger than the handful of calls consumers actually make, and the
 * injectable fetch gives a clean seam for tests (`vi.fn<typeof fetch>()`).
 *
 * WorkOS auth is a single Bearer API key — no client-credentials token
 * exchange, so there is no token refresh and no `/token` roundtrip.
 *
 * The `/directory_users` endpoint does NOT support server-side filtering
 * by email or custom attribute (documented params: `directory`, `group`,
 * `limit`, `before`, `after`, `order`), so the finders paginate with
 * `limit=100` via the `after` cursor and scan client-side. Pagination is
 * bounded at `maxPages` (default 50 → 5000 users) so a misbehaving API
 * can never produce a runaway loop. Callers own caching — every fleet
 * consumer fronts this client with its own cache (DDB, in-memory TTL),
 * so the client stays stateless.
 *
 * Zero dependencies (native fetch types only).
 */

export interface DirectoryUser {
  /** WorkOS directory user id (`directory_user_…`). */
  id: string;
  /** Primary email — top-level `email`, else the primary/first entry of `emails[]`. */
  email?: string;
  firstName: string;
  lastName: string;
  /** `first_name last_name`, falling back to custom `displayName`, then id. */
  displayName: string;
  title?: string;
  department?: string;
  state?: 'active' | 'suspended' | 'inactive';
  customAttributes: Record<string, unknown>;
  /** ISO 8601 from WorkOS. */
  createdAt?: string;
}

export interface WorkOsDirectoryClient {
  /** First user whose primary email matches (case-insensitive), or null. */
  findByEmail(email: string): Promise<DirectoryUser | null>;
  /** First user whose custom attribute equals `value` (e.g. `githubLogin`, `slackUserId`), or null. */
  findByCustomAttribute(attribute: string, value: string): Promise<DirectoryUser | null>;
  /** Users created at or after `since` (new-joiner detection). */
  listUsersSince(since: Date): Promise<DirectoryUser[]>;
  /** All members of a directory group. Filter on `state` at the call site if needed. */
  listUsersInGroup(groupId: string): Promise<DirectoryUser[]>;
}

export interface WorkOsDirectoryConfig {
  apiKey: string;
  directoryId: string;
  /** Default: https://api.workos.com */
  baseUrl?: string;
  /** Injected fetch port. Default: globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Page size for cursor pagination. Default: 100 (WorkOS max). */
  pageSize?: number;
  /** Upper bound on pages walked per call. Default: 50. */
  maxPages?: number;
}

interface RawDirectoryUser {
  id: string;
  email?: string | null;
  emails?: Array<{ primary?: boolean; type?: string; value: string }>;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  state?: 'active' | 'suspended' | 'inactive';
  custom_attributes?: Record<string, unknown>;
  created_at?: string;
}

interface RawDirectoryUserList {
  data: RawDirectoryUser[];
  list_metadata?: { after?: string | null };
}

function primaryEmailOf(raw: RawDirectoryUser): string | undefined {
  if (raw.email) return raw.email;
  const emails = raw.emails ?? [];
  return emails.find((e) => e.primary)?.value ?? emails[0]?.value;
}

function toDirectoryUser(raw: RawDirectoryUser): DirectoryUser {
  const attrs = raw.custom_attributes ?? {};
  const displayName =
    [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim() ||
    String(attrs.displayName ?? raw.id);
  const email = primaryEmailOf(raw);
  return {
    id: raw.id,
    ...(email !== undefined ? { email } : {}),
    firstName: raw.first_name ?? '',
    lastName: raw.last_name ?? '',
    displayName,
    ...(raw.job_title != null
      ? { title: raw.job_title }
      : typeof attrs.title === 'string'
        ? { title: attrs.title }
        : {}),
    ...(typeof attrs.department === 'string' ? { department: attrs.department } : {}),
    ...(raw.state !== undefined ? { state: raw.state } : {}),
    customAttributes: attrs,
    ...(raw.created_at !== undefined ? { createdAt: raw.created_at } : {}),
  };
}

export function createWorkOsDirectoryClient(config: WorkOsDirectoryConfig): WorkOsDirectoryClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = (config.baseUrl ?? 'https://api.workos.com').replace(/\/$/, '');
  const pageSize = config.pageSize ?? 100;
  const maxPages = config.maxPages ?? 50;
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    Accept: 'application/json',
  };

  async function* walk(params: { group?: string } = {}): AsyncGenerator<RawDirectoryUser> {
    let after: string | null | undefined;
    for (let page = 0; page < maxPages; page++) {
      const url = new URL(`${baseUrl}/directory_users`);
      url.searchParams.set('directory', config.directoryId);
      url.searchParams.set('limit', String(pageSize));
      if (params.group) url.searchParams.set('group', params.group);
      if (after) url.searchParams.set('after', after);

      const response = await fetchImpl(url.toString(), { headers });
      if (!response.ok) {
        throw new Error(`WorkOS directory list failed (${response.status} ${response.statusText})`);
      }
      const body = (await response.json()) as RawDirectoryUserList;
      for (const user of body.data) yield user;

      after = body.list_metadata?.after;
      if (!after) return;
    }
  }

  return {
    async findByEmail(email) {
      const needle = email.toLowerCase();
      for await (const raw of walk()) {
        if (primaryEmailOf(raw)?.toLowerCase() === needle) return toDirectoryUser(raw);
      }
      return null;
    },

    async findByCustomAttribute(attribute, value) {
      for await (const raw of walk()) {
        const attr = raw.custom_attributes?.[attribute];
        if (typeof attr === 'string' && attr === value) return toDirectoryUser(raw);
      }
      return null;
    },

    async listUsersSince(since) {
      const cutoff = since.getTime();
      const matches: DirectoryUser[] = [];
      for await (const raw of walk()) {
        const created = raw.created_at ? Date.parse(raw.created_at) : NaN;
        if (!Number.isNaN(created) && created >= cutoff) matches.push(toDirectoryUser(raw));
      }
      return matches;
    },

    async listUsersInGroup(groupId) {
      const members: DirectoryUser[] = [];
      for await (const raw of walk({ group: groupId })) {
        members.push(toDirectoryUser(raw));
      }
      return members;
    },
  };
}

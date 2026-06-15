import { api } from './api';

export const communityService = {
  /**
   * Preview a TrustCircle by invite code before joining.
   * Returns community info + member count.
   */
  async preview(inviteCode: string) {
    return api.get<{ community: any; member_count: number }>(
      `/community/info/${inviteCode.toUpperCase().trim()}`,
    );
  },

  /**
   * Join a private TrustCircle by invite code (Layer 4).
   */
  async join(inviteCode: string) {
    return api.post<{ community: any; is_primary: boolean }>('/community/join', {
      invite_code: inviteCode.toUpperCase().trim(),
    });
  },

  /**
   * Join-or-create an open pool community.
   * Layer 2 (organisation): backend verifies email domain matches.
   * Layer 3 (locality): self-declared, starts unconfirmed.
   */
  async joinOrCreate(params: {
    name: string;
    type: string;
    trust_layer: 'organisation' | 'locality';
    verification_domain?: string;
    locality_confirmed?: boolean;
  }) {
    return api.post<{ community: any; created: boolean; is_primary: boolean }>(
      '/community/join-or-create',
      params,
    );
  },

  /**
   * Create a new private TrustCircle group (Layer 4).
   * Returns the generated invite code.
   */
  async create(params: {
    name: string;
    type: string;
    description?: string;
    city?: string;
  }) {
    return api.post<{ community: any; invite_code: string }>('/community/create', params);
  },

  /**
   * Get the current user's community memberships.
   */
  async myCommunities() {
    return api.get<{ communities: any[] }>('/community/my');
  },

  /**
   * Get the list of verified institutional domains.
   */
  async knownDomains() {
    return api.get<{ domains: Record<string, { name: string; type: string }> }>(
      '/community/known-domains',
    );
  },
};
/**
 * OpenSky Network OAuth2 Client Credentials Token Manager.
 *
 * Handles token acquisition, in-memory caching, and automatic refresh.
 * Falls back to unauthenticated access when no credentials are configured.
 */

const TOKEN_ENDPOINT =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

/** Buffer before expiry to trigger a proactive refresh (2 minutes). */
const REFRESH_BUFFER_MS = 2 * 60 * 1000;

interface TokenData {
  accessToken: string;
  expiresAt: number; // epoch ms
}

export class OpenSkyAuth {
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  private token: TokenData | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || undefined;
    this.clientSecret = clientSecret || undefined;

    if (this.clientId && this.clientSecret) {
      console.log('[opensky-auth] OAuth2 credentials configured');
    } else {
      console.log(
        '[opensky-auth] No credentials — using unauthenticated access (limited rate)',
      );
    }
  }

  /** Whether OAuth2 credentials are available. */
  get hasCredentials(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Get a valid Bearer token, refreshing if necessary.
   * Returns null when no credentials are configured (unauthenticated mode).
   */
  async getToken(): Promise<string | null> {
    if (!this.hasCredentials) return null;

    // Token still valid and not close to expiry
    if (this.token && Date.now() < this.token.expiresAt - REFRESH_BUFFER_MS) {
      return this.token.accessToken;
    }

    // Coalesce concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.fetchToken();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /** Request a new token from the OAuth2 endpoint. */
  private async fetchToken(): Promise<string | null> {
    try {
      console.log('[opensky-auth] Requesting new OAuth2 token...');

      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
      });

      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error(
          `[opensky-auth] Token request failed: ${response.status} ${response.statusText}`,
          text,
        );
        // Keep the old token if it hasn't fully expired yet
        if (this.token && Date.now() < this.token.expiresAt) {
          return this.token.accessToken;
        }
        return null;
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
        token_type: string;
      };

      this.token = {
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      const expiresInMin = Math.round(data.expires_in / 60);
      console.log(
        `[opensky-auth] Token acquired, expires in ${expiresInMin} minutes`,
      );

      return this.token.accessToken;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[opensky-auth] Token fetch error:', msg);
      // Return existing token if still technically valid
      if (this.token && Date.now() < this.token.expiresAt) {
        return this.token.accessToken;
      }
      return null;
    }
  }
}

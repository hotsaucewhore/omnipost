import { StoredAccountRecord } from './adapters/types';

export interface RefreshedTokenOutcome {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

const EXPIRY_SAFETY_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

export function isAccountTokenExpiring(account: StoredAccountRecord): boolean {
  if (account.mode !== 'live' || !account.refreshToken) return false;
  if (!account.expiresAt) return false;
  const expMs = new Date(account.expiresAt).getTime();
  if (!Number.isFinite(expMs)) return false;
  return expMs - Date.now() <= EXPIRY_SAFETY_BUFFER_MS;
}

export async function requestProviderTokenRefresh(
  account: StoredAccountRecord
): Promise<RefreshedTokenOutcome | null> {
  if (!account.refreshToken) return null;

  switch (account.platformGroup) {
    case 'youtube': {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return null;
      }
      const body = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: account.refreshToken,
        grant_type: 'refresh_token',
      });
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const json: any = await res.json();
      if (!res.ok || !json.access_token) {
        throw new Error(
          json?.error_description || 'YouTube OAuth token refresh failed'
        );
      }
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token || account.refreshToken,
        expiresAt: new Date(
          Date.now() + Number(json.expires_in || 3600) * 1000
        ).toISOString(),
      };
    }

    case 'tiktok': {
      if (
        !process.env.TIKTOK_CLIENT_KEY ||
        !process.env.TIKTOK_CLIENT_SECRET
      ) {
        return null;
      }
      const body = new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
      });
      const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const json: any = await res.json();
      if (!res.ok || !json.access_token) {
        throw new Error(
          json?.error_description || 'TikTok OAuth token refresh failed'
        );
      }
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token || account.refreshToken,
        expiresAt: new Date(
          Date.now() + Number(json.expires_in || 86400) * 1000
        ).toISOString(),
      };
    }

    case 'x': {
      if (!process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET) {
        return null;
      }
      const basic = Buffer.from(
        `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`
      ).toString('base64');
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
      });
      const res = await fetch('https://api.x.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      const json: any = await res.json();
      if (!res.ok || !json.access_token) {
        throw new Error(
          json?.error_description || 'X OAuth 2.0 token refresh failed'
        );
      }
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token || account.refreshToken,
        expiresAt: new Date(
          Date.now() + Number(json.expires_in || 7200) * 1000
        ).toISOString(),
      };
    }

    case 'bluesky': {
      const res = await fetch(
        'https://bsky.social/xrpc/com.atproto.server.refreshSession',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${account.refreshToken}` },
        }
      );
      const json: any = await res.json();
      if (!res.ok || !json.accessJwt) {
        throw new Error(json?.message || 'Bluesky AT session refresh failed');
      }
      return {
        accessToken: json.accessJwt,
        refreshToken: json.refreshJwt || account.refreshToken,
        expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      };
    }

    case 'linkedin': {
      if (
        !process.env.LINKEDIN_CLIENT_ID ||
        !process.env.LINKEDIN_CLIENT_SECRET
      ) {
        return null;
      }
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      });
      const res = await fetch(
        'https://www.linkedin.com/oauth/v2/accessToken',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        }
      );
      const json: any = await res.json();
      if (!res.ok || !json.access_token) {
        throw new Error(
          json?.error_description || 'LinkedIn token refresh failed'
        );
      }
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token || account.refreshToken,
        expiresAt: new Date(
          Date.now() + Number(json.expires_in || 5184000) * 1000
        ).toISOString(),
      };
    }

    default:
      return null;
  }
}

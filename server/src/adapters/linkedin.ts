import { OAuthTokenBundle, PlatformAdapter, PublishAdapterContext } from './types';

export const linkedinAdapter: PlatformAdapter = {
  accountGroup: 'linkedin',

  isLiveConfigured(): boolean {
    return Boolean(
      process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET
    );
  },

  getOAuthUrl(redirectUri: string, state: string) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      state,
      scope: 'openid profile w_member_social',
    });
    return {
      authUrl: `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`,
    };
  },

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<OAuthTokenBundle> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
    });

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error(tokenJson.error_description || 'LinkedIn OAuth failed');
    }

    const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const meJson: any = await meRes.json();

    return {
      accessToken: tokenJson.access_token,
      expiresInSec: tokenJson.expires_in,
      externalAccountId: `urn:li:person:${meJson.sub}`,
      handle: meJson.name || 'LinkedIn Member',
      displayName: meJson.name || 'LinkedIn Profile',
    };
  },

  async publishVideo(ctx: PublishAdapterContext) {
    if (!ctx.account.accessToken || !ctx.account.externalAccountId) {
      throw new Error('Missing LinkedIn access token or member URN.');
    }

    ctx.onProgress('processing', 65, 'Publishing post to LinkedIn...');

    const postRes = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.account.accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': '202501',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: ctx.account.externalAccountId,
        commentary: ctx.resolvedText.combinedCaptionOrDescription.slice(0, 3000),
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    });

    if (!postRes.ok) {
      const errTxt = await postRes.text();
      throw new Error(`LinkedIn publish failed: ${errTxt}`);
    }

    const postUrn = postRes.headers.get('x-restli-id') || `li_${Date.now()}`;
    return {
      externalPostId: postUrn,
      externalUrl: `https://www.linkedin.com/feed/update/${postUrn}/`,
    };
  },
};

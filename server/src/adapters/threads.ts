import { OAuthTokenBundle, PlatformAdapter, PublishAdapterContext } from './types';

export const threadsAdapter: PlatformAdapter = {
  accountGroup: 'threads',

  isLiveConfigured(): boolean {
    return Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET);
  },

  getOAuthUrl(redirectUri: string, state: string) {
    const params = new URLSearchParams({
      client_id: process.env.THREADS_APP_ID ?? '',
      redirect_uri: redirectUri,
      scope: 'threads_basic,threads_content_publish',
      response_type: 'code',
      state,
    });
    return {
      authUrl: `https://threads.net/oauth/authorize?${params.toString()}`,
    };
  },

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<OAuthTokenBundle> {
    const body = new URLSearchParams({
      client_id: process.env.THREADS_APP_ID ?? '',
      client_secret: process.env.THREADS_APP_SECRET ?? '',
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || tokenJson.error_message) {
      throw new Error(tokenJson.error_message || 'Threads OAuth exchange failed');
    }

    const meRes = await fetch(
      `https://graph.threads.net/v1.0/me?fields=id,username,name&access_token=${tokenJson.access_token}`
    );
    const meJson: any = await meRes.json();

    return {
      accessToken: tokenJson.access_token,
      externalAccountId: String(meJson.id || tokenJson.user_id || 'threads_user'),
      handle: meJson.username ? `@${meJson.username}` : '@threads.creator',
      displayName: meJson.name || 'Threads Profile',
    };
  },

  async publishVideo(ctx: PublishAdapterContext) {
    if (!ctx.account.accessToken || !ctx.account.externalAccountId) {
      throw new Error('Missing Threads access token or user ID.');
    }

    const userId = ctx.account.externalAccountId;
    const token = ctx.account.accessToken;

    ctx.onProgress('uploading', 40, 'Creating Threads container...');

    const createParams = new URLSearchParams({
      media_type: 'TEXT',
      text: ctx.resolvedText.combinedCaptionOrDescription.slice(0, 500),
      access_token: token,
    });

    const createRes = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads?${createParams.toString()}`,
      { method: 'POST' }
    );
    const createJson: any = await createRes.json();
    if (!createRes.ok || !createJson.id) {
      throw new Error(createJson?.error?.message || 'Threads container creation failed');
    }

    ctx.onProgress('processing', 80, 'Publishing Threads post...');
    const pubParams = new URLSearchParams({
      creation_id: createJson.id,
      access_token: token,
    });
    const pubRes = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads_publish?${pubParams.toString()}`,
      { method: 'POST' }
    );
    const pubJson: any = await pubRes.json();
    if (!pubRes.ok || !pubJson.id) {
      throw new Error(pubJson?.error?.message || 'Threads publish failed');
    }

    return {
      externalPostId: pubJson.id,
      externalUrl: `https://www.threads.net/${ctx.account.handle}`,
    };
  },
};

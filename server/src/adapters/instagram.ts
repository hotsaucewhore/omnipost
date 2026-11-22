import fs from 'fs';
import { OAuthTokenBundle, PlatformAdapter, PublishAdapterContext } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const instagramAdapter: PlatformAdapter = {
  accountGroup: 'instagram',

  isLiveConfigured(): boolean {
    return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  },

  getOAuthUrl(redirectUri: string, state: string) {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID ?? '',
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope:
        'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement',
    });
    return {
      authUrl: `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`,
    };
  },

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<OAuthTokenBundle> {
    const tokenParams = new URLSearchParams({
      client_id: process.env.META_APP_ID ?? '',
      client_secret: process.env.META_APP_SECRET ?? '',
      redirect_uri: redirectUri,
      code,
    });
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?${tokenParams.toString()}`
    );
    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || tokenJson.error) {
      throw new Error(tokenJson.error?.message || 'Instagram Meta OAuth failed');
    }

    // Discover connected Instagram Business/Creator account via Facebook Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,username,name}&access_token=${tokenJson.access_token}`
    );
    const pagesJson: any = await pagesRes.json();
    const pageWithIg = (pagesJson?.data ?? []).find(
      (p: any) => p.instagram_business_account?.id
    );
    const igAcc = pageWithIg?.instagram_business_account;
    if (!igAcc?.id) {
      throw new Error(
        'No Instagram Professional account linked to a Facebook Page was found on this Meta login.'
      );
    }

    return {
      accessToken: tokenJson.access_token,
      expiresInSec: tokenJson.expires_in,
      externalAccountId: igAcc.id,
      handle: igAcc.username ? `@${igAcc.username}` : '@ig.creator',
      displayName: igAcc.name || pageWithIg.name || 'Instagram Creator',
    };
  },

  async publishVideo(ctx: PublishAdapterContext) {
    if (!ctx.videoFilePath || !fs.existsSync(ctx.videoFilePath)) {
      throw new Error('Video file missing on relay server for Instagram Reels.');
    }
    if (!ctx.account.accessToken || !ctx.account.externalAccountId) {
      throw new Error('Missing Instagram Graph API credentials.');
    }

    const igUserId = ctx.account.externalAccountId;
    const token = ctx.account.accessToken;
    const fileBuffer = fs.readFileSync(ctx.videoFilePath);

    ctx.onProgress('uploading', 15, 'Creating Instagram Reels resumable container...');

    const initRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'REELS',
          upload_type: 'resumable',
          caption: ctx.resolvedText.combinedCaptionOrDescription.slice(0, 2200),
          share_to_feed: ctx.override.igShareToFeed !== false,
          access_token: token,
        }),
      }
    );
    const initJson: any = await initRes.json();
    if (!initRes.ok || initJson.error) {
      throw new Error(initJson.error?.message || 'Failed to create IG Reels container');
    }

    const containerId: string = initJson.id;
    ctx.onProgress('uploading', 50, 'Uploading video stream to Meta rupload...');

    const uploadRes = await fetch(
      `https://rupload.facebook.com/ig-api-upload/v21.0/${containerId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${token}`,
          offset: '0',
          file_size: String(fileBuffer.byteLength),
        },
        body: fileBuffer,
      }
    );
    if (!uploadRes.ok) {
      throw new Error(`Instagram Reels binary upload failed (${uploadRes.status})`);
    }

    ctx.onProgress('processing', 80, 'Waiting for Instagram Reels transcoding...');

    for (let attempt = 0; attempt < 15; attempt++) {
      const statusRes = await fetch(
        `https://graph.facebook.com/v21.0/${containerId}?fields=status_code,status&access_token=${token}`
      );
      const statusJson: any = await statusRes.json();
      if (statusJson.status_code === 'FINISHED') break;
      if (statusJson.status_code === 'ERROR') {
        throw new Error(statusJson.status || 'Instagram Reels container processing failed');
      }
      await sleep(3000);
    }

    const pubRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: token,
        }),
      }
    );
    const pubJson: any = await pubRes.json();
    if (!pubRes.ok || pubJson.error) {
      throw new Error(pubJson.error?.message || 'Failed to publish Instagram Reel');
    }

    return {
      externalPostId: pubJson.id,
      externalUrl: `https://www.instagram.com/${ctx.account.handle.replace(/^@/, '')}/`,
    };
  },
};

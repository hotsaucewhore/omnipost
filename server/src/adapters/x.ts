import crypto from 'crypto';
import fs from 'fs';
import { OAuthTokenBundle, PlatformAdapter, PublishAdapterContext } from './types';

export const xAdapter: PlatformAdapter = {
  accountGroup: 'x',

  isLiveConfigured(): boolean {
    return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
  },

  getOAuthUrl(redirectUri: string, state: string) {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.X_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      scope: 'tweet.read tweet.write users.read media.write offline.access',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      authUrl: `https://x.com/i/oauth2/authorize?${params.toString()}`,
      codeVerifier,
    };
  },

  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OAuthTokenBundle> {
    const basic = Buffer.from(
      `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`
    ).toString('base64');

    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });

    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || tokenJson.error) {
      throw new Error(tokenJson.error_description || 'X OAuth 2.0 failed');
    }

    const meRes = await fetch('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const meJson: any = await meRes.json();
    const user = meJson?.data ?? {};

    return {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresInSec: tokenJson.expires_in,
      externalAccountId: user.id || 'x_user',
      handle: user.username ? `@${user.username}` : '@x_creator',
      displayName: user.name || 'X Account',
    };
  },

  async publishVideo(ctx: PublishAdapterContext) {
    if (!ctx.account.accessToken) {
      throw new Error('Missing X OAuth access token.');
    }

    const mediaIds: string[] = [];

    if (ctx.postKind === 'photo' && ctx.photoFilePaths?.length) {
      const slice = ctx.photoFilePaths.slice(0, 4);
      ctx.onProgress('uploading', 35, `Uploading ${slice.length} photo(s) to X...`);
      for (const p of slice) {
        if (!fs.existsSync(p)) continue;
        const form = new FormData();
        form.append('media', new Blob([fs.readFileSync(p)]), 'photo.jpg');
        form.append('media_category', 'tweet_image');
        const upRes = await fetch('https://api.x.com/2/media/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${ctx.account.accessToken}` },
          body: form,
        });
        const upJson: any = await upRes.json();
        if (upJson?.data?.id) mediaIds.push(upJson.data.id);
      }
    }

    ctx.onProgress('processing', 75, 'Publishing post to X...');

    const payload: any = {
      text: ctx.resolvedText.combinedCaptionOrDescription.slice(0, 280),
    };
    if (mediaIds.length > 0) {
      payload.media = { media_ids: mediaIds };
    }

    const tweetRes = await fetch('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const tweetJson: any = await tweetRes.json();
    if (!tweetRes.ok || !tweetJson?.data?.id) {
      throw new Error(tweetJson?.detail || 'Failed to publish post on X');
    }

    const id = tweetJson.data.id;
    let firstCommentPosted = false;

    if (ctx.resolvedText.firstComment) {
      ctx.onProgress('processing', 92, 'Posting first-comment reply on X...');
      const replyRes = await fetch('https://api.x.com/2/tweets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.account.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: ctx.resolvedText.firstComment.slice(0, 280),
          reply: { in_reply_to_tweet_id: id },
        }),
      });
      if (replyRes.ok) {
        firstCommentPosted = true;
      }
    }

    return {
      externalPostId: id,
      externalUrl: `https://x.com/${ctx.account.handle.replace(/^@/, '')}/status/${id}`,
      firstCommentPosted,
    };
  },
};

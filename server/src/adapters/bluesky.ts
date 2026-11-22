import fs from 'fs';
import { OAuthTokenBundle, PlatformAdapter, PublishAdapterContext } from './types';

export const blueskyAdapter: PlatformAdapter = {
  accountGroup: 'bluesky',

  isLiveConfigured(): boolean {
    return Boolean(
      process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD
    );
  },

  getOAuthUrl(redirectUri: string, state: string) {
    // Bluesky supports instant App Password session auth via our local callback
    return {
      authUrl: `${redirectUri}?code=bsky_env_auth&state=${state}`,
    };
  },

  async exchangeCodeForToken(): Promise<OAuthTokenBundle> {
    const res = await fetch(
      'https://bsky.social/xrpc/com.atproto.server.createSession',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: process.env.BLUESKY_IDENTIFIER,
          password: process.env.BLUESKY_APP_PASSWORD,
        }),
      }
    );
    const json: any = await res.json();
    if (!res.ok || !json.accessJwt) {
      throw new Error(json.message || 'Bluesky session login failed');
    }

    return {
      accessToken: json.accessJwt,
      refreshToken: json.refreshJwt,
      externalAccountId: json.did,
      handle: `@${json.handle}`,
      displayName: json.handle,
    };
  },

  async publishVideo(ctx: PublishAdapterContext) {
    // Refresh session if configured via env
    let accessJwt = ctx.account.accessToken;
    let did = ctx.account.externalAccountId;
    let handle = ctx.account.handle.replace(/^@/, '');

    if (this.isLiveConfigured() && (!accessJwt || !did)) {
      const fresh = await this.exchangeCodeForToken('', '');
      accessJwt = fresh.accessToken;
      did = fresh.externalAccountId;
      handle = fresh.handle.replace(/^@/, '');
    }

    if (!accessJwt || !did) {
      throw new Error('Missing Bluesky session credentials.');
    }

    let embed: any = undefined;

    if (ctx.postKind === 'photo' && ctx.photoFilePaths?.length) {
      const slice = ctx.photoFilePaths.slice(0, 4);
      ctx.onProgress(
        'uploading',
        40,
        `Uploading ${slice.length} image blob(s) to Bluesky...`
      );
      const images: any[] = [];
      for (const filePath of slice) {
        if (!fs.existsSync(filePath)) continue;
        const bytes = fs.readFileSync(filePath);
        const blobRes = await fetch(
          'https://bsky.social/xrpc/com.atproto.repo.uploadBlob',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessJwt}`,
              'Content-Type': 'image/jpeg',
            },
            body: bytes,
          }
        );
        const blobJson: any = await blobRes.json();
        if (blobJson?.blob) {
          images.push({ alt: ctx.resolvedText.title || '', image: blobJson.blob });
        }
      }
      if (images.length > 0) {
        embed = {
          $type: 'app.bsky.embed.images',
          images,
        };
      }
    }

    ctx.onProgress('processing', 80, 'Creating Bluesky AT Protocol record...');

    const recordRes = await fetch(
      'https://bsky.social/xrpc/com.atproto.repo.createRecord',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo: did,
          collection: 'app.bsky.feed.post',
          record: {
            $type: 'app.bsky.feed.post',
            text: ctx.resolvedText.combinedCaptionOrDescription.slice(0, 300),
            createdAt: new Date().toISOString(),
            ...(embed ? { embed } : {}),
          },
        }),
      }
    );
    const recJson: any = await recordRes.json();
    if (!recordRes.ok || !recJson.uri) {
      throw new Error(recJson.message || 'Bluesky post creation failed');
    }

    const rkey = String(recJson.uri).split('/').pop() || '';
    let firstCommentPosted = false;

    if (ctx.resolvedText.firstComment && recJson.cid) {
      ctx.onProgress('processing', 92, 'Posting first-comment reply on Bluesky...');
      const replyRes = await fetch(
        'https://bsky.social/xrpc/com.atproto.repo.createRecord',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessJwt}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            repo: did,
            collection: 'app.bsky.feed.post',
            record: {
              $type: 'app.bsky.feed.post',
              text: ctx.resolvedText.firstComment.slice(0, 300),
              createdAt: new Date().toISOString(),
              reply: {
                root: { uri: recJson.uri, cid: recJson.cid },
                parent: { uri: recJson.uri, cid: recJson.cid },
              },
            },
          }),
        }
      );
      if (replyRes.ok) {
        firstCommentPosted = true;
      }
    }

    return {
      externalPostId: String(recJson.uri),
      externalUrl: `https://bsky.app/profile/${handle}/post/${rkey}`,
      firstCommentPosted,
    };
  },
};

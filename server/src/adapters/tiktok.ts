import crypto from 'crypto';
import fs from 'fs';
import { OAuthTokenBundle, PlatformAdapter, PublishAdapterContext } from './types';

export const tiktokAdapter: PlatformAdapter = {
  accountGroup: 'tiktok',

  isLiveConfigured(): boolean {
    return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
  },

  getOAuthUrl(redirectUri: string, state: string) {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
      scope: 'user.info.basic,video.publish,video.upload',
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      authUrl: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`,
      codeVerifier,
    };
  },

  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OAuthTokenBundle> {
    const body = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
      client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });

    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || tokenJson.error) {
      throw new Error(tokenJson.error_description || 'TikTok token exchange failed');
    }

    const userRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username',
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      }
    );
    const userJson: any = await userRes.json();
    const user = userJson?.data?.user ?? {};

    return {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresInSec: tokenJson.expires_in,
      externalAccountId: tokenJson.open_id || user.open_id || 'tiktok_user',
      handle: user.username ? `@${user.username}` : '@tiktok.creator',
      displayName: user.display_name || 'TikTok Creator',
    };
  },

  async publishVideo(ctx: PublishAdapterContext) {
    if (!ctx.videoFilePath || !fs.existsSync(ctx.videoFilePath)) {
      throw new Error('Video file missing on relay server for TikTok Direct Post.');
    }
    if (!ctx.account.accessToken) {
      throw new Error('Missing TikTok OAuth access token.');
    }

    const stat = fs.statSync(ctx.videoFilePath);
    const fileSize = stat.size;

    ctx.onProgress('uploading', 15, 'Initializing TikTok Content Posting API v2...');

    const initRes = await fetch(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.account.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            title: ctx.resolvedText.combinedCaptionOrDescription.slice(0, 2200),
            privacy_level: ctx.override.tiktokPrivacy ?? 'PUBLIC_TO_EVERYONE',
            disable_comment: ctx.override.tiktokAllowComments === false,
            disable_duet: ctx.override.tiktokAllowDuet === false,
            disable_stitch: ctx.override.tiktokAllowStitch === false,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: fileSize,
            chunk_size: fileSize,
            total_chunk_count: 1,
          },
        }),
      }
    );

    const initJson: any = await initRes.json();
    if (!initRes.ok || initJson?.error?.code !== 'ok') {
      throw new Error(
        initJson?.error?.message || 'TikTok video init failed'
      );
    }

    const uploadUrl: string = initJson.data.upload_url;
    const publishId: string = initJson.data.publish_id;

    ctx.onProgress('uploading', 55, 'Uploading video binary to TikTok...');
    const fileBuffer = fs.readFileSync(ctx.videoFilePath);

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': ctx.videoMeta?.mimeType || 'video/mp4',
        'Content-Length': String(fileSize),
        'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
      },
      body: fileBuffer,
    });

    if (!putRes.ok) {
      throw new Error(`TikTok binary upload failed (${putRes.status})`);
    }

    ctx.onProgress('processing', 90, 'TikTok accepted video for publishing...');

    return {
      externalPostId: publishId,
      externalUrl: `https://www.tiktok.com/${ctx.account.handle}`,
    };
  },
};

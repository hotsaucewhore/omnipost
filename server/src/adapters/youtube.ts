import fs from 'fs';
import { OAuthTokenBundle, PlatformAdapter, PublishAdapterContext } from './types';

export const youtubeAdapter: PlatformAdapter = {
  accountGroup: 'youtube',

  isLiveConfigured(): boolean {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },

  getOAuthUrl(redirectUri: string, state: string) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state,
      scope: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
      ].join(' '),
    });
    return {
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  },

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<OAuthTokenBundle> {
    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || tokenJson.error) {
      throw new Error(tokenJson.error_description || 'Google OAuth exchange failed');
    }

    const chRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      }
    );
    const chJson: any = await chRes.json();
    const channel = chJson?.items?.[0];

    return {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresInSec: tokenJson.expires_in,
      externalAccountId: channel?.id || 'yt_channel',
      handle: channel?.snippet?.customUrl || '@YouTubeCreator',
      displayName: channel?.snippet?.title || 'YouTube Channel',
    };
  },

  async publishVideo(ctx: PublishAdapterContext) {
    if (!ctx.videoFilePath || !fs.existsSync(ctx.videoFilePath)) {
      throw new Error('Video file missing on relay server for YouTube upload.');
    }
    if (!ctx.account.accessToken) {
      throw new Error('Missing YouTube OAuth access token.');
    }

    const fileBuffer = fs.readFileSync(ctx.videoFilePath);
    const isShort = ctx.platformId === 'youtube_shorts';
    const tags = (ctx.override.ytTags ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    ctx.onProgress(
      'uploading',
      18,
      `Initializing YouTube ${isShort ? 'Shorts' : 'Long-Form'} resumable session...`
    );

    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.account.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(fileBuffer.byteLength),
          'X-Upload-Content-Type': ctx.videoMeta?.mimeType || 'video/mp4',
        },
        body: JSON.stringify({
          snippet: {
            title: ctx.resolvedText.title.slice(0, 100) || 'Untitled Video',
            description: ctx.resolvedText.combinedCaptionOrDescription.slice(0, 5000),
            tags: tags.length > 0 ? tags : undefined,
            categoryId: ctx.override.ytCategoryId || '22',
          },
          status: {
            privacyStatus: ctx.override.ytVisibility || 'public',
            selfDeclaredMadeForKids: Boolean(ctx.override.ytMadeForKids),
          },
        }),
      }
    );

    const uploadLocation = initRes.headers.get('location');
    if (!initRes.ok || !uploadLocation) {
      const errText = await initRes.text();
      throw new Error(`YouTube resumable init failed: ${errText}`);
    }

    ctx.onProgress('uploading', 60, 'Streaming video binary to YouTube Data API v3...');

    const putRes = await fetch(uploadLocation, {
      method: 'PUT',
      headers: {
        'Content-Type': ctx.videoMeta?.mimeType || 'video/mp4',
        'Content-Length': String(fileBuffer.byteLength),
      },
      body: fileBuffer,
    });
    const putJson: any = await putRes.json();
    if (!putRes.ok || !putJson.id) {
      throw new Error(putJson?.error?.message || 'YouTube binary upload failed');
    }

    const videoId: string = putJson.id;

    // Upload custom thumbnail for Long-Form if provided
    if (!isShort && ctx.thumbnailFilePath && fs.existsSync(ctx.thumbnailFilePath)) {
      ctx.onProgress('processing', 88, 'Applying custom 16:9 thumbnail...');
      const thumbBytes = fs.readFileSync(ctx.thumbnailFilePath);
      await fetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ctx.account.accessToken}`,
            'Content-Type': 'image/jpeg',
          },
          body: thumbBytes,
        }
      );
    }

    return {
      externalPostId: videoId,
      externalUrl: isShort
        ? `https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`,
    };
  },
};

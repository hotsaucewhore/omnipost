import fs from 'fs';
import { OAuthTokenBundle, PlatformAdapter, PublishAdapterContext } from './types';

export const facebookAdapter: PlatformAdapter = {
  accountGroup: 'facebook',

  isLiveConfigured(): boolean {
    return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  },

  getOAuthUrl(redirectUri: string, state: string) {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID ?? '',
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts',
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
      throw new Error(tokenJson.error?.message || 'Facebook Meta OAuth failed');
    }

    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${tokenJson.access_token}`
    );
    const pagesJson: any = await pagesRes.json();
    const firstPage = pagesJson?.data?.[0];
    if (!firstPage?.id || !firstPage?.access_token) {
      throw new Error('No managed Facebook Page found on this Meta account.');
    }

    return {
      accessToken: firstPage.access_token, // Page access token is required for Page Video/Reels publishing
      externalAccountId: firstPage.id,
      handle: firstPage.name,
      displayName: firstPage.name,
    };
  },

  async publishVideo(ctx: PublishAdapterContext) {
    if (!ctx.account.accessToken || !ctx.account.externalAccountId) {
      throw new Error('Missing Facebook Page token or Page ID.');
    }

    const pageId = ctx.account.externalAccountId;
    const pageToken = ctx.account.accessToken;

    if (ctx.postKind === 'text') {
      ctx.onProgress('uploading', 50, 'Publishing text post to Facebook Page...');
      const feedRes = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/feed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: ctx.resolvedText.combinedCaptionOrDescription,
            access_token: pageToken,
          }),
        }
      );
      const feedJson: any = await feedRes.json();
      if (!feedRes.ok || feedJson.error) {
        throw new Error(feedJson?.error?.message || 'Facebook Page text post failed');
      }
      return {
        externalPostId: feedJson.id,
        externalUrl: `https://www.facebook.com/${feedJson.id}`,
      };
    }

    if (ctx.postKind === 'photo' && ctx.photoFilePaths?.length) {
      const batch = ctx.photoFilePaths.slice(0, 20);
      ctx.onProgress(
        'uploading',
        45,
        `Uploading ${batch.length} photo(s) to Facebook Page...`
      );
      if (batch.length === 1) {
        const firstPhoto = fs.readFileSync(batch[0]);
        const form = new FormData();
        form.append('access_token', pageToken);
        form.append('message', ctx.resolvedText.combinedCaptionOrDescription);
        form.append(
          'source',
          new Blob([firstPhoto], { type: 'image/jpeg' }),
          'photo.jpg'
        );
        const photoRes = await fetch(
          `https://graph.facebook.com/v21.0/${pageId}/photos`,
          { method: 'POST', body: form }
        );
        const photoJson: any = await photoRes.json();
        if (!photoRes.ok || photoJson.error) {
          throw new Error(
            photoJson?.error?.message || 'Facebook Page photo upload failed'
          );
        }
        return {
          externalPostId: photoJson.post_id || photoJson.id,
          externalUrl: `https://www.facebook.com/${
            photoJson.post_id || photoJson.id
          }`,
        };
      }

      const mediaFbids: { media_fbid: string }[] = [];
      for (let i = 0; i < batch.length; i++) {
        const buf = fs.readFileSync(batch[i]);
        const form = new FormData();
        form.append('access_token', pageToken);
        form.append('published', 'false');
        form.append(
          'source',
          new Blob([buf], { type: 'image/jpeg' }),
          `photo_${i + 1}.jpg`
        );
        const pRes = await fetch(
          `https://graph.facebook.com/v21.0/${pageId}/photos`,
          { method: 'POST', body: form }
        );
        const pJson: any = await pRes.json();
        if (!pRes.ok || !pJson.id) {
          throw new Error(
            pJson?.error?.message || `Facebook carousel photo ${i + 1} failed`
          );
        }
        mediaFbids.push({ media_fbid: pJson.id });
      }

      const feedRes = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/feed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: ctx.resolvedText.combinedCaptionOrDescription,
            attached_media: mediaFbids,
            access_token: pageToken,
          }),
        }
      );
      const feedJson: any = await feedRes.json();
      if (!feedRes.ok || feedJson.error) {
        throw new Error(
          feedJson?.error?.message || 'Facebook multi-photo feed post failed'
        );
      }
      return {
        externalPostId: feedJson.id,
        externalUrl: `https://www.facebook.com/${feedJson.id}`,
      };
    }

    if (!ctx.videoFilePath || !fs.existsSync(ctx.videoFilePath)) {
      throw new Error('Video file missing on relay server for Facebook upload.');
    }

    const fileBuffer = fs.readFileSync(ctx.videoFilePath);

    if (ctx.resolvedText.effectiveFbMode === 'reel') {
      ctx.onProgress('uploading', 20, 'Starting Facebook Reels upload session...');
      const startRes = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/video_reels`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            upload_phase: 'start',
            access_token: pageToken,
          }),
        }
      );
      const startJson: any = await startRes.json();
      if (!startRes.ok || !startJson.video_id) {
        throw new Error(startJson?.error?.message || 'Failed to start FB Reel upload');
      }

      const videoId: string = startJson.video_id;
      ctx.onProgress('uploading', 60, 'Uploading Facebook Reel binary...');

      const uploadRes = await fetch(
        startJson.upload_url || `https://rupload.facebook.com/video-upload/v21.0/${videoId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `OAuth ${pageToken}`,
            offset: '0',
            file_size: String(fileBuffer.byteLength),
          },
          body: fileBuffer,
        }
      );
      if (!uploadRes.ok) {
        throw new Error(`Facebook Reel binary upload failed (${uploadRes.status})`);
      }

      ctx.onProgress('processing', 88, 'Finalizing Facebook Reel...');
      const finishRes = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/video_reels`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            upload_phase: 'finish',
            video_id: videoId,
            video_state: 'PUBLISHED',
            description: ctx.resolvedText.combinedCaptionOrDescription,
            access_token: pageToken,
          }),
        }
      );
      const finishJson: any = await finishRes.json();
      if (!finishRes.ok || finishJson.error) {
        throw new Error(finishJson?.error?.message || 'Failed to finalize FB Reel');
      }

      return {
        externalPostId: videoId,
        externalUrl: `https://www.facebook.com/reel/${videoId}`,
      };
    }

    // Standard Long-Form Facebook Page Video
    ctx.onProgress('uploading', 35, 'Uploading Page Video to Facebook Graph API...');
    const formData = new FormData();
    formData.append('access_token', pageToken);
    if (ctx.resolvedText.title) {
      formData.append('title', ctx.resolvedText.title.slice(0, 255));
    }
    formData.append('description', ctx.resolvedText.combinedCaptionOrDescription);
    formData.append(
      'source',
      new Blob([fileBuffer], { type: ctx.videoMeta?.mimeType || 'video/mp4' }),
      ctx.videoMeta?.fileName || 'video.mp4'
    );

    const vidRes = await fetch(
      `https://graph-video.facebook.com/v21.0/${pageId}/videos`,
      {
        method: 'POST',
        body: formData,
      }
    );
    const vidJson: any = await vidRes.json();
    if (!vidRes.ok || vidJson.error) {
      throw new Error(vidJson?.error?.message || 'Facebook Page Video upload failed');
    }

    return {
      externalPostId: vidJson.id,
      externalUrl: `https://www.facebook.com/watch/?v=${vidJson.id}`,
    };
  },
};

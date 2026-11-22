import {
  getEffectiveVideoForPlatform,
  PLATFORM_SPECS,
  summarizeVideoEdits,
} from '../../../shared/platforms';
import { PublishAdapterContext } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSandboxPublish(
  ctx: PublishAdapterContext
): Promise<{
  externalPostId: string;
  externalUrl: string;
  firstCommentPosted?: boolean;
}> {
  const spec = PLATFORM_SPECS[ctx.platformId];
  const jitter = Math.floor(Math.random() * 320);

  if (ctx.postKind === 'video' && ctx.videoMeta) {
    const editNotes = summarizeVideoEdits(ctx.videoMeta);
    const effective = getEffectiveVideoForPlatform(
      ctx.videoMeta,
      ctx.platformId
    );
    if (editNotes.length > 0) {
      ctx.onProgress(
        'processing',
        18,
        `Prepared ${effective.width}×${effective.height} variant (${editNotes.join(' · ')})...`
      );
      await sleep(340 + jitter);
    }
    ctx.onProgress(
      'uploading',
      46,
      `Uploading ${effective.width}×${effective.height} video to ${spec.shortName}...`
    );
    await sleep(380 + jitter);
  } else if (ctx.postKind === 'photo') {
    const rawCount = ctx.photosMeta?.length ?? 1;
    const sentCount = spec.maxPhotos
      ? Math.min(rawCount, spec.maxPhotos)
      : rawCount;
    ctx.onProgress(
      'uploading',
      45,
      `Uploading ${sentCount} photo${sentCount > 1 ? 's' : ''} to ${spec.shortName}...`
    );
    await sleep(360 + jitter);
  } else {
    ctx.onProgress(
      'uploading',
      45,
      `Sending text post (${ctx.resolvedText.combinedCaptionOrDescription.length} chars) to ${spec.shortName}...`
    );
    await sleep(280 + jitter);
  }

  if (ctx.account.simulateFailure) {
    ctx.onProgress(
      'processing',
      72,
      `Validating payload on ${spec.shortName}...`
    );
    await sleep(300);
    throw new Error(
      `Simulated ${spec.shortName} API error. Toggle off error simulation in Accounts or click Retry.`
    );
  }

  ctx.onProgress('processing', 86, `Finalizing on ${spec.shortName}...`);
  await sleep(380 + jitter);

  let firstCommentPosted = false;
  if (ctx.resolvedText.firstComment && spec.supportsFirstComment) {
    ctx.onProgress(
      'processing',
      94,
      `Posting auto first-comment on ${spec.shortName}...`
    );
    await sleep(240);
    firstCommentPosted = true;
  }

  const shortId = `${ctx.platformId.slice(0, 2)}_${Date.now().toString(36)}`;
  const cleanHandle = ctx.account.handle.replace(/^@/, '');
  const urlMap: Record<string, string> = {
    tiktok: `https://www.tiktok.com/${ctx.account.handle}/video/${Date.now()}`,
    instagram_reels:
      ctx.postKind === 'photo'
        ? `https://www.instagram.com/p/${shortId}/`
        : `https://www.instagram.com/reel/${shortId}/`,
    youtube_shorts: `https://www.youtube.com/shorts/${shortId}`,
    youtube_long: `https://www.youtube.com/watch?v=${shortId}`,
    facebook_video:
      ctx.resolvedText.effectiveFbMode === 'reel'
        ? `https://www.facebook.com/reel/${Date.now()}`
        : `https://www.facebook.com/posts/${shortId}`,
    x: `https://x.com/${cleanHandle}/status/${Date.now()}`,
    threads: `https://www.threads.net/@${cleanHandle}/post/${shortId}`,
    bluesky: `https://bsky.app/profile/${cleanHandle}/post/${shortId}`,
    linkedin: `https://www.linkedin.com/feed/update/urn:li:share:${Date.now()}/`,
  };

  return {
    externalPostId: shortId,
    externalUrl:
      urlMap[ctx.platformId] ?? `https://omnipost.local/post/${shortId}`,
    firstCommentPosted,
  };
}

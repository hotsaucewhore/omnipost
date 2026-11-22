import {
  classifyAspectRatio,
  ConnectedAccount,
  detectPostKind,
  formatDuration,
  getEffectiveVideoForPlatform,
  MasterDraft,
  PhotoAssetMeta,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PlatformId,
  PlatformOverride,
  resolvePlatformText,
  VideoAssetMeta,
} from './platforms';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  platformId: PlatformId;
  severity: ValidationSeverity;
  code: string;
  message: string;
  field?: 'video' | 'title' | 'caption' | 'hashtags' | 'account' | 'thumbnail';
}

export interface PlatformValidationSummary {
  platformId: PlatformId;
  enabled: boolean;
  status: 'disabled' | 'ready' | 'warning' | 'error';
  issues: ValidationIssue[];
}

export function validatePlatformDraft(
  platformId: PlatformId,
  video: VideoAssetMeta | null,
  master: MasterDraft,
  override: PlatformOverride | undefined,
  connectedAccounts: ConnectedAccount[],
  photos: PhotoAssetMeta[] = []
): PlatformValidationSummary {
  if (!override?.enabled) {
    return {
      platformId,
      enabled: false,
      status: 'disabled',
      issues: [],
    };
  }

  const spec = PLATFORM_SPECS[platformId];
  const issues: ValidationIssue[] = [];

  const matchingAccount = connectedAccounts.find(
    (acc) => acc.platformGroup === spec.accountGroup
  );
  if (!matchingAccount) {
    issues.push({
      platformId,
      severity: 'error',
      code: 'ACCOUNT_NOT_CONNECTED',
      field: 'account',
      message: `No ${spec.name} account connected yet. Connect one in Accounts.`,
    });
  }

  const postKind = detectPostKind(video, photos);
  const effectiveVideo = video
    ? getEffectiveVideoForPlatform(video, platformId)
    : undefined;
  const resolved = resolvePlatformText(
    platformId,
    master,
    override,
    effectiveVideo
  );
  const captionLen = resolved.combinedCaptionOrDescription.length;
  const titleLen = resolved.title.length;

  // 1. TEXT-ONLY POST VALIDATION
  if (postKind === 'text') {
    if (!spec.supportsTextOnly) {
      issues.push({
        platformId,
        severity: 'error',
        code: 'MEDIA_REQUIRED_FOR_PLATFORM',
        field: 'video',
        message: `${spec.shortName} requires a photo or video.`,
      });
    } else if (captionLen === 0) {
      issues.push({
        platformId,
        severity: 'error',
        code: 'TEXT_EMPTY',
        field: 'caption',
        message: 'Write your post text or attach media first.',
      });
    }
  }

  // 2. PHOTO / CAROUSEL POST VALIDATION
  if (postKind === 'photo') {
    if (!spec.supportsPhotos) {
      issues.push({
        platformId,
        severity: 'error',
        code: 'VIDEO_ONLY_PLATFORM',
        field: 'video',
        message: `${spec.shortName} only supports video uploads.`,
      });
    } else if (spec.maxPhotos && photos.length > spec.maxPhotos) {
      issues.push({
        platformId,
        severity: 'warning',
        code: 'PHOTO_COUNT_CAPPED',
        field: 'video',
        message: `${spec.shortName} supports up to ${spec.maxPhotos} photos per post — the first ${spec.maxPhotos} will be sent.`,
      });
    }
  }

  // 3. VIDEO POST VALIDATION
  if (postKind === 'video' && effectiveVideo) {
    const aspect = classifyAspectRatio(
      effectiveVideo.width,
      effectiveVideo.height
    );
    const hasThumbnail = Boolean(
      override.customThumbnailUri ||
        video?.thumbnailUri ||
        typeof video?.edits?.coverTimestampSec === 'number'
    );

    if (effectiveVideo.durationSec < spec.minDurationSec) {
      issues.push({
        platformId,
        severity: 'error',
        code: 'DURATION_TOO_SHORT',
        field: 'video',
        message: `${spec.shortName} requires videos to be at least ${spec.minDurationSec}s (current: ${formatDuration(effectiveVideo.durationSec)}).`,
      });
    }

    if (effectiveVideo.durationSec > spec.maxDurationSec) {
      issues.push({
        platformId,
        severity: 'error',
        code: 'DURATION_TOO_LONG',
        field: 'video',
        message: `Video duration (${formatDuration(effectiveVideo.durationSec)}) exceeds ${spec.shortName} max of ${formatDuration(spec.maxDurationSec)}.`,
      });
    }

    if (platformId === 'tiktok' && aspect.orientation === 'horizontal') {
      issues.push({
        platformId,
        severity: 'warning',
        code: 'TIKTOK_HORIZONTAL',
        field: 'video',
        message:
          'Horizontal (16:9) video will display with black bars on TikTok; 9:16 vertical is recommended.',
      });
    }

    if (platformId === 'instagram_reels') {
      if (
        effectiveVideo.durationSec > 90 &&
        effectiveVideo.durationSec <= spec.maxDurationSec
      ) {
        issues.push({
          platformId,
          severity: 'warning',
          code: 'IG_REELS_OVER_90S',
          field: 'video',
          message:
            'Reels over 90s can be posted via API, but Instagram prioritizes clips <= 90s in Discovery.',
        });
      }
      if (aspect.orientation === 'horizontal') {
        issues.push({
          platformId,
          severity: 'warning',
          code: 'IG_HORIZONTAL',
          field: 'video',
          message: '9:16 vertical aspect ratio is recommended for Instagram Reels.',
        });
      }
    }

    if (platformId === 'youtube_shorts') {
      if (aspect.orientation === 'horizontal') {
        issues.push({
          platformId,
          severity: 'error',
          code: 'YT_SHORTS_MUST_BE_VERTICAL',
          field: 'video',
          message:
            'YouTube Shorts requires a vertical (9:16) or square (1:1) video. Reframe to 9:16 or unselect Shorts.',
        });
      }
    }

    if (platformId === 'youtube_long') {
      if (
        (aspect.orientation === 'vertical' || aspect.orientation === 'square') &&
        effectiveVideo.durationSec <= 180
      ) {
        issues.push({
          platformId,
          severity: 'warning',
          code: 'YT_LONG_AUTO_SHORT',
          field: 'video',
          message:
            'YouTube automatically classifies vertical/square videos <= 3 min as Shorts rather than Long-Form.',
        });
      }
      if (!hasThumbnail) {
        issues.push({
          platformId,
          severity: 'info',
          code: 'YT_THUMBNAIL_RECOMMENDED',
          field: 'thumbnail',
          message:
            'Tip: Add a custom 16:9 cover thumbnail for better YouTube click-through rate.',
        });
      }
    }

    if (
      platformId === 'facebook_video' &&
      resolved.effectiveFbMode === 'reel' &&
      effectiveVideo.durationSec > 90
    ) {
      issues.push({
        platformId,
        severity: 'warning',
        code: 'FB_REEL_DURATION',
        field: 'video',
        message:
          'Facebook Reels work best <= 90s; consider trimming or switching format to Page Video.',
      });
    }

    if (spec.titleRequired && titleLen === 0) {
      issues.push({
        platformId,
        severity: 'error',
        code: 'TITLE_REQUIRED',
        field: 'title',
        message: `${spec.shortName} requires a title.`,
      });
    }

    if (spec.maxTitleChars && titleLen > spec.maxTitleChars) {
      issues.push({
        platformId,
        severity: 'error',
        code: 'TITLE_TOO_LONG',
        field: 'title',
        message: `Title is ${titleLen}/${spec.maxTitleChars} characters (exceeds ${spec.shortName} limit).`,
      });
    }
  }

  // Common Hashtag & Character Length Checks across Video, Photo & Text
  if (spec.maxHashtags && resolved.hashtags.length > spec.maxHashtags) {
    issues.push({
      platformId,
      severity: 'error',
      code: 'TOO_MANY_HASHTAGS',
      field: 'hashtags',
      message: `${spec.shortName} allows at most ${spec.maxHashtags} hashtags (currently ${resolved.hashtags.length}).`,
    });
  }

  if (captionLen > spec.maxCaptionChars) {
    issues.push({
      platformId,
      severity: 'error',
      code: 'CAPTION_TOO_LONG',
      field: 'caption',
      message: `${spec.shortName} ${spec.captionLabel.toLowerCase()} is ${captionLen}/${spec.maxCaptionChars} characters (exceeds limit — customize ${spec.shortName} tab to shorten).`,
    });
  }

  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarning = issues.some((i) => i.severity === 'warning');

  return {
    platformId,
    enabled: true,
    status: hasError ? 'error' : hasWarning ? 'warning' : 'ready',
    issues,
  };
}

export function validateAllPlatforms(
  video: VideoAssetMeta | null,
  master: MasterDraft,
  overrides: Record<PlatformId, PlatformOverride>,
  connectedAccounts: ConnectedAccount[],
  photos: PhotoAssetMeta[] = []
): Record<PlatformId, PlatformValidationSummary> {
  const result = {} as Record<PlatformId, PlatformValidationSummary>;
  for (const id of PLATFORM_ORDER) {
    result[id] = validatePlatformDraft(
      id,
      video,
      master,
      overrides[id],
      connectedAccounts,
      photos
    );
  }
  return result;
}

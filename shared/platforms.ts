export type PlatformId =
  | 'tiktok'
  | 'instagram_reels'
  | 'youtube_shorts'
  | 'youtube_long'
  | 'facebook_video'
  | 'x'
  | 'threads'
  | 'bluesky'
  | 'linkedin';

export type AccountGroupId =
  | 'tiktok'
  | 'instagram'
  | 'youtube'
  | 'facebook'
  | 'x'
  | 'threads'
  | 'bluesky'
  | 'linkedin';

export type PostKind = 'video' | 'photo' | 'text';

export const MAX_CAROUSEL_PHOTOS = 35;

export const DEFAULT_WORKSPACE_ID = 'ws_default';
export const DEFAULT_USER_ID = 'usr_founder';

export type PlanTierId = 'free' | 'creator' | 'studio';
export type BillingInterval = 'monthly' | 'annual';

export interface PlanTierSpec {
  id: PlanTierId;
  name: string;
  tagline: string;
  monthlyPriceUsd: number;
  annualMonthlyPriceUsd: number;
  maxWorkspaces: number | null;
  maxAccountsPerWorkspace: number | null;
  maxPostsPerMonth: number | null;
  fullAnalyticsHistory: boolean;
  allowsClientApprovals: boolean;
  features: string[];
}

export const PLAN_TIERS: Record<PlanTierId, PlanTierSpec> = {
  free: {
    id: 'free',
    name: 'Starter',
    tagline: 'Try cross-posting on a single brand',
    monthlyPriceUsd: 0,
    annualMonthlyPriceUsd: 0,
    maxWorkspaces: 1,
    maxAccountsPerWorkspace: 3,
    maxPostsPerMonth: 10,
    fullAnalyticsHistory: false,
    allowsClientApprovals: false,
    features: [
      '1 brand workspace',
      'Up to 3 connected channels',
      '10 published or scheduled posts / mo',
      '7-day performance rollup',
    ],
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    tagline: 'Every channel & unlimited posts for solo creators',
    monthlyPriceUsd: 12,
    annualMonthlyPriceUsd: 10,
    maxWorkspaces: 1,
    maxAccountsPerWorkspace: null,
    maxPostsPerMonth: null,
    fullAnalyticsHistory: true,
    allowsClientApprovals: false,
    features: [
      'All 8 platform groups (9 destinations)',
      'Unlimited video, 35-photo & text posts',
      'Built-in video trim, 9:16 reframe & covers',
      'Auto first-comment links & saved presets',
      'Bulk batch scheduler & visual calendar',
      'Full 30-day & all-time insights',
    ],
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    tagline: 'Multi-brand workspaces & team approvals for agencies',
    monthlyPriceUsd: 29,
    annualMonthlyPriceUsd: 24,
    maxWorkspaces: null,
    maxAccountsPerWorkspace: null,
    maxPostsPerMonth: null,
    fullAnalyticsHistory: true,
    allowsClientApprovals: true,
    features: [
      'Unlimited client & brand workspaces',
      'Team members, roles (Editor / Approver) & approval-gated queue',
      '1-click shareable client approval links',
      'Isolated accounts, queues & presets per brand',
      'Cross-platform analytics across every client',
    ],
  },
};

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  planTier: PlanTierId;
  billingInterval: BillingInterval;
  stripeCustomerId?: string;
  isFounderAdmin?: boolean;
  createdAt: string;
}

export interface PlanUsageSummary {
  planTier: PlanTierId;
  billingInterval: BillingInterval;
  workspacesUsed: number;
  maxWorkspaces: number | null;
  accountsInActiveWorkspace: number;
  maxAccountsPerWorkspace: number | null;
  postsThisMonth: number;
  maxPostsPerMonth: number | null;
  fullAnalyticsHistory: boolean;
  allowsClientApprovals: boolean;
  stripeLiveConfigured: boolean;
}

export const WORKSPACE_COLORS = [
  '#D95D39',
  '#2E6F5E',
  '#3B668C',
  '#8B5E3C',
  '#7A4B6E',
];

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'approver';
export type MemberInviteStatus = 'active' | 'invited';

export const WORKSPACE_ROLE_LABELS: Record<
  WorkspaceRole,
  { label: string; summary: string }
> = {
  owner: {
    label: 'Owner',
    summary: 'Full workspace, billing, team & publishing control',
  },
  admin: {
    label: 'Admin',
    summary: 'Manage accounts, approve & publish posts, invite members',
  },
  editor: {
    label: 'Editor',
    summary: 'Draft, upload & schedule posts (held until approved)',
  },
  approver: {
    label: 'Approver',
    summary: 'Review queued posts, request edits & sign off to publish',
  },
};

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId?: string;
  email: string;
  name: string;
  role: WorkspaceRole;
  status: MemberInviteStatus;
  inviteToken?: string;
  invitedByName?: string;
  createdAt: string;
}

export interface BrandWorkspace {
  id: string;
  ownerUserId?: string;
  name: string;
  accentColor: string;
  requireApproval?: boolean;
  currentUserRole?: WorkspaceRole;
  createdAt: string;
}

export interface PlatformSpec {
  id: PlatformId;
  accountGroup: AccountGroupId;
  name: string;
  shortName: string;
  category: 'short_form' | 'long_form' | 'hybrid' | 'social_feed';
  brandColor: string;
  accentBg: string;
  idealAspect: '9:16' | '16:9' | 'both';
  supportsVideo: boolean;
  supportsPhotos: boolean;
  maxPhotos?: number;
  supportsTextOnly: boolean;
  supportsFirstComment: boolean;
  maxDurationSec: number;
  minDurationSec: number;
  recommendedMaxDurationSec?: number;
  maxTitleChars?: number;
  titleRequired: boolean;
  maxCaptionChars: number;
  captionLabel: 'Caption' | 'Description' | 'Post';
  maxHashtags?: number;
  truncationPreviewChars: number;
  supportsCustomThumbnail: boolean;
  envKeysRequired: string[];
}

export const PLATFORM_SPECS: Record<PlatformId, PlatformSpec> = {
  tiktok: {
    id: 'tiktok',
    accountGroup: 'tiktok',
    name: 'TikTok',
    shortName: 'TikTok',
    category: 'short_form',
    brandColor: '#FE2C55',
    accentBg: '#2A1219',
    idealAspect: '9:16',
    supportsVideo: true,
    supportsPhotos: true,
    maxPhotos: 35,
    supportsTextOnly: false,
    supportsFirstComment: false,
    minDurationSec: 1,
    maxDurationSec: 600,
    titleRequired: false,
    maxCaptionChars: 2200,
    captionLabel: 'Caption',
    truncationPreviewChars: 95,
    supportsCustomThumbnail: true,
    envKeysRequired: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  },
  instagram_reels: {
    id: 'instagram_reels',
    accountGroup: 'instagram',
    name: 'Instagram',
    shortName: 'Instagram',
    category: 'short_form',
    brandColor: '#E1306C',
    accentBg: '#2A1321',
    idealAspect: '9:16',
    supportsVideo: true,
    supportsPhotos: true,
    maxPhotos: 20,
    supportsTextOnly: false,
    supportsFirstComment: true,
    minDurationSec: 3,
    maxDurationSec: 900,
    recommendedMaxDurationSec: 90,
    titleRequired: false,
    maxCaptionChars: 2200,
    captionLabel: 'Caption',
    maxHashtags: 30,
    truncationPreviewChars: 88,
    supportsCustomThumbnail: true,
    envKeysRequired: ['META_APP_ID', 'META_APP_SECRET'],
  },
  youtube_shorts: {
    id: 'youtube_shorts',
    accountGroup: 'youtube',
    name: 'YouTube Shorts',
    shortName: 'YT Shorts',
    category: 'short_form',
    brandColor: '#FF0033',
    accentBg: '#2B1115',
    idealAspect: '9:16',
    supportsVideo: true,
    supportsPhotos: false,
    supportsTextOnly: false,
    supportsFirstComment: true,
    minDurationSec: 1,
    maxDurationSec: 180,
    recommendedMaxDurationSec: 60,
    maxTitleChars: 100,
    titleRequired: true,
    maxCaptionChars: 5000,
    captionLabel: 'Description',
    truncationPreviewChars: 100,
    supportsCustomThumbnail: false,
    envKeysRequired: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  },
  youtube_long: {
    id: 'youtube_long',
    accountGroup: 'youtube',
    name: 'YouTube',
    shortName: 'YouTube',
    category: 'long_form',
    brandColor: '#FF4E45',
    accentBg: '#291514',
    idealAspect: '16:9',
    supportsVideo: true,
    supportsPhotos: false,
    supportsTextOnly: false,
    supportsFirstComment: true,
    minDurationSec: 1,
    maxDurationSec: 43200,
    maxTitleChars: 100,
    titleRequired: true,
    maxCaptionChars: 5000,
    captionLabel: 'Description',
    truncationPreviewChars: 140,
    supportsCustomThumbnail: true,
    envKeysRequired: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  },
  facebook_video: {
    id: 'facebook_video',
    accountGroup: 'facebook',
    name: 'Facebook',
    shortName: 'Facebook',
    category: 'hybrid',
    brandColor: '#1877F2',
    accentBg: '#111E33',
    idealAspect: 'both',
    supportsVideo: true,
    supportsPhotos: true,
    maxPhotos: 20,
    supportsTextOnly: true,
    supportsFirstComment: true,
    minDurationSec: 3,
    maxDurationSec: 14400,
    maxTitleChars: 255,
    titleRequired: false,
    maxCaptionChars: 63206,
    captionLabel: 'Post',
    truncationPreviewChars: 130,
    supportsCustomThumbnail: true,
    envKeysRequired: ['META_APP_ID', 'META_APP_SECRET'],
  },
  x: {
    id: 'x',
    accountGroup: 'x',
    name: 'X (Twitter)',
    shortName: 'X',
    category: 'social_feed',
    brandColor: '#181816',
    accentBg: '#1E1E1C',
    idealAspect: 'both',
    supportsVideo: true,
    supportsPhotos: true,
    maxPhotos: 4,
    supportsTextOnly: true,
    supportsFirstComment: true,
    minDurationSec: 1,
    maxDurationSec: 140, // Standard X API video limit (2m20s)
    titleRequired: false,
    maxCaptionChars: 280,
    captionLabel: 'Post',
    truncationPreviewChars: 280,
    supportsCustomThumbnail: false,
    envKeysRequired: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  },
  threads: {
    id: 'threads',
    accountGroup: 'threads',
    name: 'Threads',
    shortName: 'Threads',
    category: 'social_feed',
    brandColor: '#262624',
    accentBg: '#1F1F1D',
    idealAspect: 'both',
    supportsVideo: true,
    supportsPhotos: true,
    maxPhotos: 20,
    supportsTextOnly: true,
    supportsFirstComment: true,
    minDurationSec: 1,
    maxDurationSec: 300, // 5 min Threads API video limit
    titleRequired: false,
    maxCaptionChars: 500,
    captionLabel: 'Post',
    truncationPreviewChars: 260,
    supportsCustomThumbnail: false,
    envKeysRequired: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
  },
  bluesky: {
    id: 'bluesky',
    accountGroup: 'bluesky',
    name: 'Bluesky',
    shortName: 'Bluesky',
    category: 'social_feed',
    brandColor: '#0285FF',
    accentBg: '#0E2038',
    idealAspect: 'both',
    supportsVideo: true,
    supportsPhotos: true,
    maxPhotos: 4,
    supportsTextOnly: true,
    supportsFirstComment: true,
    minDurationSec: 1,
    maxDurationSec: 180, // 3 min Bluesky video limit
    titleRequired: false,
    maxCaptionChars: 300,
    captionLabel: 'Post',
    truncationPreviewChars: 300,
    supportsCustomThumbnail: false,
    envKeysRequired: ['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD'],
  },
  linkedin: {
    id: 'linkedin',
    accountGroup: 'linkedin',
    name: 'LinkedIn',
    shortName: 'LinkedIn',
    category: 'social_feed',
    brandColor: '#0A66C2',
    accentBg: '#0F2136',
    idealAspect: 'both',
    supportsVideo: true,
    supportsPhotos: true,
    maxPhotos: 20,
    supportsTextOnly: true,
    supportsFirstComment: true,
    minDurationSec: 3,
    maxDurationSec: 900, // 15 min LinkedIn API limit
    titleRequired: false,
    maxCaptionChars: 3000,
    captionLabel: 'Post',
    truncationPreviewChars: 210,
    supportsCustomThumbnail: true,
    envKeysRequired: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  },
};

export const PLATFORM_ORDER: PlatformId[] = [
  'tiktok',
  'instagram_reels',
  'youtube_shorts',
  'youtube_long',
  'facebook_video',
  'x',
  'threads',
  'bluesky',
  'linkedin',
];

export interface AccountGroupSpec {
  id: AccountGroupId;
  name: string;
  providerLabel: string;
  brandColor: string;
  unlocksPlatforms: PlatformId[];
  defaultSandboxHandle: string;
  defaultSandboxName: string;
}

export const ACCOUNT_GROUPS: AccountGroupSpec[] = [
  {
    id: 'tiktok',
    name: 'TikTok',
    providerLabel: 'TikTok Content Posting API (Video & Photo Mode)',
    brandColor: '#FE2C55',
    unlocksPlatforms: ['tiktok'],
    defaultSandboxHandle: '@creator.tok',
    defaultSandboxName: 'Creator Studio TikTok',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    providerLabel: 'Instagram Graph API (Reels & Photo Carousels)',
    brandColor: '#E1306C',
    unlocksPlatforms: ['instagram_reels'],
    defaultSandboxHandle: '@creator.grams',
    defaultSandboxName: 'Creator Studio IG',
  },
  {
    id: 'youtube',
    name: 'YouTube Channel',
    providerLabel: 'YouTube Data API v3 (Shorts & Long-Form)',
    brandColor: '#FF0033',
    unlocksPlatforms: ['youtube_shorts', 'youtube_long'],
    defaultSandboxHandle: '@CreatorStudioYT',
    defaultSandboxName: 'Creator Studio Channel',
  },
  {
    id: 'facebook',
    name: 'Facebook Page',
    providerLabel: 'Meta Graph API (Video, Photos & Text)',
    brandColor: '#1877F2',
    unlocksPlatforms: ['facebook_video'],
    defaultSandboxHandle: 'Creator Studio Page',
    defaultSandboxName: 'Creator Studio Official',
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    providerLabel: 'X API v2 (Text, Photos & Video)',
    brandColor: '#181816',
    unlocksPlatforms: ['x'],
    defaultSandboxHandle: '@creator_x',
    defaultSandboxName: 'Creator Studio X',
  },
  {
    id: 'threads',
    name: 'Threads',
    providerLabel: 'Meta Threads API (Text, Carousels & Video)',
    brandColor: '#262624',
    unlocksPlatforms: ['threads'],
    defaultSandboxHandle: '@creator.threads',
    defaultSandboxName: 'Creator Studio Threads',
  },
  {
    id: 'bluesky',
    name: 'Bluesky',
    providerLabel: 'AT Protocol API (Text, Images & Video)',
    brandColor: '#0285FF',
    unlocksPlatforms: ['bluesky'],
    defaultSandboxHandle: '@creator.bsky.social',
    defaultSandboxName: 'Creator Studio Bluesky',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    providerLabel: 'LinkedIn Posts API (Text, Multi-Image & Video)',
    brandColor: '#0A66C2',
    unlocksPlatforms: ['linkedin'],
    defaultSandboxHandle: 'Creator Studio',
    defaultSandboxName: 'Creator Studio LinkedIn',
  },
];

export type ReframeMode =
  | 'original'
  | 'smart_hybrid'
  | 'vertical_crop'
  | 'vertical_blur';

export interface VideoEdits {
  trimStartSec: number;
  trimEndSec: number;
  reframeMode: ReframeMode;
  cropFocusX: number;
  coverTimestampSec?: number;
  burnSubtitles?: boolean;
  subtitleFileName?: string;
  subtitleContent?: string;
}

export interface VideoAssetMeta {
  uri?: string;
  serverFilePath?: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes?: number;
  width: number;
  height: number;
  durationSec: number;
  thumbnailUri?: string;
  isSamplePreset?: boolean;
  edits?: VideoEdits;
}

export interface PhotoAssetMeta {
  id: string;
  uri?: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  fileSizeBytes?: number;
  isSamplePreset?: boolean;
  sampleTint?: string;
  sampleLabel?: string;
}

export function detectPostKind(
  video?: VideoAssetMeta | null,
  photos?: PhotoAssetMeta[]
): PostKind {
  if (video) return 'video';
  if (photos && photos.length > 0) return 'photo';
  return 'text';
}

export function createDefaultEdits(durationSec: number): VideoEdits {
  return {
    trimStartSec: 0,
    trimEndSec: Math.max(1, Math.round(durationSec)),
    reframeMode: 'original',
    cropFocusX: 50,
  };
}

export function getEffectiveVideoForPlatform(
  video: VideoAssetMeta,
  platformId?: PlatformId
): VideoAssetMeta {
  const edits = video.edits;
  if (!edits) return video;

  const trimmedDuration = Math.max(
    1,
    Math.round(edits.trimEndSec - edits.trimStartSec)
  );

  let width = video.width;
  let height = video.height;

  const isShortDest =
    !platformId ||
    platformId === 'tiktok' ||
    platformId === 'instagram_reels' ||
    platformId === 'youtube_shorts';

  if (
    edits.reframeMode === 'vertical_crop' ||
    edits.reframeMode === 'vertical_blur' ||
    (edits.reframeMode === 'smart_hybrid' && isShortDest)
  ) {
    width = 1080;
    height = 1920;
  }

  return {
    ...video,
    width,
    height,
    durationSec: trimmedDuration,
  };
}

export function summarizeVideoEdits(video: VideoAssetMeta): string[] {
  const edits = video.edits;
  if (!edits) return [];
  const badges: string[] = [];

  const isTrimmed =
    edits.trimStartSec > 0 ||
    Math.abs(edits.trimEndSec - video.durationSec) >= 1;
  if (isTrimmed) {
    const net = Math.max(1, Math.round(edits.trimEndSec - edits.trimStartSec));
    badges.push(
      `Trim ${formatDuration(edits.trimStartSec)}–${formatDuration(edits.trimEndSec)} (${formatDuration(net)})`
    );
  }

  if (edits.reframeMode === 'smart_hybrid') {
    badges.push('16:9 + Auto 9:16');
  } else if (edits.reframeMode === 'vertical_crop') {
    badges.push('9:16 crop');
  } else if (edits.reframeMode === 'vertical_blur') {
    badges.push('9:16 blur pad');
  }

  if (typeof edits.coverTimestampSec === 'number') {
    badges.push(`Cover @ ${formatDuration(edits.coverTimestampSec)}`);
  }

  if (edits.burnSubtitles && edits.subtitleContent?.trim()) {
    badges.push('Subtitles burned-in');
  }

  return badges;
}

export interface MasterDraft {
  title: string;
  caption: string;
  hashtags: string;
  firstComment?: string;
}

export interface PlatformOverride {
  enabled: boolean;
  useCustomText: boolean;
  customTitle?: string;
  customCaption?: string;
  customHashtags?: string;
  customFirstComment?: string;
  customThumbnailUri?: string;

  tiktokPrivacy?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
  tiktokAllowComments?: boolean;
  tiktokAllowDuet?: boolean;
  tiktokAllowStitch?: boolean;

  igShareToFeed?: boolean;

  ytVisibility?: 'public' | 'unlisted' | 'private';
  ytMadeForKids?: boolean;
  ytAppendShortsTag?: boolean;
  ytTags?: string;
  ytCategoryId?: string;

  fbPostType?: 'auto' | 'reel' | 'video';
  fbVisibility?: 'EVERYONE' | 'ALL_FRIENDS' | 'SELF';
}

export function createDefaultOverrides(): Record<PlatformId, PlatformOverride> {
  return {
    tiktok: {
      enabled: true,
      useCustomText: false,
      tiktokPrivacy: 'PUBLIC_TO_EVERYONE',
      tiktokAllowComments: true,
      tiktokAllowDuet: true,
      tiktokAllowStitch: true,
    },
    instagram_reels: {
      enabled: true,
      useCustomText: false,
      igShareToFeed: true,
    },
    youtube_shorts: {
      enabled: true,
      useCustomText: false,
      ytVisibility: 'public',
      ytMadeForKids: false,
      ytAppendShortsTag: true,
    },
    youtube_long: {
      enabled: false,
      useCustomText: false,
      ytVisibility: 'public',
      ytMadeForKids: false,
      ytTags: '',
      ytCategoryId: '22',
    },
    facebook_video: {
      enabled: true,
      useCustomText: false,
      fbPostType: 'auto',
      fbVisibility: 'EVERYONE',
    },
    x: {
      enabled: false,
      useCustomText: false,
    },
    threads: {
      enabled: false,
      useCustomText: false,
    },
    bluesky: {
      enabled: false,
      useCustomText: false,
    },
    linkedin: {
      enabled: false,
      useCustomText: false,
    },
  };
}

export interface AspectInfo {
  ratio: number;
  label: string;
  orientation: 'vertical' | 'horizontal' | 'square';
}

export function classifyAspectRatio(width: number, height: number): AspectInfo {
  if (!width || !height) {
    return { ratio: 9 / 16, label: '9:16', orientation: 'vertical' };
  }
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) < 0.08) {
    return { ratio, label: '9:16', orientation: 'vertical' };
  }
  if (Math.abs(ratio - 16 / 9) < 0.1) {
    return { ratio, label: '16:9', orientation: 'horizontal' };
  }
  if (Math.abs(ratio - 1) < 0.06) {
    return { ratio, label: '1:1', orientation: 'square' };
  }
  if (Math.abs(ratio - 4 / 5) < 0.08) {
    return { ratio, label: '4:5', orientation: 'vertical' };
  }
  return {
    ratio,
    label: ratio < 1 ? 'Vertical' : ratio > 1 ? 'Horizontal' : '1:1',
    orientation: ratio < 0.96 ? 'vertical' : ratio > 1.04 ? 'horizontal' : 'square',
  };
}

export function recommendPlatformsForVideo(
  video: VideoAssetMeta
): Record<PlatformId, boolean> {
  const aspect = classifyAspectRatio(video.width, video.height);
  const isShortVertical =
    (aspect.orientation === 'vertical' || aspect.orientation === 'square') &&
    video.durationSec <= 180;

  if (isShortVertical) {
    return {
      tiktok: true,
      instagram_reels: video.durationSec >= 3,
      youtube_shorts: true,
      youtube_long: false,
      facebook_video: video.durationSec >= 3,
      x: video.durationSec <= 140,
      threads: true,
      bluesky: true,
      linkedin: false,
    };
  }

  if (aspect.orientation === 'vertical' && video.durationSec > 180) {
    return {
      tiktok: video.durationSec <= 600,
      instagram_reels: video.durationSec <= 900,
      youtube_shorts: false,
      youtube_long: true,
      facebook_video: true,
      x: false,
      threads: video.durationSec <= 300,
      bluesky: false,
      linkedin: video.durationSec <= 900,
    };
  }

  return {
    tiktok: false,
    instagram_reels: false,
    youtube_shorts: false,
    youtube_long: true,
    facebook_video: true,
    x: video.durationSec <= 140,
    threads: video.durationSec <= 300,
    bluesky: video.durationSec <= 180,
    linkedin: video.durationSec <= 900,
  };
}

export function recommendPlatformsForPost(
  video?: VideoAssetMeta | null,
  photos?: PhotoAssetMeta[]
): Record<PlatformId, boolean> {
  if (video) {
    return recommendPlatformsForVideo(video);
  }
  if (photos && photos.length > 0) {
    return {
      tiktok: true,
      instagram_reels: true,
      youtube_shorts: false,
      youtube_long: false,
      facebook_video: true,
      x: true,
      threads: true,
      bluesky: true,
      linkedin: true,
    };
  }
  // Text-only post
  return {
    tiktok: false,
    instagram_reels: false,
    youtube_shorts: false,
    youtube_long: false,
    facebook_video: true,
    x: true,
    threads: true,
    bluesky: true,
    linkedin: true,
  };
}

export function normalizeHashtags(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => (token.startsWith('#') ? token : `#${token}`));
}

export interface ResolvedPlatformContent {
  title: string;
  body: string;
  hashtags: string[];
  combinedCaptionOrDescription: string;
  firstComment?: string;
  effectiveFbMode?: 'reel' | 'video' | 'feed';
}

export function resolvePlatformText(
  platformId: PlatformId,
  master: MasterDraft,
  override?: PlatformOverride,
  video?: VideoAssetMeta
): ResolvedPlatformContent {
  const spec = PLATFORM_SPECS[platformId];
  const useCustom = Boolean(override?.useCustomText);
  const rawTitle = (useCustom ? override?.customTitle ?? '' : master.title).trim();
  const rawCaption = (useCustom ? override?.customCaption ?? '' : master.caption).trim();
  const rawHashtags = useCustom ? override?.customHashtags ?? '' : master.hashtags;
  const rawFirstComment = (
    useCustom && override?.customFirstComment !== undefined
      ? override.customFirstComment
      : master.firstComment ?? ''
  ).trim();
  const firstComment =
    spec.supportsFirstComment && rawFirstComment ? rawFirstComment : undefined;
  const tags = normalizeHashtags(rawHashtags);
  const tagsLine = tags.join(' ');

  if (
    platformId === 'tiktok' ||
    platformId === 'instagram_reels' ||
    platformId === 'x' ||
    platformId === 'threads' ||
    platformId === 'bluesky' ||
    platformId === 'linkedin'
  ) {
    const parts: string[] = [];
    if (rawTitle) parts.push(rawTitle);
    if (rawCaption) parts.push(rawCaption);
    if (tagsLine) parts.push(tagsLine);
    const combined = parts.join('\n\n').trim();
    return {
      title: rawTitle,
      body: rawCaption,
      hashtags: tags,
      combinedCaptionOrDescription: combined,
      firstComment,
    };
  }

  if (platformId === 'youtube_shorts') {
    let derivedTitle = rawTitle;
    if (!derivedTitle && rawCaption) {
      const firstLine = rawCaption.split('\n')[0].trim();
      derivedTitle = firstLine.slice(0, 88);
    }
    const wantsShortsTag = override?.ytAppendShortsTag !== false;
    const hasShortsAlready =
      /#shorts\b/i.test(derivedTitle) ||
      /#shorts\b/i.test(rawCaption) ||
      tags.some((t) => t.toLowerCase() === '#shorts');

    if (wantsShortsTag && !hasShortsAlready && derivedTitle) {
      if (derivedTitle.length <= 91) {
        derivedTitle = `${derivedTitle} #Shorts`;
      } else {
        tags.push('#Shorts');
      }
    }
    const finalTagsLine = tags.join(' ');
    const descParts = [rawCaption, finalTagsLine].filter(Boolean);
    return {
      title: derivedTitle,
      body: rawCaption,
      hashtags: tags,
      combinedCaptionOrDescription: descParts.join('\n\n').trim(),
      firstComment,
    };
  }

  if (platformId === 'youtube_long') {
    const descParts = [rawCaption, tagsLine].filter(Boolean);
    return {
      title: rawTitle,
      body: rawCaption,
      hashtags: tags,
      combinedCaptionOrDescription: descParts.join('\n\n').trim(),
      firstComment,
    };
  }

  // Facebook (Reels / Page Video / Photo & Text Feed)
  let effectiveFbMode: 'reel' | 'video' | 'feed' = video ? 'video' : 'feed';
  if (video) {
    const requested = override?.fbPostType ?? 'auto';
    if (requested === 'reel') {
      effectiveFbMode = 'reel';
    } else if (requested === 'video') {
      effectiveFbMode = 'video';
    } else {
      const aspect = classifyAspectRatio(video.width, video.height);
      effectiveFbMode =
        aspect.orientation === 'vertical' && video.durationSec <= 90
          ? 'reel'
          : 'video';
    }
  }

  const descParts: string[] = [];
  if ((effectiveFbMode === 'reel' || effectiveFbMode === 'feed') && rawTitle) {
    descParts.push(rawTitle);
  }
  if (rawCaption) descParts.push(rawCaption);
  if (tagsLine) descParts.push(tagsLine);

  return {
    title: rawTitle,
    body: rawCaption,
    hashtags: tags,
    combinedCaptionOrDescription: descParts.join('\n\n').trim(),
    firstComment,
    effectiveFbMode,
  };
}

export interface ConnectedAccount {
  id: string;
  workspaceId?: string;
  platformGroup: AccountGroupId;
  mode: 'sandbox' | 'live';
  handle: string;
  displayName: string;
  connectedAt: string;
  simulateFailure?: boolean;
  accessTokenMasked?: string;
}

export type PublishStage =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'published'
  | 'failed';

export interface PlatformPostMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  linkClicks: number;
  engagementRatePct: number;
  lastSyncedAt: string;
}

export interface PlatformPublishResult {
  platformId: PlatformId;
  status: PublishStage;
  progressPct: number;
  statusMessage: string;
  mode: 'sandbox' | 'live';
  externalPostId?: string;
  externalUrl?: string;
  firstCommentPosted?: boolean;
  metrics?: PlatformPostMetrics;
  error?: string;
  updatedAt: string;
}

export interface ContentPreset {
  id: string;
  workspaceId: string;
  name: string;
  captionSnippet?: string;
  hashtags?: string;
  firstComment?: string;
  createdAt: string;
}

export type AnalyticsTimeRange = '7d' | '30d' | 'all';

export interface PlatformAnalyticsRow {
  platformId: PlatformId;
  postsCount: number;
  views: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  linkClicks: number;
  engagementRatePct: number;
  shareOfViewsPct: number;
}

export interface PostPlatformMetricEntry {
  platformId: PlatformId;
  externalUrl?: string;
  firstCommentPosted?: boolean;
  metrics: PlatformPostMetrics;
}

export interface PostAnalyticsBreakdown {
  jobId: string;
  postKind: PostKind;
  title: string;
  captionPreview: string;
  createdAt: string;
  firstCommentUsed: boolean;
  totalViews: number;
  totalEngagements: number;
  totalLinkClicks: number;
  avgEngagementRatePct: number;
  winningPlatformId: PlatformId | null;
  winningViews: number;
  platforms: PostPlatformMetricEntry[];
}

export interface WorkspaceAnalyticsSummary {
  workspaceId: string;
  range: AnalyticsTimeRange;
  lastSyncedAt: string;
  totals: {
    publishedPosts: number;
    views: number;
    engagements: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    linkClicks: number;
    avgEngagementRatePct: number;
  };
  topPlatform: {
    platformId: PlatformId;
    views: number;
    shareOfViewsPct: number;
    engagementRatePct: number;
  } | null;
  byPlatform: PlatformAnalyticsRow[];
  postBreakdowns: PostAnalyticsBreakdown[];
}

export type JobLifecycle = 'draft' | 'scheduled' | 'active';

export type ApprovalStatus = 'pending' | 'approved' | 'changes_requested';

export interface ApprovalComment {
  id: string;
  authorName: string;
  role: 'client' | 'team';
  body: string;
  decision?: 'approved' | 'changes_requested';
  createdAt: string;
}

export interface PostApprovalState {
  shareToken: string;
  status: ApprovalStatus;
  reviewerName?: string;
  updatedAt: string;
  comments: ApprovalComment[];
}

export interface PublishJob {
  id: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt?: string;
  lifecycle?: JobLifecycle;
  scheduledAt?: string;
  postKind?: PostKind;
  createdByName?: string;
  createdByRole?: WorkspaceRole;
  isEvergreen?: boolean;
  evergreenIntervalDays?: number;
  recycledFromJobId?: string;
  lastRecycledAt?: string;
  video: VideoAssetMeta | null;
  photos?: PhotoAssetMeta[];
  master: MasterDraft;
  overrides: Record<PlatformId, PlatformOverride>;
  results: Partial<Record<PlatformId, PlatformPublishResult>>;
  approval?: PostApprovalState;
}

export interface BioCustomLink {
  id: string;
  label: string;
  url: string;
  clicks: number;
}

export interface BioPageConfig {
  workspaceId: string;
  slug: string;
  headline: string;
  bio: string;
  theme: 'paper' | 'graphite';
  customLinks: BioCustomLink[];
  postLinkUrls: Record<string, string>;
  postClicks: Record<string, number>;
  totalViews: number;
  totalClicks: number;
  updatedAt: string;
}

export interface BioPostCard {
  jobId: string;
  postKind: PostKind;
  title: string;
  captionPreview: string;
  destinationUrl: string;
  clicks: number;
  createdAt: string;
  sampleTint?: string;
  photoCount?: number;
}

export interface PublicBioPagePayload {
  workspaceName: string;
  workspaceColor: string;
  config: BioPageConfig;
  accounts: Pick<ConnectedAccount, 'platformGroup' | 'handle' | 'displayName'>[];
  posts: BioPostCard[];
}

export type InboxFilterStatus = 'all' | 'unanswered' | 'replied' | 'archived';

export interface SocialCommentReply {
  id: string;
  authorHandle: string;
  body: string;
  mode: 'sandbox' | 'live';
  createdAt: string;
}

export interface SocialCommentItem {
  id: string;
  workspaceId: string;
  jobId?: string;
  postTitle: string;
  platformId: PlatformId;
  externalCommentId?: string;
  externalPostId?: string;
  authorName: string;
  authorHandle: string;
  body: string;
  likes: number;
  status: 'unanswered' | 'replied' | 'archived';
  createdAt: string;
  replies: SocialCommentReply[];
}

export interface ImportedUrlPreview {
  url: string;
  siteName: string;
  title: string;
  description: string;
  imageUrl?: string;
  suggestedCaption: string;
  suggestedHashtags: string;
  suggestedFirstComment: string;
}

export interface ImportedRssItem {
  title: string;
  link: string;
  summary: string;
  publishedAt?: string;
  suggestedCaption: string;
  suggestedFirstComment: string;
}

export interface ImportedRssFeed {
  feedUrl: string;
  feedTitle: string;
  items: ImportedRssItem[];
}

export interface LaunchChannelCheck {
  groupId: AccountGroupId;
  name: string;
  approvalSpeed: string;
  liveReady: boolean;
  authKind: 'app_password' | 'oauth2';
  envKeys: string[];
  callbackUrl?: string;
  developerPortalUrl: string;
}

export interface LaunchReadinessReport {
  storageEngine: 'sqlite-wal';
  databaseFile: string;
  publicServerUrl: string;
  publicWebUrl: string;
  httpsConfigured: boolean;
  staticWebBundleBuilt: boolean;
  stripe: {
    secretConfigured: boolean;
    webhookSecretConfigured: boolean;
    priceIdsConfigured: boolean;
    webhookEndpointUrl: string;
  };
  complianceUrls: {
    privacyUrl: string;
    termsUrl: string;
    metaDeletionCallbackUrl: string;
  };
  channels: LaunchChannelCheck[];
}

export function extractFirstUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/https?:\/\/[^\s)"'<>]+/i);
  return match ? match[0] : undefined;
}

export interface PromoCodeRecord {
  code: string;
  grantTier: Exclude<PlanTierId, 'free'>;
  billingInterval: BillingInterval;
  maxUses: number;
  usedCount: number;
  note?: string;
  active: boolean;
  createdAt: string;
}

export interface EmailOutboxItem {
  id: string;
  toEmail: string;
  subject: string;
  category: 'password_reset' | 'team_invite' | 'client_review' | 'publish_alert';
  previewText: string;
  deliveryMode: 'resend_live' | 'local_outbox';
  createdAt: string;
}

export interface WorkspaceApiKey {
  id: string;
  workspaceId: string;
  label: string;
  keyPrefix: string;
  lastUsedAt?: string;
  createdAt: string;
}

export interface MediaVaultAsset {
  id: string;
  workspaceId: string;
  kind: 'photo' | 'video';
  label: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  durationSec?: number;
  sampleTint?: string;
  createdAt: string;
}

export interface AdminOverviewSummary {
  mrrUsd: number;
  arrUsd: number;
  counts: {
    totalUsers: number;
    freeUsers: number;
    creatorUsers: number;
    studioUsers: number;
    totalWorkspaces: number;
    scheduledJobs: number;
    publishedJobs: number;
    failedJobs: number;
  };
  users: Array<AuthUser & { workspacesCount: number }>;
  promoCodes: PromoCodeRecord[];
  recentEmails: EmailOutboxItem[];
}

export type BatchCadencePreset = 'weekdays' | 'daily' | 'mwf' | 'twice_daily';

export function computeBatchSlotIsos(
  startDateIso: string,
  count: number,
  cadence: BatchCadencePreset,
  primaryHour = 9,
  primaryMinute = 30
): string[] {
  if (count <= 0) return [];
  const parsed = new Date(startDateIso);
  const cursor = Number.isNaN(parsed.getTime()) ? new Date() : new Date(parsed);
  cursor.setSeconds(0, 0);

  const isAllowedWeekday = (d: Date): boolean => {
    const dow = d.getDay(); // 0 Sun .. 6 Sat
    if (cadence === 'weekdays') return dow >= 1 && dow <= 5;
    if (cadence === 'mwf') return dow === 1 || dow === 3 || dow === 5;
    return true;
  };

  const out: string[] = [];
  let safety = 0;

  if (cadence === 'twice_daily') {
    const eveningHour = primaryHour < 15 ? 18 : Math.min(21, primaryHour + 4);
    const dayCursor = new Date(cursor);
    while (out.length < count && safety < 400) {
      safety++;
      const morning = new Date(dayCursor);
      morning.setHours(primaryHour, primaryMinute, 0, 0);
      out.push(morning.toISOString());
      if (out.length >= count) break;

      const evening = new Date(dayCursor);
      evening.setHours(eveningHour, 0, 0, 0);
      out.push(evening.toISOString());

      dayCursor.setDate(dayCursor.getDate() + 1);
    }
    return out;
  }

  const dayCursor = new Date(cursor);
  while (out.length < count && safety < 400) {
    safety++;
    if (isAllowedWeekday(dayCursor)) {
      const slot = new Date(dayCursor);
      slot.setHours(primaryHour, primaryMinute, 0, 0);
      out.push(slot.toISOString());
    }
    dayCursor.setDate(dayCursor.getDate() + 1);
  }
  return out;
}

export interface PublicReviewPayload {
  workspaceName: string;
  workspaceColor: string;
  accounts: Pick<ConnectedAccount, 'platformGroup' | 'handle' | 'displayName'>[];
  job: Pick<
    PublishJob,
    | 'id'
    | 'createdAt'
    | 'lifecycle'
    | 'scheduledAt'
    | 'postKind'
    | 'video'
    | 'photos'
    | 'master'
    | 'overrides'
  > & {
    approval: PostApprovalState;
  };
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatScheduleLabel(iso?: string): string {
  if (!iso) return '';
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '';

  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const timeStr = target.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (sameDay(target, now)) {
    return `Today · ${timeStr}`;
  }
  if (sameDay(target, tomorrow)) {
    return `Tomorrow · ${timeStr}`;
  }

  const dayStr = target.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${dayStr} · ${timeStr}`;
}

export function formatCompactNumber(value: number): string {
  const n = Math.max(0, Math.round(value || 0));
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k >= 100 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')}K`;
  }
  return n.toLocaleString();
}

export function mergeHashtagStrings(existing: string, incoming: string): string {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const tag of [
    ...normalizeHashtags(existing),
    ...normalizeHashtags(incoming),
  ]) {
    const lower = tag.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      ordered.push(tag.replace(/^#/, ''));
    }
  }
  return ordered.join(' ');
}

export function computeWorkspaceAnalytics(
  workspaceId: string,
  jobs: PublishJob[],
  range: AnalyticsTimeRange = '30d'
): WorkspaceAnalyticsSummary {
  const nowMs = Date.now();
  const cutoffMs =
    range === '7d'
      ? nowMs - 7 * 24 * 3600 * 1000
      : range === '30d'
      ? nowMs - 30 * 24 * 3600 * 1000
      : 0;

  const publishedJobs = jobs
    .filter((job) => {
      if ((job.lifecycle ?? 'active') !== 'active') return false;
      const createdMs = new Date(job.createdAt).getTime();
      if (cutoffMs > 0 && Number.isFinite(createdMs) && createdMs < cutoffMs) {
        return false;
      }
      return Object.values(job.results).some(
        (r) => r && r.status === 'published' && r.metrics
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  let totalViews = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalSaves = 0;
  let totalLinkClicks = 0;
  let latestSync = '';

  const platformAccum = new Map<
    PlatformId,
    {
      postsCount: number;
      views: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      linkClicks: number;
    }
  >();

  const postBreakdowns: PostAnalyticsBreakdown[] = [];

  for (const job of publishedJobs) {
    const postKind = job.postKind ?? detectPostKind(job.video, job.photos);
    const platforms: PostPlatformMetricEntry[] = [];
    let jobViews = 0;
    let jobEngagements = 0;
    let jobClicks = 0;
    let winningPlatformId: PlatformId | null = null;
    let winningViews = -1;
    let firstCommentUsed = false;

    for (const pid of PLATFORM_ORDER) {
      const res = job.results[pid];
      if (!res || res.status !== 'published' || !res.metrics) continue;
      const m = res.metrics;
      const eng = m.likes + m.comments + m.shares + m.saves;

      platforms.push({
        platformId: pid,
        externalUrl: res.externalUrl,
        firstCommentPosted: res.firstCommentPosted,
        metrics: m,
      });

      if (res.firstCommentPosted) firstCommentUsed = true;
      jobViews += m.views;
      jobEngagements += eng;
      jobClicks += m.linkClicks;

      if (m.views > winningViews) {
        winningViews = m.views;
        winningPlatformId = pid;
      }

      totalViews += m.views;
      totalLikes += m.likes;
      totalComments += m.comments;
      totalShares += m.shares;
      totalSaves += m.saves;
      totalLinkClicks += m.linkClicks;
      if (m.lastSyncedAt > latestSync) latestSync = m.lastSyncedAt;

      const prev = platformAccum.get(pid) ?? {
        postsCount: 0,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        linkClicks: 0,
      };
      prev.postsCount += 1;
      prev.views += m.views;
      prev.likes += m.likes;
      prev.comments += m.comments;
      prev.shares += m.shares;
      prev.saves += m.saves;
      prev.linkClicks += m.linkClicks;
      platformAccum.set(pid, prev);
    }

    platforms.sort((a, b) => b.metrics.views - a.metrics.views);

    const headline =
      job.master.title.trim() ||
      job.master.caption.split('\n')[0]?.trim().slice(0, 72) ||
      (postKind === 'video'
        ? job.video?.fileName || 'Video post'
        : postKind === 'photo'
        ? `${job.photos?.length ?? 1}-photo carousel`
        : 'Text post');

    postBreakdowns.push({
      jobId: job.id,
      postKind,
      title: headline,
      captionPreview: job.master.caption.trim(),
      createdAt: job.createdAt,
      firstCommentUsed,
      totalViews: jobViews,
      totalEngagements: jobEngagements,
      totalLinkClicks: jobClicks,
      avgEngagementRatePct:
        jobViews > 0 ? Number(((jobEngagements / jobViews) * 100).toFixed(1)) : 0,
      winningPlatformId,
      winningViews: Math.max(0, winningViews),
      platforms,
    });
  }

  const byPlatform: PlatformAnalyticsRow[] = Array.from(
    platformAccum.entries()
  )
    .map(([platformId, acc]) => {
      const engagements = acc.likes + acc.comments + acc.shares + acc.saves;
      return {
        platformId,
        postsCount: acc.postsCount,
        views: acc.views,
        engagements,
        likes: acc.likes,
        comments: acc.comments,
        shares: acc.shares,
        saves: acc.saves,
        linkClicks: acc.linkClicks,
        engagementRatePct:
          acc.views > 0
            ? Number(((engagements / acc.views) * 100).toFixed(1))
            : 0,
        shareOfViewsPct:
          totalViews > 0
            ? Math.round((acc.views / totalViews) * 100)
            : 0,
      };
    })
    .sort((a, b) => b.views - a.views);

  const totalEngagements =
    totalLikes + totalComments + totalShares + totalSaves;
  const top = byPlatform[0] ?? null;

  return {
    workspaceId,
    range,
    lastSyncedAt: latestSync || new Date().toISOString(),
    totals: {
      publishedPosts: postBreakdowns.length,
      views: totalViews,
      engagements: totalEngagements,
      likes: totalLikes,
      comments: totalComments,
      shares: totalShares,
      saves: totalSaves,
      linkClicks: totalLinkClicks,
      avgEngagementRatePct:
        totalViews > 0
          ? Number(((totalEngagements / totalViews) * 100).toFixed(1))
          : 0,
    },
    topPlatform: top
      ? {
          platformId: top.platformId,
          views: top.views,
          shareOfViewsPct: top.shareOfViewsPct,
          engagementRatePct: top.engagementRatePct,
        }
      : null,
    byPlatform,
    postBreakdowns,
  };
}

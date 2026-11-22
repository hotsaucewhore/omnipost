import {
  createDefaultOverrides,
  DEFAULT_WORKSPACE_ID,
  PLATFORM_SPECS,
  PlatformId,
  PlatformPostMetrics,
  PostKind,
  PublishJob,
} from '../../shared/platforms';

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function seededFloat(seed: number, offset: number): number {
  const x = Math.sin(seed + offset * 9973) * 10000;
  return x - Math.floor(x);
}

const PLATFORM_REACH_WEIGHT: Record<PlatformId, number> = {
  tiktok: 1.45,
  instagram_reels: 1.6,
  youtube_shorts: 1.32,
  youtube_long: 0.78,
  facebook_video: 0.72,
  x: 0.88,
  threads: 0.64,
  bluesky: 0.46,
  linkedin: 0.74,
};

export function generateInitialPostMetrics(params: {
  jobId: string;
  platformId: PlatformId;
  postKind: PostKind;
  firstCommentPosted?: boolean;
  createdAtIso: string;
}): PlatformPostMetrics {
  const { jobId, platformId, postKind, firstCommentPosted, createdAtIso } =
    params;
  const seed = hashSeed(`${jobId}:${platformId}`);
  const ageHours = Math.max(
    0.15,
    (Date.now() - new Date(createdAtIso).getTime()) / 3_600_000
  );

  // Freshly published posts (< 30 mins old) show realistic early momentum;
  // multi-day posts reflect accumulated reach.
  const maturityFactor =
    ageHours < 0.5
      ? 0.08 + seededFloat(seed, 1) * 0.07
      : Math.min(2.3, 0.35 + Math.log1p(ageHours) * 0.42);

  const kindBoost =
    postKind === 'video'
      ? 1.25
      : postKind === 'photo'
      ? platformId === 'instagram_reels' || platformId === 'linkedin'
        ? 1.15
        : 0.92
      : platformId === 'x' ||
        platformId === 'linkedin' ||
        platformId === 'threads' ||
        platformId === 'bluesky'
      ? 1.08
      : 0.75;

  const variance = 0.62 + seededFloat(seed, 2) * 0.95;
  const baseViews =
    9200 *
    PLATFORM_REACH_WEIGHT[platformId] *
    maturityFactor *
    kindBoost *
    variance;

  const views = Math.max(64, Math.round(baseViews));

  const likeRate = 0.036 + seededFloat(seed, 3) * 0.042;
  const commentRate =
    (platformId === 'linkedin' ||
    platformId === 'threads' ||
    platformId === 'bluesky' ||
    platformId === 'x'
      ? 0.0065
      : 0.0032) *
    (0.7 + seededFloat(seed, 4) * 0.8);
  const shareRate = 0.0035 + seededFloat(seed, 5) * 0.0075;
  const saveRate =
    (postKind === 'photo' || postKind === 'video' ? 0.0055 : 0.0028) *
    (0.65 + seededFloat(seed, 6) * 0.9);

  const clickRateBase =
    platformId === 'linkedin' ||
    platformId === 'x' ||
    platformId === 'youtube_long' ||
    platformId === 'bluesky'
      ? 0.011
      : 0.0042;
  const clickMultiplier = firstCommentPosted ? 2.35 : 0.65;

  const likes = Math.max(3, Math.round(views * likeRate));
  const comments = Math.max(0, Math.round(views * commentRate));
  const shares = Math.max(0, Math.round(views * shareRate));
  const saves = Math.max(0, Math.round(views * saveRate));
  const linkClicks = Math.max(
    firstCommentPosted ? 4 : 0,
    Math.round(
      views * clickRateBase * clickMultiplier * (0.75 + seededFloat(seed, 7) * 0.6)
    )
  );

  const engagements = likes + comments + shares + saves;
  const engagementRatePct =
    views > 0 ? Number(((engagements / views) * 100).toFixed(1)) : 0;

  return {
    views,
    likes,
    comments,
    shares,
    saves,
    linkClicks,
    engagementRatePct,
    lastSyncedAt: new Date().toISOString(),
  };
}

export async function refreshPostMetrics(params: {
  prev: PlatformPostMetrics;
  jobId: string;
  platformId: PlatformId;
  mode: 'sandbox' | 'live';
  externalPostId?: string;
  firstCommentPosted?: boolean;
}): Promise<PlatformPostMetrics> {
  const { prev, jobId, platformId, mode, externalPostId, firstCommentPosted } =
    params;

  // Live public AT Protocol metrics fetch for Bluesky posts when available
  if (
    mode === 'live' &&
    platformId === 'bluesky' &&
    externalPostId?.startsWith('at://')
  ) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(
        externalPostId
      )}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const json: any = await res.json();
        const post = json?.posts?.[0];
        if (post) {
          const likes = Number(post.likeCount ?? prev.likes);
          const comments = Number(post.replyCount ?? prev.comments);
          const shares = Number(post.repostCount ?? prev.shares) + Number(post.quoteCount ?? 0);
          const estimatedViews = Math.max(prev.views, (likes + comments + shares) * 22 + 40);
          const engagements = likes + comments + shares + prev.saves;
          return {
            views: estimatedViews,
            likes,
            comments,
            shares,
            saves: prev.saves,
            linkClicks: prev.linkClicks,
            engagementRatePct: Number(((engagements / estimatedViews) * 100).toFixed(1)),
            lastSyncedAt: new Date().toISOString(),
          };
        }
      }
    } catch {
      // Fall back cleanly if network unavailable
    }
  }

  const seed = hashSeed(`${jobId}:${platformId}:${prev.views}`);
  const growthPct = 0.025 + seededFloat(seed, 1) * 0.055;
  const addedViews = Math.max(14, Math.round(prev.views * growthPct));
  const views = prev.views + addedViews;
  const likes = prev.likes + Math.max(1, Math.round(addedViews * (0.045 + seededFloat(seed, 2) * 0.03)));
  const comments =
    prev.comments + (seededFloat(seed, 3) > 0.45 ? Math.max(1, Math.round(addedViews * 0.005)) : 0);
  const shares =
    prev.shares + (seededFloat(seed, 4) > 0.5 ? Math.max(1, Math.round(addedViews * 0.005)) : 0);
  const saves =
    prev.saves + (seededFloat(seed, 5) > 0.48 ? Math.max(1, Math.round(addedViews * 0.006)) : 0);
  const linkClicks =
    prev.linkClicks +
    Math.max(
      firstCommentPosted ? 1 : 0,
      Math.round(addedViews * (firstCommentPosted ? 0.016 : 0.004))
    );

  const engagements = likes + comments + shares + saves;
  return {
    views,
    likes,
    comments,
    shares,
    saves,
    linkClicks,
    engagementRatePct:
      views > 0 ? Number(((engagements / views) * 100).toFixed(1)) : 0,
    lastSyncedAt: new Date().toISOString(),
  };
}

function buildPublishedJobSeed(opts: {
  id: string;
  workspaceId: string;
  daysAgo: number;
  postKind: PostKind;
  title: string;
  caption: string;
  hashtags: string;
  firstComment?: string;
  platforms: PlatformId[];
}): PublishJob {
  const createdAt = new Date(
    Date.now() - opts.daysAgo * 24 * 3600 * 1000
  ).toISOString();
  const overrides = createDefaultOverrides();
  (Object.keys(overrides) as PlatformId[]).forEach((pid) => {
    overrides[pid].enabled = opts.platforms.includes(pid);
  });

  const results: PublishJob['results'] = {};
  for (const pid of opts.platforms) {
    const spec = PLATFORM_SPECS[pid];
    const fcPosted = Boolean(opts.firstComment && spec.supportsFirstComment);
    results[pid] = {
      platformId: pid,
      status: 'published',
      progressPct: 100,
      statusMessage: fcPosted
        ? `Published to ${spec.shortName} (+ 1st comment)`
        : `Published to ${spec.shortName}`,
      mode: 'sandbox',
      externalPostId: `seed_${opts.id}_${pid}`,
      externalUrl: `https://omnipost.sandbox/${pid}/${opts.id}`,
      firstCommentPosted: fcPosted,
      metrics: generateInitialPostMetrics({
        jobId: opts.id,
        platformId: pid,
        postKind: opts.postKind,
        firstCommentPosted: fcPosted,
        createdAtIso: createdAt,
      }),
      updatedAt: createdAt,
    };
  }

  return {
    id: opts.id,
    workspaceId: opts.workspaceId,
    createdAt,
    updatedAt: createdAt,
    lifecycle: 'active',
    postKind: opts.postKind,
    video:
      opts.postKind === 'video'
        ? {
            fileName: 'studio-lighting-breakdown.mp4',
            mimeType: 'video/mp4',
            width: 1080,
            height: 1920,
            durationSec: 48,
            isSamplePreset: true,
          }
        : null,
    photos:
      opts.postKind === 'photo'
        ? [
            {
              id: `${opts.id}_p1`,
              fileName: 'slide-1.jpg',
              mimeType: 'image/jpeg',
              width: 1080,
              height: 1350,
              isSamplePreset: true,
              sampleTint: '#2E3532',
              sampleLabel: '01 · Setup',
            },
            {
              id: `${opts.id}_p2`,
              fileName: 'slide-2.jpg',
              mimeType: 'image/jpeg',
              width: 1080,
              height: 1350,
              isSamplePreset: true,
              sampleTint: '#4A4036',
              sampleLabel: '02 · Key Light',
            },
            {
              id: `${opts.id}_p3`,
              fileName: 'slide-3.jpg',
              mimeType: 'image/jpeg',
              width: 1080,
              height: 1350,
              isSamplePreset: true,
              sampleTint: '#2C3E4C',
              sampleLabel: '03 · Audio Chain',
            },
          ]
        : undefined,
    master: {
      title: opts.title,
      caption: opts.caption,
      hashtags: opts.hashtags,
      firstComment: opts.firstComment,
    },
    overrides,
    results,
  };
}

export function createSeededPublishedJobs(): PublishJob[] {
  return [
    buildPublishedJobSeed({
      id: 'job_seed_ws_default_1',
      workspaceId: DEFAULT_WORKSPACE_ID,
      daysAgo: 2,
      postKind: 'video',
      title: 'Two-light desk setup in 45 seconds',
      caption:
        'Swapped our bulky softbox for a 60W bounce off the side wall — cleaner skin tones and half the desk footprint.',
      hashtags: 'creatorstudio lighting filmmaking',
      firstComment:
        'Full gear list + diagram -> https://studio.example.com/lighting',
      platforms: [
        'instagram_reels',
        'tiktok',
        'youtube_shorts',
        'x',
        'threads',
      ],
    }),
    buildPublishedJobSeed({
      id: 'job_seed_ws_default_2',
      workspaceId: DEFAULT_WORKSPACE_ID,
      daysAgo: 5,
      postKind: 'photo',
      title: '',
      caption:
        'Three small changes we made to our audio chain this month (and the exact EQ settings on slide 3).',
      hashtags: 'audio podcasting behindthescenes',
      firstComment:
        'Download the EQ preset file -> https://studio.example.com/audio-preset',
      platforms: ['instagram_reels', 'linkedin', 'x', 'threads', 'bluesky'],
    }),
    buildPublishedJobSeed({
      id: 'job_seed_ws_default_3',
      workspaceId: DEFAULT_WORKSPACE_ID,
      daysAgo: 12,
      postKind: 'text',
      title: '',
      caption:
        'Cutting 15 minutes of repetitive uploading out of every publish day saved us almost 6 hours last month.',
      hashtags: 'creatorworkflow productivity',
      firstComment:
        'Read our publishing checklist -> https://studio.example.com/checklist',
      platforms: ['x', 'linkedin', 'threads', 'bluesky', 'facebook_video'],
    }),
    buildPublishedJobSeed({
      id: 'job_seed_ws_personal_1',
      workspaceId: 'ws_personal',
      daysAgo: 1.5,
      postKind: 'text',
      title: '',
      caption:
        'Software feels calmer when validation stays quiet until something actually needs your attention.',
      hashtags: 'productdesign buildinpublic',
      firstComment:
        'Longer design notes -> https://notes.example.com/calm-ui',
      platforms: ['x', 'threads', 'bluesky'],
    }),
    buildPublishedJobSeed({
      id: 'job_seed_ws_personal_2',
      workspaceId: 'ws_personal',
      daysAgo: 6,
      postKind: 'photo',
      title: '',
      caption: 'Weekend notebook sketches before writing a line of UI code.',
      hashtags: 'designcraft indiehacker',
      platforms: ['instagram_reels', 'x', 'threads', 'bluesky'],
    }),
  ];
}

function futureSlotIso(daysAhead: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function createSeededCalendarPipelineJobs(): PublishJob[] {
  const now = new Date().toISOString();

  const makeScheduledOrDraft = (opts: {
    id: string;
    workspaceId: string;
    lifecycle: 'scheduled' | 'draft';
    scheduledAt?: string;
    postKind: PostKind;
    title: string;
    caption: string;
    hashtags: string;
    firstComment?: string;
    platforms: PlatformId[];
    approval?: PublishJob['approval'];
  }): PublishJob => {
    const overrides = createDefaultOverrides();
    (Object.keys(overrides) as PlatformId[]).forEach((pid) => {
      overrides[pid].enabled = opts.platforms.includes(pid);
    });
    const results: PublishJob['results'] = {};
    for (const pid of opts.platforms) {
      results[pid] = {
        platformId: pid,
        status: 'queued',
        progressPct: 0,
        statusMessage:
          opts.lifecycle === 'draft' ? 'Saved in draft' : 'Scheduled',
        mode: 'sandbox',
        updatedAt: now,
      };
    }

    return {
      id: opts.id,
      workspaceId: opts.workspaceId,
      createdAt: now,
      updatedAt: now,
      lifecycle: opts.lifecycle,
      scheduledAt: opts.scheduledAt,
      postKind: opts.postKind,
      video:
        opts.postKind === 'video'
          ? {
              fileName: 'q4-studio-tour-cut.mp4',
              mimeType: 'video/mp4',
              width: 1080,
              height: 1920,
              durationSec: 52,
              isSamplePreset: true,
            }
          : null,
      photos:
        opts.postKind === 'photo'
          ? Array.from({ length: 6 }, (_, i) => ({
              id: `${opts.id}_ph_${i + 1}`,
              fileName: `carousel_0${i + 1}.jpg`,
              mimeType: 'image/jpeg',
              width: 1080,
              height: 1350,
              isSamplePreset: true,
              sampleTint: ['#36322E', '#2B3330', '#3B2E2B', '#2C3640'][i % 4],
              sampleLabel: `0${i + 1} · Slide ${i + 1}`,
            }))
          : undefined,
      master: {
        title: opts.title,
        caption: opts.caption,
        hashtags: opts.hashtags,
        firstComment: opts.firstComment,
      },
      overrides,
      results,
      approval: opts.approval,
    };
  };

  return [
    makeScheduledOrDraft({
      id: 'job_seed_sched_1',
      workspaceId: DEFAULT_WORKSPACE_ID,
      lifecycle: 'scheduled',
      scheduledAt: futureSlotIso(1, 9, 30),
      postKind: 'video',
      title: 'Full studio walkthrough & mic test',
      caption:
        'Testing our overhead boom placement vs lav mic in an untreated room.',
      hashtags: 'creatorstudio audio filmmaking',
      firstComment:
        'Raw audio comparison files -> https://studio.example.com/mic-test',
      platforms: ['instagram_reels', 'tiktok', 'youtube_shorts', 'x'],
      approval: {
        shareToken: 'rev_demo_studio_walkthrough',
        status: 'approved',
        reviewerName: 'Maya · Producer',
        updatedAt: now,
        comments: [
          {
            id: 'cmt_seed_1',
            authorName: 'Maya · Producer',
            role: 'client',
            body: 'Audio levels sound super clean — good to go for tomorrow morning!',
            decision: 'approved',
            createdAt: now,
          },
        ],
      },
    }),
    makeScheduledOrDraft({
      id: 'job_seed_sched_2',
      workspaceId: DEFAULT_WORKSPACE_ID,
      lifecycle: 'scheduled',
      scheduledAt: futureSlotIso(3, 12, 15),
      postKind: 'photo',
      title: '',
      caption:
        'Six-frame lighting diagram breakdown from this week’s shoot.',
      hashtags: 'cinematography lighting setup',
      firstComment:
        'Download the PDF lighting plot -> https://studio.example.com/plot',
      platforms: ['instagram_reels', 'linkedin', 'threads', 'bluesky'],
      approval: {
        shareToken: 'rev_demo_lighting_carousel',
        status: 'pending',
        updatedAt: now,
        comments: [],
      },
    }),
    makeScheduledOrDraft({
      id: 'job_seed_sched_3',
      workspaceId: DEFAULT_WORKSPACE_ID,
      lifecycle: 'scheduled',
      scheduledAt: futureSlotIso(6, 18, 0),
      postKind: 'text',
      title: '',
      caption:
        'Batching all next week’s cross-posts on Friday afternoon frees up Monday for actual creative work.',
      hashtags: 'creatorworkflow buildinpublic',
      platforms: ['x', 'linkedin', 'threads', 'bluesky'],
    }),
    makeScheduledOrDraft({
      id: 'job_seed_draft_1',
      workspaceId: DEFAULT_WORKSPACE_ID,
      lifecycle: 'draft',
      postKind: 'text',
      title: '',
      caption:
        'Color grading LUT notes + before/after stills (ready to drop onto an open calendar day).',
      hashtags: 'colorgrading filmmaking',
      firstComment: 'Free LUT pack -> https://studio.example.com/luts',
      platforms: ['x', 'threads', 'bluesky', 'linkedin'],
    }),
    makeScheduledOrDraft({
      id: 'job_seed_personal_sched_1',
      workspaceId: 'ws_personal',
      lifecycle: 'scheduled',
      scheduledAt: futureSlotIso(2, 9, 30),
      postKind: 'text',
      title: '',
      caption:
        'Notes from shipping a native SQLite WAL backend without external ORM bloat.',
      hashtags: 'typescript sqlite indiehacker',
      platforms: ['x', 'threads', 'bluesky'],
    }),
  ];
}

import {
  DEFAULT_WORKSPACE_ID,
  PublishJob,
  SocialCommentItem,
} from '../../shared/platforms';
import { StoredAccountRecord } from './adapters/types';

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - Math.round(hours * 3600 * 1000)).toISOString();
}

export function createSeededInboxComments(): SocialCommentItem[] {
  return [
    {
      id: 'inbox_seed_1',
      workspaceId: DEFAULT_WORKSPACE_ID,
      jobId: 'job_seed_ws_default_1',
      postTitle: 'Two-light desk setup in 45 seconds',
      platformId: 'instagram_reels',
      authorName: 'Elena Vance',
      authorHandle: '@elenafilms',
      body: 'What modifier are you using on the 60W bounce? Skin tones look super natural.',
      likes: 18,
      status: 'unanswered',
      createdAt: hoursAgoIso(2.5),
      replies: [],
    },
    {
      id: 'inbox_seed_2',
      workspaceId: DEFAULT_WORKSPACE_ID,
      jobId: 'job_seed_ws_default_1',
      postTitle: 'Two-light desk setup in 45 seconds',
      platformId: 'youtube_shorts',
      authorName: 'Marcus Chen',
      authorHandle: '@marcusaudio',
      body: 'How far from the side wall did you place the stand so it doesn’t spill onto the backdrop?',
      likes: 11,
      status: 'unanswered',
      createdAt: hoursAgoIso(5),
      replies: [],
    },
    {
      id: 'inbox_seed_3',
      workspaceId: DEFAULT_WORKSPACE_ID,
      jobId: 'job_seed_ws_default_2',
      postTitle: 'Three small changes we made to our audio chain',
      platformId: 'linkedin',
      authorName: 'Priya Nair',
      authorHandle: '@priyanair',
      body: 'Slide 3’s 320Hz cut saved our podcast mix this morning — appreciate you sharing actual numbers.',
      likes: 24,
      status: 'unanswered',
      createdAt: hoursAgoIso(9),
      replies: [],
    },
    {
      id: 'inbox_seed_4',
      workspaceId: DEFAULT_WORKSPACE_ID,
      jobId: 'job_seed_ws_default_3',
      postTitle: 'Cutting 15 minutes of repetitive uploading',
      platformId: 'bluesky',
      authorName: 'Samir Patel',
      authorHandle: '@samir.bsky.social',
      body: 'Do you batch record everything on one day or write captions first?',
      likes: 7,
      status: 'replied',
      createdAt: hoursAgoIso(22),
      replies: [
        {
          id: 'rep_seed_1',
          authorHandle: '@creatorstudio.bsky',
          body: 'Captions & hooks Monday morning, then record 4–5 clips back-to-back while lights are dialed in!',
          mode: 'sandbox',
          createdAt: hoursAgoIso(20),
        },
      ],
    },
    {
      id: 'inbox_seed_personal_1',
      workspaceId: 'ws_personal',
      jobId: 'job_seed_ws_personal_1',
      postTitle: 'Software feels calmer when validation stays quiet',
      platformId: 'x',
      authorName: 'Theo Kim',
      authorHandle: '@theokim_dev',
      body: '100% agree — inline warnings only when an actual platform limit breaks is so much nicer.',
      likes: 14,
      status: 'unanswered',
      createdAt: hoursAgoIso(4),
      replies: [],
    },
  ];
}

export async function fetchLiveBlueskyRepliesForJob(
  job: PublishJob
): Promise<SocialCommentItem[]> {
  const bskyRes = job.results.bluesky;
  const postUri = bskyRes?.externalPostId;
  if (!postUri || !postUri.startsWith('at://')) {
    return [];
  }

  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(
        postUri
      )}&depth=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const json: any = await res.json();
    const replies: any[] = Array.isArray(json?.thread?.replies)
      ? json.thread.replies
      : [];

    const items: SocialCommentItem[] = [];
    for (const r of replies) {
      const post = r?.post;
      if (!post?.uri || !post?.record?.text) continue;
      const safeId = `inbox_bsky_${Buffer.from(String(post.uri))
        .toString('base64url')
        .slice(-24)}`;
      items.push({
        id: safeId,
        workspaceId: job.workspaceId || DEFAULT_WORKSPACE_ID,
        jobId: job.id,
        postTitle:
          job.master.title ||
          job.master.caption.slice(0, 60) ||
          'Bluesky post',
        platformId: 'bluesky',
        externalCommentId: String(post.uri),
        externalPostId: postUri,
        authorName: String(
          post.author?.displayName || post.author?.handle || 'Bluesky User'
        ),
        authorHandle: `@${String(post.author?.handle || 'user.bsky.social')}`,
        body: String(post.record.text),
        likes: Number(post.likeCount || 0),
        status: 'unanswered',
        createdAt: String(post.record.createdAt || new Date().toISOString()),
        replies: [],
      });
    }
    return items;
  } catch {
    return [];
  }
}

export async function tryPublishLiveBlueskyReply(
  account: StoredAccountRecord | undefined,
  comment: SocialCommentItem,
  replyBody: string
): Promise<boolean> {
  if (
    !account ||
    account.mode !== 'live' ||
    !account.accessToken ||
    !account.externalAccountId ||
    !comment.externalCommentId?.startsWith('at://')
  ) {
    return false;
  }

  try {
    // Resolve CID for parent comment via getPosts
    const metaRes = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(
        comment.externalCommentId
      )}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!metaRes.ok) return false;
    const metaJson: any = await metaRes.json();
    const parentPost = metaJson?.posts?.[0];
    if (!parentPost?.cid) return false;

    const rootRef = parentPost.record?.reply?.root ?? {
      uri: parentPost.uri,
      cid: parentPost.cid,
    };

    const createRes = await fetch(
      'https://bsky.social/xrpc/com.atproto.repo.createRecord',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo: account.externalAccountId,
          collection: 'app.bsky.feed.post',
          record: {
            $type: 'app.bsky.feed.post',
            text: replyBody.slice(0, 300),
            createdAt: new Date().toISOString(),
            reply: {
              root: rootRef,
              parent: {
                uri: parentPost.uri,
                cid: parentPost.cid,
              },
            },
          },
        }),
        signal: AbortSignal.timeout(6000),
      }
    );
    return createRes.ok;
  } catch {
    return false;
  }
}

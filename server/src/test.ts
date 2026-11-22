import assert from 'assert';
import {
  classifyAspectRatio,
  computeBatchSlotIsos,
  createDefaultOverrides,
  recommendPlatformsForVideo,
  resolvePlatformText,
} from '../../shared/platforms';
import { validateAllPlatforms } from '../../shared/validator';
import { signTestStripeWebhookPayload } from './billing';
import { extractUrlMetadata, parseRssOrAtomXml } from './importer';
import { createApp, runDueScheduledTick } from './index';
import { normalizeSubtitleToSrt } from './mediaProcessor';
import { isAccountTokenExpiring } from './tokenRefresher';

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTests() {
  console.log('1. Testing aspect ratio & smart platform recommendation rules...');
  const verticalShort = {
    fileName: 'reel.mp4',
    mimeType: 'video/mp4',
    width: 1080,
    height: 1920,
    durationSec: 42,
  };
  assert.strictEqual(classifyAspectRatio(1080, 1920).label, '9:16');
  const recShort = recommendPlatformsForVideo(verticalShort);
  assert.strictEqual(recShort.tiktok, true);
  assert.strictEqual(recShort.instagram_reels, true);
  assert.strictEqual(recShort.youtube_shorts, true);
  assert.strictEqual(recShort.youtube_long, false);

  const horizontalLong = {
    fileName: 'episode.mp4',
    mimeType: 'video/mp4',
    width: 1920,
    height: 1080,
    durationSec: 480,
  };
  const recLong = recommendPlatformsForVideo(horizontalLong);
  assert.strictEqual(recLong.youtube_long, true);
  assert.strictEqual(recLong.facebook_video, true);
  assert.strictEqual(recLong.youtube_shorts, false);

  console.log('2. Testing Master -> Per-Platform override & #Shorts resolution...');
  const overrides = createDefaultOverrides();
  overrides.tiktok.useCustomText = true;
  overrides.tiktok.customCaption = 'TikTok exclusive hook!';
  overrides.tiktok.customHashtags = 'fyp viral';

  const master = {
    title: 'Behind the Scenes Build',
    caption: 'How we edited our latest video in half the time.',
    hashtags: '#creator #workflow',
  };

  const ttResolved = resolvePlatformText('tiktok', master, overrides.tiktok, verticalShort);
  assert.ok(ttResolved.combinedCaptionOrDescription.includes('TikTok exclusive hook!'));
  assert.ok(ttResolved.combinedCaptionOrDescription.includes('#fyp #viral'));

  const ytShortsResolved = resolvePlatformText(
    'youtube_shorts',
    master,
    overrides.youtube_shorts,
    verticalShort
  );
  assert.ok(ytShortsResolved.title.includes('#Shorts'));

  console.log('3. Testing validation errors (16:9 horizontal video on YouTube Shorts)...');
  overrides.youtube_shorts.enabled = true;
  const validations = validateAllPlatforms(horizontalLong, master, overrides, [
    {
      id: 'acc_yt',
      platformGroup: 'youtube',
      mode: 'sandbox',
      handle: '@test',
      displayName: 'Test',
      connectedAt: new Date().toISOString(),
    },
  ]);
  assert.strictEqual(validations.youtube_shorts.status, 'error');
  assert.ok(
    validations.youtube_shorts.issues.some(
      (i) => i.code === 'YT_SHORTS_MUST_BE_VERTICAL'
    )
  );

  console.log('3b. Testing Trim + Smart Hybrid (16:9 + Auto 9:16) clearing Shorts errors...');
  const editedHorizontal = {
    ...horizontalLong,
    edits: {
      trimStartSec: 10,
      trimEndSec: 185, // 175s (< 180s Shorts limit)
      reframeMode: 'smart_hybrid' as const,
      cropFocusX: 50,
      coverTimestampSec: 42,
    },
  };
  overrides.youtube_long.enabled = true;
  const hybridValidations = validateAllPlatforms(
    editedHorizontal,
    master,
    overrides,
    [
      {
        id: 'acc_yt',
        platformGroup: 'youtube',
        mode: 'sandbox',
        handle: '@test',
        displayName: 'Test',
        connectedAt: new Date().toISOString(),
      },
    ]
  );
  assert.notStrictEqual(hybridValidations.youtube_shorts.status, 'error');
  assert.strictEqual(hybridValidations.youtube_long.status, 'ready');

  console.log('4. Testing Relay HTTP API: fan-out publish + failure simulation + single-platform retry...');
  const app = createApp();
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4099;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Enable failure simulation on Instagram Sandbox account
    const accRes = await fetch(`${baseUrl}/api/accounts`);
    const accJson: any = await accRes.json();
    const igAcc = accJson.accounts.find((a: any) => a.platformGroup === 'instagram');
    assert.ok(igAcc, 'Expected pre-seeded Instagram sandbox account');

    await fetch(`${baseUrl}/api/accounts/${igAcc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulateFailure: true }),
    });

    // Submit a cross-post job across TikTok, IG Reels, YT Shorts, and Facebook
    const jobOverrides = createDefaultOverrides();
    const createRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoMeta: verticalShort,
        master,
        overrides: jobOverrides,
      }),
    });
    assert.strictEqual(createRes.status, 201);
    const created: any = await createRes.json();
    const jobId = created.job.id;

    // Poll until all platforms settle
    let settledJob: any = null;
    for (let i = 0; i < 20; i++) {
      await sleep(350);
      const pollRes = await fetch(`${baseUrl}/api/jobs/${jobId}`);
      const pollJson: any = await pollRes.json();
      const statuses = Object.values(pollJson.job.results).map((r: any) => r.status);
      if (statuses.every((s) => s === 'published' || s === 'failed')) {
        settledJob = pollJson.job;
        break;
      }
    }

    assert.ok(settledJob, 'Job should finish processing');
    assert.strictEqual(settledJob.results.tiktok.status, 'published');
    assert.strictEqual(settledJob.results.youtube_shorts.status, 'published');
    assert.strictEqual(settledJob.results.facebook_video.status, 'published');
    assert.strictEqual(settledJob.results.instagram_reels.status, 'failed');

    // Turn off failure simulation and retry ONLY instagram_reels
    await fetch(`${baseUrl}/api/accounts/${igAcc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulateFailure: false }),
    });

    const retryRes = await fetch(`${baseUrl}/api/jobs/${jobId}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformId: 'instagram_reels' }),
    });
    assert.strictEqual(retryRes.status, 200);

    let retriedJob: any = null;
    for (let i = 0; i < 20; i++) {
      await sleep(350);
      const pollRes = await fetch(`${baseUrl}/api/jobs/${jobId}`);
      const pollJson: any = await pollRes.json();
      if (pollJson.job.results.instagram_reels.status === 'published') {
        retriedJob = pollJson.job;
        break;
      }
    }
    assert.ok(retriedJob, 'Retried Instagram Reel should publish cleanly');

    console.log('5. Testing Drafts + Scheduled Queue + Background Scheduler Tick...');
    // Save a caption-only draft (no video yet)
    const draftRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoMeta: null,
        master: { title: 'Draft Hook Idea', caption: 'Script outline', hashtags: '' },
        overrides: jobOverrides,
        lifecycle: 'draft',
      }),
    });
    assert.strictEqual(draftRes.status, 201);
    const draftJson: any = await draftRes.json();
    assert.strictEqual(draftJson.job.lifecycle, 'draft');

    // Schedule a post in the past (1s ago) and verify scheduler tick dispatches it
    const pastIso = new Date(Date.now() - 1000).toISOString();
    const schedRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoMeta: verticalShort,
        master,
        overrides: jobOverrides,
        lifecycle: 'scheduled',
        scheduledAt: pastIso,
      }),
    });
    assert.strictEqual(schedRes.status, 201);
    const schedJson: any = await schedRes.json();
    assert.strictEqual(schedJson.job.lifecycle, 'scheduled');

    runDueScheduledTick();

    let firedSched: any = null;
    for (let i = 0; i < 20; i++) {
      await sleep(350);
      const pollRes = await fetch(`${baseUrl}/api/jobs/${schedJson.job.id}`);
      const pollJson: any = await pollRes.json();
      if (
        pollJson.job.lifecycle === 'active' &&
        pollJson.job.results.tiktok.status === 'published'
      ) {
        firedSched = pollJson.job;
        break;
      }
    }
    assert.ok(firedSched, 'Scheduled job should fire automatically on tick');

    // Clean up draft via DELETE
    const delRes = await fetch(`${baseUrl}/api/jobs/${draftJson.job.id}`, {
      method: 'DELETE',
    });
    assert.strictEqual(delRes.status, 200);

    console.log('6. Testing Text-Only & Photo Carousel cross-posting across X, Threads, Bluesky, LinkedIn & Instagram...');
    const textOverrides = createDefaultOverrides();
    textOverrides.tiktok.enabled = false;
    textOverrides.instagram_reels.enabled = false;
    textOverrides.youtube_shorts.enabled = false;
    textOverrides.youtube_long.enabled = false;
    textOverrides.facebook_video.enabled = true;
    textOverrides.x.enabled = true;
    textOverrides.threads.enabled = true;
    textOverrides.bluesky.enabled = true;
    textOverrides.linkedin.enabled = true;

    const textRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoMeta: null,
        photosMeta: [],
        master: {
          title: '',
          caption: 'Shipping photo carousels and text posts across every channel today.',
          hashtags: 'buildinpublic',
        },
        overrides: textOverrides,
      }),
    });
    assert.strictEqual(textRes.status, 201);
    const textJobJson: any = await textRes.json();
    assert.strictEqual(textJobJson.job.postKind, 'text');

    const photoOverrides = createDefaultOverrides();
    photoOverrides.youtube_shorts.enabled = false;
    photoOverrides.youtube_long.enabled = false;
    photoOverrides.instagram_reels.enabled = true;
    photoOverrides.tiktok.enabled = true;
    photoOverrides.facebook_video.enabled = true;
    photoOverrides.x.enabled = true;
    photoOverrides.threads.enabled = true;
    photoOverrides.bluesky.enabled = true;
    photoOverrides.linkedin.enabled = true;
    const fifteenPhotos = Array.from({ length: 15 }, (_, idx) => ({
      id: `p_${idx + 1}`,
      fileName: `slide_${idx + 1}.jpg`,
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
      isSamplePreset: true,
    }));
    const photoRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoMeta: null,
        photosMeta: fifteenPhotos,
        master: {
          title: '',
          caption: 'Fifteen-slide brand carousel.',
          hashtags: 'photography',
        },
        overrides: photoOverrides,
      }),
    });
    assert.strictEqual(photoRes.status, 201);
    const photoJobJson: any = await photoRes.json();
    assert.strictEqual(photoJobJson.job.postKind, 'photo');
    assert.strictEqual(photoJobJson.job.photos.length, 15);

    console.log('7. Testing Multi-Brand Workspaces isolation + Auto First-Comment...');
    const createWsRes = await fetch(`${baseUrl}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Podcast Brand', seedDemoAccounts: true }),
    });
    assert.strictEqual(createWsRes.status, 201);
    const createdWsJson: any = await createWsRes.json();
    const newWsId = createdWsJson.workspace.id;

    const wsJobsBefore = await (
      await fetch(`${baseUrl}/api/jobs?workspaceId=${newWsId}`)
    ).json();
    assert.strictEqual(wsJobsBefore.jobs.length, 0);

    const fcJobRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: newWsId,
        videoMeta: null,
        photosMeta: [],
        master: {
          title: '',
          caption: 'New episode is out today!',
          hashtags: 'podcast',
          firstComment: 'Listen here -> https://omnipost.fm/ep42',
        },
        overrides: textOverrides,
      }),
    });
    assert.strictEqual(fcJobRes.status, 201);
    const fcJobId = (await fcJobRes.json()).job.id;

    let fcSettled: any = null;
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      const pRes = await fetch(`${baseUrl}/api/jobs/${fcJobId}`);
      const pJson: any = await pRes.json();
      if (pJson.job.results.x.status === 'published') {
        fcSettled = pJson.job;
        break;
      }
    }
    assert.ok(fcSettled, 'Workspace job with firstComment should publish');
    assert.strictEqual(fcSettled.results.x.firstCommentPosted, true);
    assert.ok(
      fcSettled.results.x.metrics && fcSettled.results.x.metrics.views > 0,
      'Published result should attach initial performance metrics'
    );

    console.log('8. Testing Saved Presets CRUD + Cross-Platform Analytics Rollup & Sync...');
    const presetCreateRes = await fetch(`${baseUrl}/api/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: newWsId,
        name: 'Show Notes CTA',
        hashtags: 'podcast episodeclips',
        firstComment: 'Show notes -> https://omnipost.fm/notes',
      }),
    });
    assert.strictEqual(presetCreateRes.status, 201);
    const createdPreset = (await presetCreateRes.json()).preset;
    assert.strictEqual(createdPreset.workspaceId, newWsId);

    const wsPresets = (
      await (
        await fetch(`${baseUrl}/api/presets?workspaceId=${newWsId}`)
      ).json()
    ).presets;
    assert.strictEqual(wsPresets.length, 1);
    assert.strictEqual(wsPresets[0].name, 'Show Notes CTA');

    // Wait briefly so all platforms on fcJobId finish publishing
    await sleep(900);
    const analyticsBefore = (
      await (
        await fetch(
          `${baseUrl}/api/analytics?workspaceId=${newWsId}&range=30d`
        )
      ).json()
    ).analytics;
    assert.strictEqual(analyticsBefore.totals.publishedPosts, 1);
    assert.ok(analyticsBefore.totals.views > 0);
    assert.ok(analyticsBefore.byPlatform.length >= 1);
    assert.ok(analyticsBefore.postBreakdowns[0].winningPlatformId);

    const syncRes = await fetch(`${baseUrl}/api/analytics/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: newWsId, range: '30d' }),
    });
    assert.strictEqual(syncRes.status, 200);
    const analyticsAfter = (await syncRes.json()).analytics;
    assert.ok(
      analyticsAfter.totals.views > analyticsBefore.totals.views,
      'Syncing analytics should refresh & grow reach metrics'
    );

    const delPresetRes = await fetch(
      `${baseUrl}/api/presets/${createdPreset.id}`,
      { method: 'DELETE' }
    );
    assert.strictEqual(delPresetRes.status, 200);

    // Wait briefly for Step 6 jobs to finish background work, then clean up test fixtures
    await sleep(1200);
    for (const cleanupJobId of [
      jobId,
      schedJson.job.id,
      textJobJson.job.id,
      photoJobJson.job.id,
    ]) {
      await fetch(`${baseUrl}/api/jobs/${cleanupJobId}`, { method: 'DELETE' });
    }
    await fetch(`${baseUrl}/api/workspaces/${newWsId}`, { method: 'DELETE' });

    console.log('9. Testing SaaS User Auth, Multi-Tenant Isolation, & Starter/Creator/Studio Plan Gates...');
    const regEmail = `qa_${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sarah Agency',
        email: regEmail,
        password: 'password123',
      }),
    });
    assert.strictEqual(regRes.status, 201);
    const regJson: any = await regRes.json();
    assert.strictEqual(regJson.user.planTier, 'free');
    assert.strictEqual(regJson.workspaces.length, 1);
    const userToken = regJson.token;
    const userWsId = regJson.workspaces[0].id;
    const authHeaders = {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    };

    // Starter plan (free) blocks 2nd workspace with 402 -> requires Studio
    const blockedWsRes = await fetch(`${baseUrl}/api/workspaces`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Client Two' }),
    });
    assert.strictEqual(blockedWsRes.status, 402);
    const blockedWsJson: any = await blockedWsRes.json();
    assert.strictEqual(blockedWsJson.requiredTier, 'studio');

    // Starter plan (free) starts with 3 channels and blocks 4th channel with 402 -> requires Creator
    const blockedAccRes = await fetch(`${baseUrl}/api/accounts/sandbox`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ platformGroup: 'youtube', workspaceId: userWsId }),
    });
    assert.strictEqual(blockedAccRes.status, 402);
    const blockedAccJson: any = await blockedAccRes.json();
    assert.strictEqual(blockedAccJson.requiredTier, 'creator');

    // Upgrade to Creator ($12/mo) & Studio ($29/mo) in sandbox test mode
    const savedStripeKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const creatorUpRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          planTier: 'creator',
          billingInterval: 'monthly',
          workspaceId: userWsId,
        }),
      });
      assert.strictEqual(creatorUpRes.status, 200);
      const creatorUpJson: any = await creatorUpRes.json();
      assert.strictEqual(creatorUpJson.user.planTier, 'creator');

      const unlockedAccRes = await fetch(`${baseUrl}/api/accounts/sandbox`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ platformGroup: 'youtube', workspaceId: userWsId }),
      });
      assert.strictEqual(unlockedAccRes.status, 201);

      // Upgrade to Studio ($29/mo annual) -> unlocks unlimited client workspaces
      const studioUpRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          planTier: 'studio',
          billingInterval: 'annual',
          workspaceId: userWsId,
        }),
      });
      assert.strictEqual(studioUpRes.status, 200);

      const unlockedWsRes = await fetch(`${baseUrl}/api/workspaces`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: 'Client Two' }),
      });
      assert.strictEqual(unlockedWsRes.status, 201);
    } finally {
      if (savedStripeKey !== undefined) {
        process.env.STRIPE_SECRET_KEY = savedStripeKey;
      }
    }

    // Clean up QA user and all their workspaces/accounts
    const delUserRes = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.strictEqual(delUserRes.status, 200);

    console.log('10. Testing OAuth App-Review Compliance Legal Pages & Meta Data-Deletion Callback...');
    const privRes = await fetch(`${baseUrl}/privacy`);
    assert.strictEqual(privRes.status, 200);
    const privHtml = await privRes.text();
    assert.ok(
      privHtml.includes('Google API Services User Data Policy'),
      'Privacy page must include Google Limited Use disclosure'
    );

    const termsRes = await fetch(`${baseUrl}/terms`);
    assert.strictEqual(termsRes.status, 200);
    const termsHtml = await termsRes.text();
    assert.ok(
      termsHtml.includes('youtube.com/t/terms'),
      'Terms page must cite YouTube Terms of Service'
    );

    const metaDelRes = await fetch(
      `${baseUrl}/api/compliance/meta-data-deletion`,
      { method: 'POST' }
    );
    assert.strictEqual(metaDelRes.status, 200);
    const metaDelJson: any = await metaDelRes.json();
    assert.ok(metaDelJson.confirmation_code && metaDelJson.url);

    console.log('11. Testing 1-Click Shareable Client Approval Links (No-Login Client Review)...');
    const reviewDraftRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoMeta: null,
        master: {
          title: '',
          caption: 'Thursday launch post ready for client sign-off.',
          hashtags: 'productlaunch',
          firstComment: 'Pre-order link -> https://example.com/launch',
        },
        overrides: textOverrides,
        lifecycle: 'draft',
      }),
    });
    assert.strictEqual(reviewDraftRes.status, 201);
    const reviewJobId = (await reviewDraftRes.json()).job.id;

    // Studio Founder generates shareable review token
    const shareRes = await fetch(
      `${baseUrl}/api/jobs/${reviewJobId}/share-review`,
      { method: 'POST' }
    );
    assert.strictEqual(shareRes.status, 200);
    const { shareToken } = await shareRes.json();
    assert.ok(shareToken && shareToken.startsWith('rev_'));

    // Unauthenticated client fetches review portal payload
    const clientGetRes = await fetch(`${baseUrl}/api/review/${shareToken}`);
    assert.strictEqual(clientGetRes.status, 200);
    const clientGetJson: any = await clientGetRes.json();
    assert.strictEqual(clientGetJson.review.job.approval.status, 'pending');

    // Client requests changes first, then approves
    const clientChangeRes = await fetch(
      `${baseUrl}/api/review/${shareToken}/decision`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerName: 'Jordan (Client)',
          decision: 'changes_requested',
          comment: 'Can we swap Thursday to Friday morning?',
        }),
      }
    );
    assert.strictEqual(clientChangeRes.status, 200);
    assert.strictEqual(
      (await clientChangeRes.json()).review.job.approval.status,
      'changes_requested'
    );

    const clientApproveRes = await fetch(
      `${baseUrl}/api/review/${shareToken}/decision`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerName: 'Jordan (Client)',
          decision: 'approved',
          comment: 'Looks great now — approved!',
        }),
      }
    );
    assert.strictEqual(clientApproveRes.status, 200);
    const approvedPayload: any = await clientApproveRes.json();
    assert.strictEqual(approvedPayload.review.job.approval.status, 'approved');
    assert.strictEqual(approvedPayload.review.job.approval.comments.length, 2);

    await fetch(`${baseUrl}/api/jobs/${reviewJobId}`, { method: 'DELETE' });

    console.log('12. Testing Production SQLite WAL Storage, Token Expiry Guard, & Signed Stripe Webhooks...');
    const healthJson: any = await (await fetch(`${baseUrl}/api/health`)).json();
    assert.strictEqual(healthJson.storage.engine, 'sqlite-wal');

    assert.strictEqual(
      isAccountTokenExpiring({
        id: 'acc_1',
        platformGroup: 'youtube',
        mode: 'live',
        handle: '@yt',
        displayName: 'YT',
        refreshToken: 'rt_123',
        expiresAt: new Date(Date.now() + 60 * 1000).toISOString(), // 1m left (< 5m buffer)
        connectedAt: new Date().toISOString(),
      }),
      true
    );
    assert.strictEqual(
      isAccountTokenExpiring({
        id: 'acc_2',
        platformGroup: 'youtube',
        mode: 'live',
        handle: '@yt',
        displayName: 'YT',
        refreshToken: 'rt_123',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30m left
        connectedAt: new Date().toISOString(),
      }),
      false
    );

    // Register temporary customer, activate Studio via signed webhook, then cancel via signed webhook
    const whReg = await (
      await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Webhook Tester',
          email: `wh_${Date.now()}@example.com`,
          password: 'password123',
        }),
      })
    ).json();
    const whUserId = whReg.user.id;
    const whToken = whReg.token;

    const prevSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_key';
    try {
      const activateBody = JSON.stringify({
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_test_999',
            metadata: {
              userId: whUserId,
              planTier: 'studio',
              billingInterval: 'annual',
            },
          },
        },
      });

      // Forged signature must be rejected (400)
      const forgedRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 't=12345,v1=deadbeef',
        },
        body: activateBody,
      });
      assert.strictEqual(forgedRes.status, 400);

      // Valid HMAC-SHA256 signature upgrades user to Studio
      const validSig = signTestStripeWebhookPayload(
        activateBody,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      const validActivateRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': validSig,
        },
        body: activateBody,
      });
      assert.strictEqual(validActivateRes.status, 200);

      const meAfterUpgrade = await (
        await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${whToken}` },
        })
      ).json();
      assert.strictEqual(meAfterUpgrade.user.planTier, 'studio');

      // Subscription deletion downgrades customer back to Starter (free)
      const cancelBody = JSON.stringify({
        type: 'customer.subscription.deleted',
        data: {
          object: {
            customer: 'cus_test_999',
          },
        },
      });
      const cancelSig = signTestStripeWebhookPayload(
        cancelBody,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      const cancelRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': cancelSig,
        },
        body: cancelBody,
      });
      assert.strictEqual(cancelRes.status, 200);

      const meAfterCancel = await (
        await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${whToken}` },
        })
      ).json();
      assert.strictEqual(meAfterCancel.user.planTier, 'free');
    } finally {
      if (prevSecret === undefined) {
        delete process.env.STRIPE_WEBHOOK_SECRET;
      } else {
        process.env.STRIPE_WEBHOOK_SECRET = prevSecret;
      }
      await fetch(`${baseUrl}/api/auth/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${whToken}` },
      });
    }

    console.log('13. Testing Visual Content Calendar Pipeline Seeding & 1-Click Draft-to-Slot Rescheduling...');
    const seededJobsRes: any = await (
      await fetch(`${baseUrl}/api/jobs?workspaceId=ws_default`)
    ).json();
    assert.ok(
      seededJobsRes.jobs.some(
        (j: any) => j.id.startsWith('job_seed_sched_') && j.lifecycle === 'scheduled'
      ),
      'Default workspace should include seeded upcoming calendar pipeline jobs'
    );
    assert.ok(
      seededJobsRes.jobs.some(
        (j: any) => j.id === 'job_seed_draft_1' && j.lifecycle === 'draft'
      ),
      'Default workspace should include a seeded unscheduled draft ready for 1-click placement'
    );

    // Create an unscheduled draft, place it onto a calendar slot, reschedule it, then return to draft
    const calDraftRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoMeta: null,
        master: {
          title: '',
          caption: 'Calendar placement test post for Tuesday morning slot.',
          hashtags: 'contentcalendar',
          firstComment: '',
        },
        overrides: textOverrides,
        lifecycle: 'draft',
      }),
    });
    assert.strictEqual(calDraftRes.status, 201);
    const calDraftJob = (await calDraftRes.json()).job;
    assert.strictEqual(calDraftJob.lifecycle, 'draft');
    assert.strictEqual(calDraftJob.scheduledAt, undefined);

    const slotOneIso = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const placeRes = await fetch(`${baseUrl}/api/jobs/${calDraftJob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lifecycle: 'scheduled',
        scheduledAt: slotOneIso,
      }),
    });
    assert.strictEqual(placeRes.status, 200);
    const placedJob = (await placeRes.json()).job;
    assert.strictEqual(placedJob.lifecycle, 'scheduled');
    assert.strictEqual(placedJob.scheduledAt, slotOneIso);
    const placedResults = Object.values(placedJob.results ?? {});
    assert.ok(
      placedResults.length > 0 &&
        placedResults.every((r: any) => r.status === 'queued'),
      'Promoting a draft onto the calendar should preserve/initialize queued platform results'
    );

    const slotTwoIso = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const moveRes = await fetch(`${baseUrl}/api/jobs/${calDraftJob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lifecycle: 'scheduled',
        scheduledAt: slotTwoIso,
      }),
    });
    assert.strictEqual(moveRes.status, 200);
    assert.strictEqual((await moveRes.json()).job.scheduledAt, slotTwoIso);

    const unscheduleRes = await fetch(`${baseUrl}/api/jobs/${calDraftJob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lifecycle: 'draft',
        scheduledAt: null,
      }),
    });
    assert.strictEqual(unscheduleRes.status, 200);
    const unscheduledJob = (await unscheduleRes.json()).job;
    assert.strictEqual(unscheduledJob.lifecycle, 'draft');
    assert.strictEqual(unscheduledJob.scheduledAt, undefined);

    await fetch(`${baseUrl}/api/jobs/${calDraftJob.id}`, { method: 'DELETE' });

    console.log('14. Testing Team Members, Workspace Roles, Invited Claiming & Approval-Gated Publishing...');
    const defaultMembersRes: any = await (
      await fetch(`${baseUrl}/api/workspaces/ws_default/members`)
    ).json();
    assert.ok(
      defaultMembersRes.members.length >= 3 &&
        defaultMembersRes.members.some((m: any) => m.role === 'editor') &&
        defaultMembersRes.members.some((m: any) => m.role === 'approver'),
      'Default Creator Studio workspace should include seeded Owner, Editor, and Approver roles'
    );

    // Create isolated agency workspace with requireApproval: true
    const agencyWsRes = await (
      await fetch(`${baseUrl}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Approval Gate Agency' }),
      })
    ).json();
    const agencyWsId = agencyWsRes.workspace.id;

    const enableGateRes = await fetch(
      `${baseUrl}/api/workspaces/${agencyWsId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requireApproval: true }),
      }
    );
    assert.strictEqual(enableGateRes.status, 200);
    assert.strictEqual((await enableGateRes.json()).workspace.requireApproval, true);

    // Invite external Editor, then register that Editor and verify automatic invite claiming
    const editorEmail = `editor_${Date.now()}@agency.example.com`;
    const invRes = await fetch(
      `${baseUrl}/api/workspaces/${agencyWsId}/members`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Alex Editor',
          email: editorEmail,
          role: 'editor',
        }),
      }
    );
    assert.strictEqual(invRes.status, 201);
    assert.strictEqual((await invRes.json()).member.status, 'invited');

    const editorReg = await (
      await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Alex Editor',
          email: editorEmail,
          password: 'password123',
        }),
      })
    ).json();
    const editorHeaders = {
      Authorization: `Bearer ${editorReg.token}`,
      'Content-Type': 'application/json',
    };

    const editorWsList: any = await (
      await fetch(`${baseUrl}/api/workspaces`, { headers: editorHeaders })
    ).json();
    const sharedAgencyWs = editorWsList.workspaces.find(
      (w: any) => w.id === agencyWsId
    );
    assert.ok(sharedAgencyWs, 'Registered Editor should see shared Studio workspace');
    assert.strictEqual(sharedAgencyWs.currentUserRole, 'editor');

    // Editor cannot publish immediately (403)
    const blockedDirectPub = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: editorHeaders,
      body: JSON.stringify({
        workspaceId: agencyWsId,
        videoMeta: null,
        master: {
          title: '',
          caption: 'Trying direct publish as Editor.',
          hashtags: '',
        },
        overrides: textOverrides,
        lifecycle: 'active',
      }),
    });
    assert.strictEqual(blockedDirectPub.status, 403);

    // Editor schedules a post whose scheduledAt is ALREADY due (-10s), and runDueScheduledTick MUST hold it!
    const duePastIso = new Date(Date.now() - 10_000).toISOString();
    const editorSchedRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: editorHeaders,
      body: JSON.stringify({
        workspaceId: agencyWsId,
        videoMeta: null,
        master: {
          title: '',
          caption: 'Queued by Editor — must wait for approval before going live.',
          hashtags: 'teamworkflow',
        },
        overrides: textOverrides,
        lifecycle: 'scheduled',
        scheduledAt: duePastIso,
      }),
    });
    assert.strictEqual(editorSchedRes.status, 201);
    const gatedJobId = (await editorSchedRes.json()).job.id;

    // Editor cannot self-approve (403)
    const selfApproveRes = await fetch(
      `${baseUrl}/api/jobs/${gatedJobId}/team-decision`,
      {
        method: 'POST',
        headers: editorHeaders,
        body: JSON.stringify({ decision: 'approved' }),
      }
    );
    assert.strictEqual(selfApproveRes.status, 403);

    // Tick scheduler — job must STAY 'scheduled' because it is not approved yet!
    runDueScheduledTick();
    const stillHeldJob = (
      await (await fetch(`${baseUrl}/api/jobs/${gatedJobId}`)).json()
    ).job;
    assert.strictEqual(
      stillHeldJob.lifecycle,
      'scheduled',
      'Due post must remain held while unapproved in an approval-gated workspace'
    );

    // Studio Owner signs off via team-decision -> next tick releases and publishes it!
    const ownerApproveRes = await fetch(
      `${baseUrl}/api/jobs/${gatedJobId}/team-decision`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'approved',
          comment: 'Copy approved — ship it!',
        }),
      }
    );
    assert.strictEqual(ownerApproveRes.status, 200);
    assert.strictEqual(
      (await ownerApproveRes.json()).job.approval.status,
      'approved'
    );

    runDueScheduledTick();
    await sleep(900);
    const releasedJob = (
      await (await fetch(`${baseUrl}/api/jobs/${gatedJobId}`)).json()
    ).job;
    assert.strictEqual(
      releasedJob.lifecycle,
      'active',
      'Approved due post should release from gate on scheduler tick'
    );

    console.log('15. Testing Bulk Batch Scheduler & Weekday Cadence Slot Distribution...');
    const weekdaySlots = computeBatchSlotIsos(
      '2026-11-21T09:30:00.000Z', // Saturday -> must skip Sat/Sun onto Mon-Fri!
      5,
      'weekdays',
      9,
      30
    );
    assert.strictEqual(weekdaySlots.length, 5);
    assert.ok(
      weekdaySlots.every((iso) => {
        const dow = new Date(iso).getDay();
        return dow >= 1 && dow <= 5;
      }),
      'Weekdays cadence must skip Saturday and Sunday'
    );

    // Starter user attempting an 11-post batch gets HTTP 402 Creator upgrade prompt
    const blockedBatchRes = await fetch(`${baseUrl}/api/jobs/batch`, {
      method: 'POST',
      headers: editorHeaders, // Starter user on their OWN personal workspace
      body: JSON.stringify({
        lifecycle: 'scheduled',
        items: Array.from({ length: 11 }, (_, i) => ({
          caption: `Batch item ${i + 1}`,
          scheduledAt: new Date(Date.now() + (i + 1) * 3600_000).toISOString(),
        })),
      }),
    });
    assert.strictEqual(blockedBatchRes.status, 402);

    // Studio workspace schedules a 4-post mixed batch (video + carousel + long text auto-trimmed)
    const batchRes = await fetch(`${baseUrl}/api/jobs/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: agencyWsId,
        lifecycle: 'scheduled',
        holdForApproval: true,
        items: [
          {
            title: 'Batch clip 01',
            caption: 'Vertical studio tip #1',
            hashtags: 'studiotips',
            scheduledAt: weekdaySlots[0],
            videoMeta: {
              fileName: 'batch-1.mp4',
              mimeType: 'video/mp4',
              fileSizeBytes: 5_000_000,
              width: 1080,
              height: 1920,
              durationSec: 28,
              isSamplePreset: true,
            },
          },
          {
            caption: 'Four-slide carousel breakdown',
            scheduledAt: weekdaySlots[1],
            photosMeta: [
              {
                id: 'b_ph_1',
                fileName: 's1.jpg',
                mimeType: 'image/jpeg',
                width: 1080,
                height: 1350,
                isSamplePreset: true,
              },
              {
                id: 'b_ph_2',
                fileName: 's2.jpg',
                mimeType: 'image/jpeg',
                width: 1080,
                height: 1350,
                isSamplePreset: true,
              },
            ],
          },
          {
            caption:
              'Long essay note that exceeds 300 characters so the batch scheduler automatically creates tightened custom overrides for X and Bluesky while keeping full length on LinkedIn and Threads: ' +
              'A'.repeat(210),
            scheduledAt: weekdaySlots[2],
          },
          {
            caption: 'Friday wrap-up note.',
            scheduledAt: weekdaySlots[3],
          },
        ],
      }),
    });
    assert.strictEqual(batchRes.status, 201);
    const batchJson: any = await batchRes.json();
    assert.strictEqual(batchJson.jobs.length, 4);
    assert.ok(
      batchJson.jobs.every(
        (j: any) =>
          j.lifecycle === 'scheduled' && j.approval?.status === 'pending'
      ),
      'Batch scheduled into approval-gated workspace should attach pending approval state'
    );
    assert.strictEqual(
      batchJson.jobs[2].overrides.x.useCustomText,
      true,
      'Long batch caption should auto-tighten X override to fit 280 chars'
    );

    // Cleanup Step 14 & 15 test fixtures
    await fetch(`${baseUrl}/api/auth/me`, {
      method: 'DELETE',
      headers: editorHeaders,
    });
    await fetch(`${baseUrl}/api/workspaces/${agencyWsId}`, {
      method: 'DELETE',
    });

    console.log('16. Testing Link-in-Bio (/u/:slug) Micro-Page & Insights Click Attribution...');
    const analyticsBeforeClick: any = await (
      await fetch(`${baseUrl}/api/analytics?workspaceId=ws_default&range=all`)
    ).json();
    const clicksBefore = analyticsBeforeClick.analytics.totals.linkClicks;

    const bioPublicRes = await fetch(
      `${baseUrl}/api/bio/creatorstudio?trackView=1`
    );
    assert.strictEqual(bioPublicRes.status, 200);
    const bioPublicJson: any = await bioPublicRes.json();
    assert.strictEqual(bioPublicJson.bio.config.slug, 'creatorstudio');
    assert.ok(
      bioPublicJson.bio.posts.length > 0,
      'Public Bio page should surface published post cards with links'
    );

    const bioClickRes = await fetch(`${baseUrl}/api/bio/creatorstudio/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: 'post',
        targetId: 'job_seed_ws_default_1',
      }),
    });
    assert.strictEqual(bioClickRes.status, 200);
    const bioClickJson: any = await bioClickRes.json();
    assert.ok(bioClickJson.url && bioClickJson.totalClicks > 0);

    const analyticsAfterClick: any = await (
      await fetch(`${baseUrl}/api/analytics?workspaceId=ws_default&range=all`)
    ).json();
    assert.strictEqual(
      analyticsAfterClick.analytics.totals.linkClicks,
      clicksBefore + 1,
      'Clicking a post card on /u/:slug must increment Insights linkClicks attribution'
    );

    console.log('17. Testing Unified Comments Inbox, Inline Quick Reply & Status Lifecycle...');
    const inboxGetRes: any = await (
      await fetch(
        `${baseUrl}/api/inbox?workspaceId=ws_default&filter=unanswered`
      )
    ).json();
    assert.ok(
      inboxGetRes.comments.length > 0,
      'Default workspace should include unanswered audience comments'
    );

    const targetComment = inboxGetRes.comments[0];
    const prevReplyCount = targetComment.replies.length;
    const replyRes = await fetch(
      `${baseUrl}/api/inbox/${targetComment.id}/reply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: 'Used an Aputure Lantern 65 angled 45 degrees off the side wall!',
        }),
      }
    );
    assert.strictEqual(replyRes.status, 200);
    const repliedJson: any = await replyRes.json();
    assert.strictEqual(repliedJson.comment.status, 'replied');
    assert.strictEqual(
      repliedJson.comment.replies.length,
      prevReplyCount + 1
    );

    // Restore seed comment back to unanswered so demo inbox stays fresh
    await fetch(`${baseUrl}/api/inbox/${targetComment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'unanswered' }),
    });

    console.log('18. Testing URL OpenGraph Extractor, RSS/Atom Feed Importer & Evergreen Auto-Fill...');
    const parsedMeta = extractUrlMetadata(
      `<html><head>
        <meta property="og:site_name" content="Studio Journal" />
        <meta property="og:title" content="Clean Boom Mic Placement &amp; Room Treatment" />
        <meta name="description" content="How to tame reflections in a small studio." />
      </head></html>`,
      'https://journal.studio/boom-mic'
    );
    assert.strictEqual(
      parsedMeta.title,
      'Clean Boom Mic Placement & Room Treatment'
    );
    assert.ok(parsedMeta.suggestedFirstComment.includes('https://journal.studio/boom-mic'));

    const parsedFeed = parseRssOrAtomXml(
      `<rss version="2.0"><channel><title>Studio Weekly</title>
        <item><title>Episode 12: Color Grading</title><link>https://journal.studio/ep12</link><description>Halation &amp; skin tones.</description></item>
        <item><title>Episode 11: Key Lights</title><link>https://journal.studio/ep11</link><description>60W COB vs panel.</description></item>
      </channel></rss>`,
      'https://journal.studio/feed.xml'
    );
    assert.strictEqual(parsedFeed.feedTitle, 'Studio Weekly');
    assert.strictEqual(parsedFeed.items.length, 2);

    const urlApiRes = await fetch(`${baseUrl}/api/import/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://studio.example.com/clean-audio-chain',
      }),
    });
    assert.strictEqual(urlApiRes.status, 200);

    const rssApiRes = await fetch(`${baseUrl}/api/import/rss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedUrl: 'https://studio.example.com/feed.xml' }),
    });
    assert.strictEqual(rssApiRes.status, 200);
    assert.strictEqual((await rssApiRes.json()).feed.items.length, 3);

    // Evergreen Queue Recycling on an isolated workspace
    const evgWs = (
      await (
        await fetch(`${baseUrl}/api/workspaces`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Evergreen Test Brand' }),
        })
      ).json()
    ).workspace;

    const evgPostRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: evgWs.id,
        videoMeta: null,
        master: {
          title: '',
          caption: 'Timeless studio checklist — evergreen tip.',
          hashtags: 'evergreen',
        },
        overrides: textOverrides,
        lifecycle: 'draft',
        isEvergreen: true,
      }),
    });
    assert.strictEqual(evgPostRes.status, 201);
    const evgSourceJob = (await evgPostRes.json()).job;
    assert.strictEqual(evgSourceJob.isEvergreen, true);

    const fillRes = await fetch(
      `${baseUrl}/api/workspaces/${evgWs.id}/fill-evergreen`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysAhead: 7 }),
      }
    );
    assert.strictEqual(fillRes.status, 200);
    const fillJson: any = await fillRes.json();
    assert.ok(
      fillJson.count >= 4,
      'Evergreen auto-fill should populate open weekday slots across the next 7 days'
    );
    assert.ok(
      fillJson.created.every(
        (j: any) =>
          j.lifecycle === 'scheduled' && j.recycledFromJobId === evgSourceJob.id
      )
    );

    await fetch(`${baseUrl}/api/workspaces/${evgWs.id}`, { method: 'DELETE' });

    console.log('19. Testing Production Launch Readiness & Ordered OAuth Diagnostics...');
    const readyRes = await fetch(`${baseUrl}/api/launch-readiness`);
    assert.strictEqual(readyRes.status, 200);
    const readyJson: any = await readyRes.json();
    assert.strictEqual(readyJson.readiness.storageEngine, 'sqlite-wal');
    assert.strictEqual(readyJson.readiness.channels.length, 8);
    assert.strictEqual(readyJson.readiness.channels[0].groupId, 'bluesky');
    assert.strictEqual(readyJson.readiness.channels[0].liveReady, true);

    console.log('20. Testing Founder Admin Console, RBAC Guard & Promo Code Redemption...');
    const promoCustomerEmail = `promo_${Date.now()}@example.com`;
    const promoReg: any = await (
      await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Beta Creator',
          email: promoCustomerEmail,
          password: 'password123',
        }),
      })
    ).json();
    const customerHeaders = {
      Authorization: `Bearer ${promoReg.token}`,
      'Content-Type': 'application/json',
    };

    // Regular customer must be blocked (403) from Founder Admin Console
    const blockedAdminRes = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: customerHeaders,
    });
    assert.strictEqual(blockedAdminRes.status, 403);

    // Founder Admin views overview & creates a custom promo code
    const adminOverviewRes = await fetch(`${baseUrl}/api/admin/overview`);
    assert.strictEqual(adminOverviewRes.status, 200);
    const adminOverviewJson: any = await adminOverviewRes.json();
    assert.ok(adminOverviewJson.overview.mrrUsd >= 29);

    const testPromoCode = `VIP${Date.now().toString().slice(-5)}`;
    const createPromoRes = await fetch(`${baseUrl}/api/admin/promo-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: testPromoCode,
        grantTier: 'studio',
        maxUses: 5,
        note: 'Automated QA promo test',
      }),
    });
    assert.strictEqual(createPromoRes.status, 201);

    // Starter customer redeems promo code -> immediately unlocks Studio!
    const redeemRes = await fetch(`${baseUrl}/api/billing/redeem-promo`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({ code: testPromoCode }),
    });
    assert.strictEqual(redeemRes.status, 200);
    const redeemJson: any = await redeemRes.json();
    assert.strictEqual(redeemJson.user.planTier, 'studio');

    console.log('21. Testing Password Reset 6-Digit Recovery & Transactional Email Outbox...');
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: promoCustomerEmail }),
    });
    assert.strictEqual(forgotRes.status, 200);
    const forgotJson: any = await forgotRes.json();
    assert.ok(forgotJson.devResetCode && forgotJson.devResetCode.length === 6);

    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: promoCustomerEmail,
        code: forgotJson.devResetCode,
        newPassword: 'newpassword789',
      }),
    });
    assert.strictEqual(resetRes.status, 200);

    // Verify new password logs in cleanly
    const reloginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: promoCustomerEmail,
        password: 'newpassword789',
      }),
    });
    assert.strictEqual(reloginRes.status, 200);
    const reloginToken = (await reloginRes.json()).token;

    console.log('22. Testing Studio REST API Keys & Public /api/v1/posts Automation...');
    const customerWsId = promoReg.workspaces[0].id;
    const keyCreateRes = await fetch(
      `${baseUrl}/api/workspaces/${customerWsId}/api-keys`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${reloginToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ label: 'Zapier Pipeline' }),
      }
    );
    assert.strictEqual(keyCreateRes.status, 201);
    const { secretKey, apiKey } = await keyCreateRes.json();
    assert.ok(secretKey.startsWith('omni_live_'));

    const v1UnauthRes = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: 'Should fail without key' }),
    });
    assert.strictEqual(v1UnauthRes.status, 401);

    const v1PostRes = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://studio.example.com/automated-zapier-post',
        lifecycle: 'scheduled',
      }),
    });
    assert.strictEqual(v1PostRes.status, 201);
    const v1PostJson: any = await v1PostRes.json();
    assert.strictEqual(v1PostJson.job.workspaceId, customerWsId);
    assert.strictEqual(v1PostJson.job.lifecycle, 'scheduled');
    assert.ok(
      v1PostJson.job.master.firstComment?.includes(
        'https://studio.example.com/automated-zapier-post'
      )
    );

    await fetch(
      `${baseUrl}/api/workspaces/${customerWsId}/api-keys/${apiKey.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${reloginToken}` },
      }
    );
    await fetch(`${baseUrl}/api/admin/promo-codes/${testPromoCode}`, {
      method: 'DELETE',
    });
    await fetch(`${baseUrl}/api/auth/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${reloginToken}` },
    });

    console.log('23. Testing Workspace Media Vault & WebVTT-to-SRT Subtitle Normalizer...');
    const normalizedSrt = normalizeSubtitleToSrt(
      `WEBVTT\n\n00:00:00.500 --> 00:00:03.250 align:start\nFirst clean caption line.\n\n00:04.100 --> 00:07.800\nSecond caption line.`
    );
    assert.ok(
      normalizedSrt.includes('00:00:00,500 --> 00:00:03,250') &&
        normalizedSrt.includes('00:00:04,100 --> 00:00:07,800'),
      'WebVTT timestamps must normalize to clean SRT format for FFmpeg burn-in'
    );

    const vaultGetRes: any = await (
      await fetch(`${baseUrl}/api/workspaces/ws_default/vault`)
    ).json();
    assert.ok(
      vaultGetRes.assets.length >= 4,
      'Default workspace should include seeded reusable Media Vault assets'
    );

    console.log('✅ All OmniPost validation & server integration tests passed!');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

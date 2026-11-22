import fs from 'fs';
import path from 'path';
import {
  AccountGroupId,
  LaunchChannelCheck,
  LaunchReadinessReport,
} from '../../shared/platforms';
import { ADAPTER_REGISTRY } from './adapters';
import { isStripeLiveConfigured } from './billing';
import { store } from './store';

const CHANNEL_APPROVAL_CATALOG: Array<{
  groupId: AccountGroupId;
  name: string;
  approvalSpeed: string;
  authKind: 'app_password' | 'oauth2';
  envKeys: string[];
  developerPortalUrl: string;
}> = [
  {
    groupId: 'bluesky',
    name: 'Bluesky (AT Protocol)',
    approvalSpeed: 'Instant · Live today via App Password',
    authKind: 'app_password',
    envKeys: [],
    developerPortalUrl: 'https://bsky.app/settings/app-passwords',
  },
  {
    groupId: 'youtube',
    name: 'YouTube (Shorts & Long-form)',
    approvalSpeed: 'Fast · Instant test users, 3–5d verification',
    authKind: 'oauth2',
    envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    developerPortalUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    groupId: 'linkedin',
    name: 'LinkedIn ("Share on LinkedIn")',
    approvalSpeed: 'Fast · Typically auto-approved in <24h',
    authKind: 'oauth2',
    envKeys: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    developerPortalUrl: 'https://www.linkedin.com/developers/apps',
  },
  {
    groupId: 'x',
    name: 'X (API v2 OAuth 2.0 PKCE)',
    approvalSpeed: 'Same day · Instant once developer tier is active',
    authKind: 'oauth2',
    envKeys: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    developerPortalUrl: 'https://developer.x.com/en/portal/dashboard',
  },
  {
    groupId: 'threads',
    name: 'Threads (Meta Threads API)',
    approvalSpeed: '2–5 business days · Meta App Review',
    authKind: 'oauth2',
    envKeys: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
    developerPortalUrl: 'https://developers.facebook.com/apps/',
  },
  {
    groupId: 'instagram',
    name: 'Instagram (Reels & Carousels)',
    approvalSpeed: '3–7 business days · Meta Graph Review',
    authKind: 'oauth2',
    envKeys: ['META_APP_ID', 'META_APP_SECRET'],
    developerPortalUrl: 'https://developers.facebook.com/apps/',
  },
  {
    groupId: 'facebook',
    name: 'Facebook Pages (Reels, Video & Feed)',
    approvalSpeed: '3–7 business days · Bundled with Meta App',
    authKind: 'oauth2',
    envKeys: ['META_APP_ID', 'META_APP_SECRET'],
    developerPortalUrl: 'https://developers.facebook.com/apps/',
  },
  {
    groupId: 'tiktok',
    name: 'TikTok (Content Posting API)',
    approvalSpeed: '5–10 business days · Demo video audit',
    authKind: 'oauth2',
    envKeys: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    developerPortalUrl: 'https://developers.tiktok.com/apps',
  },
];

export function buildLaunchReadinessReport(
  fallbackServerOrigin: string
): LaunchReadinessReport {
  const publicServerUrl = (
    process.env.PUBLIC_SERVER_URL || fallbackServerOrigin
  ).replace(/\/+$/, '');
  const publicWebUrl = (
    process.env.PUBLIC_WEB_URL ||
    process.env.PUBLIC_SERVER_URL ||
    'http://localhost:8081'
  ).replace(/\/+$/, '');

  const staticDir =
    process.env.STATIC_WEB_DIR ||
    path.resolve(__dirname, '../../mobile/dist');
  const staticWebBundleBuilt = fs.existsSync(path.join(staticDir, 'index.html'));

  const storage = store.getStorageInfo();
  const priceIdsConfigured = Boolean(
    process.env.STRIPE_PRICE_CREATOR_MONTHLY &&
      process.env.STRIPE_PRICE_STUDIO_MONTHLY
  );

  const channels: LaunchChannelCheck[] = CHANNEL_APPROVAL_CATALOG.map((item) => {
    const liveReady =
      item.authKind === 'app_password'
        ? true
        : ADAPTER_REGISTRY[item.groupId].isLiveConfigured();
    return {
      groupId: item.groupId,
      name: item.name,
      approvalSpeed: item.approvalSpeed,
      liveReady,
      authKind: item.authKind,
      envKeys: item.envKeys,
      callbackUrl:
        item.authKind === 'oauth2'
          ? `${publicServerUrl}/api/oauth/${item.groupId}/callback`
          : undefined,
      developerPortalUrl: item.developerPortalUrl,
    };
  });

  return {
    storageEngine: storage.engine,
    databaseFile: storage.databaseFile,
    publicServerUrl,
    publicWebUrl,
    httpsConfigured:
      publicServerUrl.startsWith('https://') &&
      publicWebUrl.startsWith('https://'),
    staticWebBundleBuilt,
    stripe: {
      secretConfigured: isStripeLiveConfigured(),
      webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      priceIdsConfigured,
      webhookEndpointUrl: `${publicServerUrl}/api/billing/webhook`,
    },
    complianceUrls: {
      privacyUrl: `${publicWebUrl}/privacy`,
      termsUrl: `${publicWebUrl}/terms`,
      metaDeletionCallbackUrl: `${publicServerUrl}/api/compliance/meta-data-deletion`,
    },
    channels,
  };
}

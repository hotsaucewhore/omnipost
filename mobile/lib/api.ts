import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  ACCOUNT_GROUPS,
  AccountGroupId,
  AdminOverviewSummary,
  AnalyticsTimeRange,
  AuthUser,
  BillingInterval,
  BioPageConfig,
  BrandWorkspace,
  computeWorkspaceAnalytics,
  ConnectedAccount,
  ContentPreset,
  DEFAULT_USER_ID,
  DEFAULT_WORKSPACE_ID,
  detectPostKind,
  ImportedRssFeed,
  ImportedUrlPreview,
  InboxFilterStatus,
  JobLifecycle,
  LaunchReadinessReport,
  MasterDraft,
  MediaVaultAsset,
  PhotoAssetMeta,
  PLAN_TIERS,
  PlanTierId,
  PlanUsageSummary,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PlatformId,
  PlatformOverride,
  PromoCodeRecord,
  PublicBioPagePayload,
  PublicReviewPayload,
  PublishJob,
  SocialCommentItem,
  VideoAssetMeta,
  WORKSPACE_COLORS,
  WorkspaceAnalyticsSummary,
  WorkspaceApiKey,
  WorkspaceMember,
  WorkspaceRole,
} from '../../shared/platforms';

function resolveDefaultServerUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'web') {
    if (
      typeof window !== 'undefined' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      return window.location.origin;
    }
    return 'http://localhost:4000';
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const lanHost = hostUri.split(':')[0];
    if (lanHost && (lanHost.startsWith('192.') || lanHost.startsWith('10.') || lanHost === 'localhost')) {
      return `http://${lanHost}:4000`;
    }
  }
  return 'https://omnipoststudio.com';
}

export const SERVER_BASE_URL = resolveDefaultServerUrl();

const TOKEN_STORAGE_KEY = 'omnipost_auth_token_v1';
const SIGNED_OUT_STORAGE_KEY = 'omnipost_signed_out_v1';

let memoryAuthToken: string | null = null;
let memorySignedOut = false;
let activeRolePreviewHeader: WorkspaceRole | null = null;

export function setActiveRolePreviewHeader(role: WorkspaceRole | null) {
  activeRolePreviewHeader = role;
}

export function getStoredAuthToken(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return memoryAuthToken;
    }
  }
  return memoryAuthToken;
}

export function setStoredAuthToken(token: string | null) {
  memoryAuthToken = token;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      if (token) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota errors
    }
  }
}

export function getStoredSignedOut(): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      return window.localStorage.getItem(SIGNED_OUT_STORAGE_KEY) === '1';
    } catch {
      return memorySignedOut;
    }
  }
  return memorySignedOut;
}

export function setStoredSignedOut(val: boolean) {
  memorySignedOut = val;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      if (val) {
        window.localStorage.setItem(SIGNED_OUT_STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(SIGNED_OUT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota errors
    }
  }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getStoredAuthToken();
  const base: Record<string, string> = { ...(extra ?? {}) };
  if (token) {
    base.Authorization = `Bearer ${token}`;
  }
  if (activeRolePreviewHeader) {
    base['x-omnipost-role-preview'] = activeRolePreviewHeader;
  }
  return base;
}

export class PlanLimitError extends Error {
  code = 'PLAN_LIMIT_REACHED' as const;
  requiredTier: PlanTierId;
  constructor(message: string, requiredTier: PlanTierId = 'creator') {
    super(message);
    this.name = 'PlanLimitError';
    this.requiredTier = requiredTier;
  }
}

function isNetworkFailure(err: any): boolean {
  if (err instanceof PlanLimitError) return false;
  const msg = String(err?.message || '');
  return (
    !msg ||
    /fetch|network|Relay unavailable|Failed to fetch|Load failed/i.test(msg)
  );
}

let fallbackUser: AuthUser = {
  id: DEFAULT_USER_ID,
  email: 'founder@omnipost.app',
  name: 'Studio Founder',
  planTier: 'studio',
  billingInterval: 'monthly',
  createdAt: new Date().toISOString(),
};

let fallbackWorkspaces: BrandWorkspace[] = [
  {
    id: DEFAULT_WORKSPACE_ID,
    ownerUserId: DEFAULT_USER_ID,
    name: 'Creator Studio',
    accentColor: WORKSPACE_COLORS[0],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'ws_personal',
    ownerUserId: DEFAULT_USER_ID,
    name: 'Personal Brand',
    accentColor: WORKSPACE_COLORS[1],
    createdAt: new Date().toISOString(),
  },
];

let fallbackAccounts: ConnectedAccount[] = ACCOUNT_GROUPS.map((g) => ({
  id: `acc_sandbox_${DEFAULT_WORKSPACE_ID}_${g.id}`,
  workspaceId: DEFAULT_WORKSPACE_ID,
  platformGroup: g.id,
  mode: 'sandbox',
  handle: g.defaultSandboxHandle,
  displayName: g.defaultSandboxName,
  connectedAt: new Date().toISOString(),
  simulateFailure: false,
}));

let fallbackJobs: PublishJob[] = [];

let fallbackPresets: ContentPreset[] = [
  {
    id: 'preset_fallback_1',
    workspaceId: DEFAULT_WORKSPACE_ID,
    name: 'Studio tags',
    hashtags: 'creatorstudio filmmaking behindthescenes gear',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'preset_fallback_2',
    workspaceId: DEFAULT_WORKSPACE_ID,
    name: 'Newsletter CTA (1st comment)',
    firstComment:
      'Full breakdown + project files in this week’s note -> https://studio.example.com/notes',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'preset_fallback_3',
    workspaceId: DEFAULT_WORKSPACE_ID,
    name: 'New episode drop',
    captionSnippet:
      'New episode is out today — here is the 60-second takeaway:',
    hashtags: 'podcast creatorclips interview',
    firstComment:
      'Watch the full episode here -> https://youtube.com/@CreatorStudioYT',
    createdAt: new Date().toISOString(),
  },
];

function computeFallbackUsage(workspaceId: string): PlanUsageSummary {
  const spec = PLAN_TIERS[fallbackUser.planTier];
  return {
    planTier: fallbackUser.planTier,
    billingInterval: fallbackUser.billingInterval,
    workspacesUsed: fallbackWorkspaces.length,
    maxWorkspaces: spec.maxWorkspaces,
    accountsInActiveWorkspace: fallbackAccounts.filter(
      (a) => (a.workspaceId ?? DEFAULT_WORKSPACE_ID) === workspaceId
    ).length,
    maxAccountsPerWorkspace: spec.maxAccountsPerWorkspace,
    postsThisMonth: fallbackJobs.filter((j) => j.lifecycle !== 'draft').length,
    maxPostsPerMonth: spec.maxPostsPerMonth,
    fullAnalyticsHistory: spec.fullAnalyticsHistory,
    allowsClientApprovals: spec.allowsClientApprovals,
    stripeLiveConfigured: false,
  };
}

// --- AUTH & BILLING API ---
export interface AuthSessionResponse {
  user: AuthUser;
  token: string;
  workspaces: BrandWorkspace[];
  usage: PlanUsageSummary;
}

export async function registerAuthApi(params: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthSessionResponse> {
  const res = await fetch(`${SERVER_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not create account.');
  }
  setStoredAuthToken(json.token);
  setStoredSignedOut(false);
  return json;
}

export async function loginAuthApi(params: {
  email: string;
  password: string;
}): Promise<AuthSessionResponse> {
  const res = await fetch(`${SERVER_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Invalid email or password.');
  }
  setStoredAuthToken(json.token);
  setStoredSignedOut(false);
  return json;
}

export async function loginDemoFounderApi(): Promise<AuthSessionResponse> {
  const res = await fetch(`${SERVER_BASE_URL}/api/auth/demo`, {
    method: 'POST',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Demo sign-in failed.');
  }
  setStoredAuthToken(json.token);
  setStoredSignedOut(false);
  return json;
}

export async function logoutAuthApi(): Promise<void> {
  try {
    await fetch(`${SERVER_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
    });
  } catch {
    // Ignore offline error on logout
  }
  setStoredAuthToken(null);
  setStoredSignedOut(true);
}

export async function fetchMeAndUsageApi(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<{ user: AuthUser; usage: PlanUsageSummary }> {
  try {
    const res = await fetch(
      `${SERVER_BASE_URL}/api/auth/me?workspaceId=${encodeURIComponent(
        workspaceId
      )}`,
      { headers: authHeaders() }
    );
    if (res.status === 401) {
      // Stale token — clear and fall back cleanly to default session
      setStoredAuthToken(null);
      const retry = await fetch(
        `${SERVER_BASE_URL}/api/auth/me?workspaceId=${encodeURIComponent(
          workspaceId
        )}`
      );
      if (retry.ok) return await retry.json();
    }
    if (!res.ok) throw new Error('Relay unavailable');
    return await res.json();
  } catch {
    return {
      user: fallbackUser,
      usage: computeFallbackUsage(workspaceId),
    };
  }
}

export async function checkoutPlanApi(params: {
  planTier: PlanTierId;
  billingInterval: BillingInterval;
  workspaceId: string;
}): Promise<{
  mode: 'stripe' | 'sandbox';
  checkoutUrl?: string;
  user?: AuthUser;
  usage?: PlanUsageSummary;
}> {
  const clientAppUrl =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:8081';

  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/billing/checkout`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...params, clientAppUrl }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Billing update failed.');
    }
    return json;
  } catch (err: any) {
    if (!isNetworkFailure(err)) throw err;
    fallbackUser = {
      ...fallbackUser,
      planTier: params.planTier,
      billingInterval: params.billingInterval,
    };
    return {
      mode: 'sandbox',
      user: fallbackUser,
      usage: computeFallbackUsage(params.workspaceId),
    };
  }
}

// --- WORKSPACES ---
export interface WorkspacesResponse {
  workspaces: BrandWorkspace[];
  accountCounts: Record<string, number>;
}

export async function fetchWorkspacesApi(): Promise<WorkspacesResponse> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/workspaces`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Relay unavailable');
    return await res.json();
  } catch {
    return {
      workspaces: [...fallbackWorkspaces],
      accountCounts: Object.fromEntries(
        fallbackWorkspaces.map((w) => [
          w.id,
          fallbackAccounts.filter(
            (a) => (a.workspaceId ?? DEFAULT_WORKSPACE_ID) === w.id
          ).length,
        ])
      ),
    };
  }
}

export async function createWorkspaceApi(
  name: string,
  accentColor?: string,
  seedDemoAccounts = true
): Promise<BrandWorkspace> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/workspaces`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, accentColor, seedDemoAccounts }),
    });
    if (res.status === 402) {
      const json = await res.json();
      throw new PlanLimitError(
        json.error || 'Multi-brand workspaces require Studio.',
        json.requiredTier || 'studio'
      );
    }
    if (!res.ok) throw new Error('Relay unavailable');
    const json = await res.json();
    return json.workspace;
  } catch (err: any) {
    if (!isNetworkFailure(err)) throw err;
    const ws: BrandWorkspace = {
      id: `ws_${Date.now().toString(36)}`,
      name: name.trim() || 'New Workspace',
      accentColor:
        accentColor ||
        WORKSPACE_COLORS[fallbackWorkspaces.length % WORKSPACE_COLORS.length],
      createdAt: new Date().toISOString(),
    };
    fallbackWorkspaces = [...fallbackWorkspaces, ws];
    if (seedDemoAccounts) {
      const slug = ws.name.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'brand';
      const demo = ACCOUNT_GROUPS.map((g) => ({
        id: `acc_sandbox_${ws.id}_${g.id}`,
        workspaceId: ws.id,
        platformGroup: g.id,
        mode: 'sandbox' as const,
        handle: `@${slug}.${g.id.slice(0, 3)}`,
        displayName: `${ws.name} (${g.name})`,
        connectedAt: ws.createdAt,
        simulateFailure: false,
      }));
      fallbackAccounts = [...fallbackAccounts, ...demo];
    }
    return ws;
  }
}

export async function deleteWorkspaceApi(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/workspaces/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    if (fallbackWorkspaces.length <= 1) return false;
    fallbackWorkspaces = fallbackWorkspaces.filter((w) => w.id !== id);
    fallbackAccounts = fallbackAccounts.filter((a) => a.workspaceId !== id);
    fallbackJobs = fallbackJobs.filter((j) => j.workspaceId !== id);
    return true;
  }
}

export async function patchWorkspaceSettingsApi(
  workspaceId: string,
  patch: { name?: string; accentColor?: string; requireApproval?: boolean }
): Promise<BrandWorkspace | null> {
  const res = await fetch(`${SERVER_BASE_URL}/api/workspaces/${workspaceId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  const json = await res.json();
  if (res.status === 402) {
    throw new PlanLimitError(
      json.error || 'Approval-gated publishing requires Studio ($29/mo).',
      json.requiredTier || 'studio'
    );
  }
  if (!res.ok) {
    throw new Error(json.error || 'Could not update workspace settings.');
  }
  return json.workspace;
}

export async function fetchWorkspaceMembersApi(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<WorkspaceMember[]> {
  try {
    const res = await fetch(
      `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(
        workspaceId
      )}/members`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error('Relay unavailable');
    const json = await res.json();
    return json.members || [];
  } catch {
    return [
      {
        id: `mem_owner_${workspaceId}`,
        workspaceId,
        email: 'founder@omnipost.app',
        name: 'Studio Founder',
        role: 'owner',
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    ];
  }
}

export async function inviteWorkspaceMemberApi(
  workspaceId: string,
  params: {
    email: string;
    name?: string;
    role: Exclude<WorkspaceRole, 'owner'>;
  }
): Promise<{ member: WorkspaceMember; members: WorkspaceMember[] }> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(
      workspaceId
    )}/members`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
    }
  );
  const json = await res.json();
  if (res.status === 402) {
    throw new PlanLimitError(
      json.error || 'Team members & roles require Studio ($29/mo).',
      json.requiredTier || 'studio'
    );
  }
  if (!res.ok) {
    throw new Error(json.error || 'Could not invite member.');
  }
  return json;
}

export async function updateWorkspaceMemberRoleApi(
  workspaceId: string,
  memberId: string,
  role: Exclude<WorkspaceRole, 'owner'>
): Promise<WorkspaceMember[]> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(
      workspaceId
    )}/members/${encodeURIComponent(memberId)}`,
    {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ role }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not update member role.');
  }
  return json.members || [];
}

export async function removeWorkspaceMemberApi(
  workspaceId: string,
  memberId: string
): Promise<WorkspaceMember[]> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(
      workspaceId
    )}/members/${encodeURIComponent(memberId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not remove member.');
  }
  return json.members || [];
}

// --- ACCOUNTS ---
export interface AccountsResponse {
  accounts: ConnectedAccount[];
  liveConfigured: Record<AccountGroupId, boolean>;
  relayOnline: boolean;
}

export async function fetchAccountsAndStatus(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<AccountsResponse> {
  try {
    const res = await fetch(
      `${SERVER_BASE_URL}/api/accounts?workspaceId=${encodeURIComponent(
        workspaceId
      )}`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error('Relay unavailable');
    const json = await res.json();
    return {
      accounts: json.accounts,
      liveConfigured: json.liveConfigured,
      relayOnline: true,
    };
  } catch {
    return {
      accounts: fallbackAccounts.filter(
        (a) => (a.workspaceId ?? DEFAULT_WORKSPACE_ID) === workspaceId
      ),
      liveConfigured: {
        tiktok: false,
        instagram: false,
        youtube: false,
        facebook: false,
        x: false,
        threads: false,
        bluesky: false,
        linkedin: false,
      },
      relayOnline: false,
    };
  }
}

export async function connectSandboxAccount(
  platformGroup: AccountGroupId,
  handle?: string,
  displayName?: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<ConnectedAccount> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/accounts/sandbox`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        platformGroup,
        handle,
        displayName,
        workspaceId,
      }),
    });
    if (res.status === 402) {
      const json = await res.json();
      throw new PlanLimitError(
        json.error || 'Channel limit reached on Starter.',
        json.requiredTier || 'creator'
      );
    }
    if (!res.ok) throw new Error('Relay unavailable');
    const json = await res.json();
    return json.account;
  } catch (err: any) {
    if (!isNetworkFailure(err)) throw err;
    const spec = ACCOUNT_GROUPS.find((g) => g.id === platformGroup)!;
    const next: ConnectedAccount = {
      id: `acc_sandbox_${workspaceId}_${platformGroup}`,
      workspaceId,
      platformGroup,
      mode: 'sandbox',
      handle: handle?.trim() || spec.defaultSandboxHandle,
      displayName: displayName?.trim() || spec.defaultSandboxName,
      connectedAt: new Date().toISOString(),
      simulateFailure: false,
    };
    fallbackAccounts = [
      ...fallbackAccounts.filter(
        (a) =>
          !(
            (a.workspaceId ?? DEFAULT_WORKSPACE_ID) === workspaceId &&
            a.platformGroup === platformGroup
          )
      ),
      next,
    ];
    return next;
  }
}

export async function connectLiveBlueskyApi(params: {
  identifier: string;
  appPassword: string;
  workspaceId: string;
}): Promise<ConnectedAccount> {
  const res = await fetch(`${SERVER_BASE_URL}/api/accounts/bluesky/live`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (res.status === 402) {
    throw new PlanLimitError(
      json.error || 'Channel limit reached on Starter.',
      json.requiredTier || 'creator'
    );
  }
  if (!res.ok) {
    throw new Error(json.error || 'Could not verify Bluesky App Password.');
  }
  return json.account;
}

export async function patchAccount(
  id: string,
  patch: { simulateFailure?: boolean; handle?: string; displayName?: string }
): Promise<ConnectedAccount | null> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/accounts/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Relay unavailable');
    const json = await res.json();
    return json.account;
  } catch {
    fallbackAccounts = fallbackAccounts.map((a) =>
      a.id === id ? { ...a, ...patch } : a
    );
    return fallbackAccounts.find((a) => a.id === id) ?? null;
  }
}

export async function disconnectAccount(id: string): Promise<void> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/accounts/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Relay unavailable');
  } catch {
    fallbackAccounts = fallbackAccounts.filter((a) => a.id !== id);
  }
}

async function appendUriToFormData(
  formData: FormData,
  fieldName: string,
  uri: string,
  fileName: string,
  mimeType: string
) {
  if (Platform.OS === 'web') {
    const blobRes = await fetch(uri);
    const blob = await blobRes.blob();
    formData.append(fieldName, blob, fileName);
  } else {
    formData.append(fieldName, {
      uri,
      name: fileName,
      type: mimeType,
    } as any);
  }
}

export async function submitPublishJob(params: {
  workspaceId?: string;
  video: VideoAssetMeta | null;
  photos?: PhotoAssetMeta[];
  master: MasterDraft;
  overrides: Record<PlatformId, PlatformOverride>;
  lifecycle?: JobLifecycle;
  scheduledAt?: string;
  replaceJobId?: string;
  isEvergreen?: boolean;
}): Promise<PublishJob> {
  const {
    workspaceId = DEFAULT_WORKSPACE_ID,
    video,
    photos = [],
    master,
    overrides,
    lifecycle = 'active',
    scheduledAt,
    replaceJobId,
    isEvergreen,
  } = params;

  try {
    const hasRealVideoUri = Boolean(
      video?.uri && !video.isSamplePreset && !video.uri.startsWith('http')
    );
    const hasRealPhotoUris = photos.some((p) =>
      Boolean(p.uri && !p.isSamplePreset && !p.uri.startsWith('http'))
    );

    if (hasRealVideoUri || hasRealPhotoUris) {
      const formData = new FormData();
      formData.append(
        'payload',
        JSON.stringify({
          workspaceId,
          videoMeta: video,
          photosMeta: photos,
          master,
          overrides,
          lifecycle,
          scheduledAt,
          replaceJobId,
          isEvergreen,
        })
      );
      if (hasRealVideoUri && video?.uri) {
        await appendUriToFormData(
          formData,
          'video',
          video.uri,
          video.fileName || 'upload.mp4',
          video.mimeType || 'video/mp4'
        );
      }
      if (hasRealPhotoUris) {
        for (const p of photos) {
          if (p.uri && !p.isSamplePreset) {
            await appendUriToFormData(
              formData,
              'photos',
              p.uri,
              p.fileName || 'photo.jpg',
              p.mimeType || 'image/jpeg'
            );
          }
        }
      }
      if (video?.thumbnailUri && !video.thumbnailUri.startsWith('http')) {
        await appendUriToFormData(
          formData,
          'thumbnail',
          video.thumbnailUri,
          'cover.jpg',
          'image/jpeg'
        );
      }

      const res = await fetch(`${SERVER_BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const json = await res.json();
      if (res.status === 402) {
        throw new PlanLimitError(
          json.error || 'Monthly post limit reached.',
          json.requiredTier || 'creator'
        );
      }
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save post');
      }
      return json.job;
    } else {
      const res = await fetch(`${SERVER_BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          workspaceId,
          videoMeta: video,
          photosMeta: photos,
          master,
          overrides,
          lifecycle,
          scheduledAt,
          replaceJobId,
          isEvergreen,
        }),
      });
      const json = await res.json();
      if (res.status === 402) {
        throw new PlanLimitError(
          json.error || 'Monthly post limit reached.',
          json.requiredTier || 'creator'
        );
      }
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save post');
      }
      return json.job;
    }
  } catch (err: any) {
    if (!isNetworkFailure(err)) {
      throw err;
    }

    const enabled = PLATFORM_ORDER.filter((id) => overrides[id]?.enabled);
    const now = new Date().toISOString();
    const jobId = replaceJobId || `local_job_${Date.now()}`;
    const results: PublishJob['results'] = {};
    for (const id of enabled) {
      results[id] = {
        platformId: id,
        status: lifecycle === 'active' ? 'uploading' : 'queued',
        progressPct: lifecycle === 'active' ? 35 : 0,
        statusMessage:
          lifecycle === 'draft'
            ? 'Saved in draft'
            : lifecycle === 'scheduled'
            ? 'Scheduled'
            : `Uploading to ${PLATFORM_SPECS[id].shortName}...`,
        mode: 'sandbox',
        updatedAt: now,
      };
    }

    const localJob: PublishJob = {
      id: jobId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
      lifecycle,
      scheduledAt: lifecycle === 'scheduled' ? scheduledAt : undefined,
      postKind: detectPostKind(video, photos),
      video,
      photos: photos.length > 0 ? photos : undefined,
      master,
      overrides,
      results,
    };

    fallbackJobs = [
      localJob,
      ...fallbackJobs.filter((j) => j.id !== jobId),
    ];

    if (lifecycle === 'active') {
      enabled.forEach((id, idx) => {
        setTimeout(() => {
          const acc = fallbackAccounts.find(
            (a) =>
              (a.workspaceId ?? DEFAULT_WORKSPACE_ID) === workspaceId &&
              a.platformGroup === PLATFORM_SPECS[id].accountGroup
          );
          const failed = Boolean(acc?.simulateFailure);
          const hasFc = Boolean(
            master.firstComment?.trim() && PLATFORM_SPECS[id].supportsFirstComment
          );
          localJob.results[id] = {
            platformId: id,
            status: failed ? 'failed' : 'published',
            progressPct: failed ? 70 : 100,
            statusMessage: failed
              ? `Failed on ${PLATFORM_SPECS[id].shortName}`
              : hasFc
              ? `Published to ${PLATFORM_SPECS[id].shortName} (+ 1st comment)`
              : `Published to ${PLATFORM_SPECS[id].shortName}`,
            mode: 'sandbox',
            firstCommentPosted: !failed && hasFc,
            externalUrl: failed
              ? undefined
              : `https://omnipost.sandbox/${id}/${Date.now()}`,
            error: failed ? 'Simulated sandbox API error.' : undefined,
            updatedAt: new Date().toISOString(),
          };
        }, 900 + idx * 450);
      });
    }

    return localJob;
  }
}

export async function fetchJobs(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<PublishJob[]> {
  try {
    const res = await fetch(
      `${SERVER_BASE_URL}/api/jobs?workspaceId=${encodeURIComponent(
        workspaceId
      )}`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error('Relay unavailable');
    const json = await res.json();
    return json.jobs;
  } catch {
    return fallbackJobs.filter(
      (j) => (j.workspaceId ?? DEFAULT_WORKSPACE_ID) === workspaceId
    );
  }
}

export async function publishJobNowApi(jobId: string): Promise<PublishJob | null> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/jobs/${jobId}/publish-now`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Relay unavailable');
    const json = await res.json();
    return json.job;
  } catch {
    const job = fallbackJobs.find((j) => j.id === jobId);
    if (!job) return null;
    job.lifecycle = 'active';
    job.scheduledAt = undefined;
    (Object.keys(job.results) as PlatformId[]).forEach((id) => {
      job.results[id] = {
        platformId: id,
        status: 'published',
        progressPct: 100,
        statusMessage: `Published to ${PLATFORM_SPECS[id].shortName}`,
        mode: 'sandbox',
        externalUrl: `https://omnipost.sandbox/${id}/${Date.now()}`,
        updatedAt: new Date().toISOString(),
      };
    });
    return { ...job };
  }
}

export async function patchJobScheduleApi(
  jobId: string,
  patch: { lifecycle?: JobLifecycle; scheduledAt?: string | null }
): Promise<PublishJob | null> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Relay unavailable');
    const json = await res.json();
    return json.job;
  } catch {
    const job = fallbackJobs.find((j) => j.id === jobId);
    if (!job) return null;
    if (patch.lifecycle) job.lifecycle = patch.lifecycle;
    if (patch.scheduledAt !== undefined) {
      job.scheduledAt = patch.scheduledAt ?? undefined;
    }
    return { ...job };
  }
}

export async function deleteJobApi(jobId: string): Promise<void> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/jobs/${jobId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Relay unavailable');
  } catch {
    fallbackJobs = fallbackJobs.filter((j) => j.id !== jobId);
  }
}

export async function retryJobPlatform(
  jobId: string,
  platformId?: PlatformId
): Promise<PublishJob | null> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/jobs/${jobId}/retry`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ platformId }),
    });
    if (!res.ok) throw new Error('Relay unavailable');
    const json = await res.json();
    return json.job;
  } catch {
    const job = fallbackJobs.find((j) => j.id === jobId);
    if (!job) return null;
    const targets = platformId
      ? [platformId]
      : (Object.keys(job.results) as PlatformId[]).filter(
          (k) => job.results[k]?.status === 'failed'
        );
    targets.forEach((id) => {
      job.results[id] = {
        platformId: id,
        status: 'published',
        progressPct: 100,
        statusMessage: `Published to ${PLATFORM_SPECS[id].shortName}`,
        mode: 'sandbox',
        externalUrl: `https://omnipost.sandbox/${id}/${Date.now()}`,
        updatedAt: new Date().toISOString(),
      };
    });
    return { ...job };
  }
}

export async function fetchPresetsApi(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<ContentPreset[]> {
  try {
    const res = await fetch(
      `${SERVER_BASE_URL}/api/presets?workspaceId=${encodeURIComponent(
        workspaceId
      )}`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error('Relay unavailable');
    const json = await res.json();
    return json.presets;
  } catch {
    return fallbackPresets.filter(
      (p) => (p.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId
    );
  }
}

export async function createPresetApi(params: {
  workspaceId?: string;
  name: string;
  captionSnippet?: string;
  hashtags?: string;
  firstComment?: string;
}): Promise<ContentPreset> {
  const workspaceId = params.workspaceId || DEFAULT_WORKSPACE_ID;
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/presets`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...params, workspaceId }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to save preset');
    }
    return json.preset;
  } catch (err: any) {
    if (!isNetworkFailure(err)) throw err;
    const created: ContentPreset = {
      id: `preset_local_${Date.now()}`,
      workspaceId,
      name: params.name.trim() || 'Saved preset',
      captionSnippet: params.captionSnippet?.trim() || undefined,
      hashtags: params.hashtags?.trim() || undefined,
      firstComment: params.firstComment?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    fallbackPresets = [created, ...fallbackPresets];
    return created;
  }
}

export async function deletePresetApi(id: string): Promise<void> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/presets/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Relay unavailable');
  } catch {
    fallbackPresets = fallbackPresets.filter((p) => p.id !== id);
  }
}

export async function fetchAnalyticsApi(
  workspaceId: string = DEFAULT_WORKSPACE_ID,
  range: AnalyticsTimeRange = '30d'
): Promise<WorkspaceAnalyticsSummary> {
  try {
    const res = await fetch(
      `${SERVER_BASE_URL}/api/analytics?workspaceId=${encodeURIComponent(
        workspaceId
      )}&range=${encodeURIComponent(range)}`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error('Relay unavailable');
    const json = await res.json();
    return json.analytics;
  } catch {
    const wsJobs = fallbackJobs.filter(
      (j) => (j.workspaceId ?? DEFAULT_WORKSPACE_ID) === workspaceId
    );
    return computeWorkspaceAnalytics(workspaceId, wsJobs, range);
  }
}

export async function syncAnalyticsApi(
  workspaceId: string = DEFAULT_WORKSPACE_ID,
  range: AnalyticsTimeRange = '30d'
): Promise<{ analytics: WorkspaceAnalyticsSummary; jobs?: PublishJob[] }> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/analytics/sync`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ workspaceId, range }),
    });
    if (!res.ok) throw new Error('Relay unavailable');
    return await res.json();
  } catch {
    const wsJobs = fallbackJobs.filter(
      (j) => (j.workspaceId ?? DEFAULT_WORKSPACE_ID) === workspaceId
    );
    return {
      analytics: computeWorkspaceAnalytics(workspaceId, wsJobs, range),
      jobs: wsJobs,
    };
  }
}

// --- CLIENT REVIEW & APPROVAL LINKS ---
export async function createJobReviewLinkApi(
  jobId: string
): Promise<{ job: PublishJob; shareToken: string }> {
  const res = await fetch(`${SERVER_BASE_URL}/api/jobs/${jobId}/share-review`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });
  const json = await res.json();
  if (res.status === 402) {
    throw new PlanLimitError(
      json.error || 'Client approval links require Studio ($29/mo).',
      json.requiredTier || 'studio'
    );
  }
  if (!res.ok) {
    throw new Error(json.error || 'Could not generate review link.');
  }
  return json;
}

export async function fetchPublicReviewApi(
  shareToken: string
): Promise<PublicReviewPayload> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/review/${encodeURIComponent(shareToken)}`
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Review link not found.');
  }
  return json.review;
}

export interface BatchScheduleItemInput {
  title?: string;
  caption: string;
  hashtags?: string;
  firstComment?: string;
  scheduledAt?: string;
  lifecycle?: JobLifecycle;
  videoMeta?: VideoAssetMeta | null;
  photosMeta?: PhotoAssetMeta[];
  webFile?: File;
}

export async function createBatchJobsApi(params: {
  workspaceId: string;
  lifecycle?: JobLifecycle;
  holdForApproval?: boolean;
  platforms?: PlatformId[];
  items: BatchScheduleItemInput[];
}): Promise<PublishJob[]> {
  const hasWebFiles = params.items.some((it) => Boolean(it.webFile));

  let res: Response;
  if (hasWebFiles) {
    const form = new FormData();
    const mappedItems = params.items.map((it) => {
      let fileIndex: number | undefined;
      if (it.webFile) {
        const nextIndex = form.getAll('mediaFiles').length;
        form.append('mediaFiles', it.webFile, it.webFile.name);
        fileIndex = nextIndex;
      }
      const { webFile: _wf, ...rest } = it;
      return { ...rest, fileIndex };
    });

    form.append(
      'payload',
      JSON.stringify({
        workspaceId: params.workspaceId,
        lifecycle: params.lifecycle ?? 'scheduled',
        holdForApproval: params.holdForApproval,
        platforms: params.platforms,
        items: mappedItems,
      })
    );
    res = await fetch(`${SERVER_BASE_URL}/api/jobs/batch`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
  } else {
    res = await fetch(`${SERVER_BASE_URL}/api/jobs/batch`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        workspaceId: params.workspaceId,
        lifecycle: params.lifecycle ?? 'scheduled',
        holdForApproval: params.holdForApproval,
        platforms: params.platforms,
        items: params.items,
      }),
    });
  }

  const json = await res.json();
  if (res.status === 402) {
    throw new PlanLimitError(
      json.error || 'Monthly post limit reached on Starter.',
      json.requiredTier || 'creator'
    );
  }
  if (!res.ok) {
    throw new Error(json.error || 'Could not schedule batch.');
  }
  return json.jobs || [];
}

export async function submitTeamDecisionApi(
  jobId: string,
  params: {
    decision: 'approved' | 'changes_requested';
    comment?: string;
    reviewerName?: string;
  }
): Promise<PublishJob> {
  const res = await fetch(`${SERVER_BASE_URL}/api/jobs/${jobId}/team-decision`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not submit approval decision.');
  }
  return json.job;
}

export async function submitPublicReviewDecisionApi(
  shareToken: string,
  params: {
    reviewerName: string;
    decision: 'approved' | 'changes_requested';
    comment?: string;
  }
): Promise<PublicReviewPayload> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/review/${encodeURIComponent(shareToken)}/decision`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not submit review decision.');
  }
  return json.review;
}

// --- TRACK 1: LINK-IN-BIO (/u/:slug) ---
export async function fetchWorkspaceBioConfigApi(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<BioPageConfig> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/bio`,
    { headers: authHeaders() }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not load Link-in-Bio settings.');
  }
  return json.config;
}

export async function updateWorkspaceBioConfigApi(
  workspaceId: string,
  patch: {
    slug?: string;
    headline?: string;
    bio?: string;
    theme?: 'paper' | 'graphite';
    customLinks?: Array<{
      id?: string;
      label: string;
      url: string;
      clicks?: number;
    }>;
    postLinkUrls?: Record<string, string>;
  }
): Promise<BioPageConfig> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/bio`,
    {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not save Link-in-Bio page.');
  }
  return json.config;
}

export async function fetchPublicBioPageApi(
  slug: string,
  trackView = true
): Promise<PublicBioPagePayload> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/bio/${encodeURIComponent(slug)}${
      trackView ? '?trackView=1' : ''
    }`
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Bio page not found.');
  }
  return json.bio;
}

export async function recordBioClickApi(
  slug: string,
  targetType: 'link' | 'post',
  targetId: string
): Promise<{ url: string | null; totalClicks: number }> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/bio/${encodeURIComponent(slug)}/click`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType, targetId }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not record click.');
  }
  return json;
}

// --- TRACK 2: UNIFIED COMMENTS INBOX ---
export async function fetchInboxApi(
  workspaceId: string = DEFAULT_WORKSPACE_ID,
  filter: InboxFilterStatus = 'all'
): Promise<{ comments: SocialCommentItem[]; unansweredCount: number }> {
  try {
    const res = await fetch(
      `${SERVER_BASE_URL}/api/inbox?workspaceId=${encodeURIComponent(
        workspaceId
      )}&filter=${encodeURIComponent(filter)}`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error('Relay unavailable');
    return await res.json();
  } catch {
    return { comments: [], unansweredCount: 0 };
  }
}

export async function syncInboxApi(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<{ comments: SocialCommentItem[]; unansweredCount: number }> {
  const res = await fetch(`${SERVER_BASE_URL}/api/inbox/sync`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ workspaceId }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not sync comments.');
  }
  return json;
}

export async function replyInboxCommentApi(
  commentId: string,
  body: string
): Promise<SocialCommentItem> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/inbox/${encodeURIComponent(commentId)}/reply`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ body }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not send reply.');
  }
  return json.comment;
}

export async function updateInboxCommentStatusApi(
  commentId: string,
  status: 'unanswered' | 'replied' | 'archived'
): Promise<SocialCommentItem> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/inbox/${encodeURIComponent(commentId)}`,
    {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not update comment status.');
  }
  return json.comment;
}

// --- TRACK 3: URL / RSS IMPORTER & EVERGREEN RECYCLING ---
export async function importUrlPreviewApi(
  url: string
): Promise<ImportedUrlPreview> {
  const res = await fetch(`${SERVER_BASE_URL}/api/import/url`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ url }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not extract URL preview.');
  }
  return json.preview;
}

export async function importRssFeedApi(
  feedUrl: string
): Promise<ImportedRssFeed> {
  const res = await fetch(`${SERVER_BASE_URL}/api/import/rss`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ feedUrl }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not read RSS feed.');
  }
  return json.feed;
}

export async function toggleJobEvergreenApi(
  jobId: string,
  isEvergreen: boolean,
  intervalDays = 14
): Promise<PublishJob> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/evergreen`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ isEvergreen, intervalDays }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not update evergreen status.');
  }
  return json.job;
}

export async function fillEvergreenSlotsApi(
  workspaceId: string,
  daysAhead = 7
): Promise<{ created: PublishJob[]; count: number }> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(
      workspaceId
    )}/fill-evergreen`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ daysAhead }),
    }
  );
  const json = await res.json();
  if (res.status === 402) {
    throw new PlanLimitError(
      json.error || 'Evergreen calendar auto-fill requires Creator ($12/mo).',
      json.requiredTier || 'creator'
    );
  }
  if (!res.ok) {
    throw new Error(json.error || 'Could not fill evergreen slots.');
  }
  return json;
}

// --- TRACK 4: PRODUCTION LAUNCH READINESS ---
export async function fetchLaunchReadinessApi(): Promise<LaunchReadinessReport> {
  const res = await fetch(`${SERVER_BASE_URL}/api/launch-readiness`, {
    headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not fetch launch readiness.');
  }
  return json.readiness;
}

// --- PASSWORD RESET, FOUNDER ADMIN, PROMO CODES, API KEYS & MEDIA VAULT ---
export async function requestPasswordResetApi(
  email: string
): Promise<{ message: string; devResetCode?: string }> {
  const res = await fetch(`${SERVER_BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not request reset code.');
  }
  return json;
}

export async function confirmPasswordResetApi(params: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<{
  user: AuthUser;
  token: string;
  workspaces: BrandWorkspace[];
  usage: PlanUsageSummary;
}> {
  const res = await fetch(`${SERVER_BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not reset password.');
  }
  setStoredAuthToken(json.token);
  setStoredSignedOut(false);
  return json;
}

export async function redeemPromoCodeApi(
  code: string,
  workspaceId?: string
): Promise<{
  user: AuthUser;
  usage: PlanUsageSummary;
  promo: PromoCodeRecord;
}> {
  const res = await fetch(`${SERVER_BASE_URL}/api/billing/redeem-promo`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ code, workspaceId }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Invalid promo code.');
  }
  return json;
}

export async function fetchAdminOverviewApi(): Promise<AdminOverviewSummary> {
  const res = await fetch(`${SERVER_BASE_URL}/api/admin/overview`, {
    headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Founder admin access required.');
  }
  return json.overview;
}

export async function compUserPlanAdminApi(
  userId: string,
  planTier: PlanTierId,
  billingInterval: BillingInterval = 'monthly'
): Promise<AdminOverviewSummary> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/admin/users/${encodeURIComponent(userId)}/plan`,
    {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ planTier, billingInterval }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not update user plan.');
  }
  return json.overview;
}

export async function createPromoCodeAdminApi(params: {
  code: string;
  grantTier: 'creator' | 'studio';
  billingInterval?: BillingInterval;
  maxUses?: number;
  note?: string;
}): Promise<PromoCodeRecord[]> {
  const res = await fetch(`${SERVER_BASE_URL}/api/admin/promo-codes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not create promo code.');
  }
  return json.promoCodes;
}

export async function deletePromoCodeAdminApi(
  code: string
): Promise<PromoCodeRecord[]> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/admin/promo-codes/${encodeURIComponent(code)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not delete promo code.');
  }
  return json.promoCodes;
}

export async function fetchWorkspaceApiKeysApi(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<WorkspaceApiKey[]> {
  try {
    const res = await fetch(
      `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(
        workspaceId
      )}/api-keys`,
      { headers: authHeaders() }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.apiKeys || [];
  } catch {
    return [];
  }
}

export async function createWorkspaceApiKeyApi(
  workspaceId: string,
  label: string
): Promise<{
  apiKey: WorkspaceApiKey;
  secretKey: string;
  apiKeys: WorkspaceApiKey[];
}> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(
      workspaceId
    )}/api-keys`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ label }),
    }
  );
  const json = await res.json();
  if (res.status === 402) {
    throw new PlanLimitError(
      json.error || 'Studio plan ($29/mo) required for REST API keys.',
      json.requiredTier || 'studio'
    );
  }
  if (!res.ok) {
    throw new Error(json.error || 'Could not create API key.');
  }
  return json;
}

export async function revokeWorkspaceApiKeyApi(
  workspaceId: string,
  keyId: string
): Promise<WorkspaceApiKey[]> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(
      workspaceId
    )}/api-keys/${encodeURIComponent(keyId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not revoke API key.');
  }
  return json.apiKeys || [];
}

export async function fetchMediaVaultApi(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<MediaVaultAsset[]> {
  try {
    const res = await fetch(
      `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(
        workspaceId
      )}/vault`,
      { headers: authHeaders() }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.assets || [];
  } catch {
    return [];
  }
}

export async function saveMediaVaultAssetApi(
  workspaceId: string,
  params: {
    kind: 'photo' | 'video';
    label: string;
    fileName: string;
    mimeType: string;
    width?: number;
    height?: number;
    durationSec?: number;
    sampleTint?: string;
  }
): Promise<MediaVaultAsset[]> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(
      workspaceId
    )}/vault`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not save asset to vault.');
  }
  return json.assets || [];
}

export async function deleteMediaVaultAssetApi(
  workspaceId: string,
  assetId: string
): Promise<MediaVaultAsset[]> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/workspaces/${encodeURIComponent(
      workspaceId
    )}/vault/${encodeURIComponent(assetId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Could not delete vault asset.');
  }
  return json.assets || [];
}

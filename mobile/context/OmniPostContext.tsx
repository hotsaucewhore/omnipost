import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Linking, Platform } from 'react-native';
import {
  ACCOUNT_GROUPS,
  AccountGroupId,
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
  InboxFilterStatus,
  JobLifecycle,
  MediaVaultAsset,
  PlanTierId,
  PlanUsageSummary,
  PlatformId,
  PromoCodeRecord,
  PublishJob,
  SocialCommentItem,
  WORKSPACE_COLORS,
  WorkspaceAnalyticsSummary,
  WorkspaceApiKey,
  WorkspaceMember,
  WorkspaceRole,
} from '../../shared/platforms';
import { DARK_PALETTE, LIGHT_PALETTE, ThemePalette } from '../constants/theme';
import {
  BatchScheduleItemInput,
  checkoutPlanApi,
  confirmPasswordResetApi,
  connectLiveBlueskyApi,
  connectSandboxAccount,
  createBatchJobsApi,
  createJobReviewLinkApi,
  createPresetApi,
  createWorkspaceApi,
  createWorkspaceApiKeyApi,
  deleteJobApi,
  deleteMediaVaultAssetApi,
  deletePresetApi,
  deleteWorkspaceApi,
  disconnectAccount,
  fetchAccountsAndStatus,
  fetchAnalyticsApi,
  fetchInboxApi,
  fetchJobs,
  fetchMeAndUsageApi,
  fetchMediaVaultApi,
  fetchPresetsApi,
  fetchWorkspaceApiKeysApi,
  fetchWorkspaceBioConfigApi,
  fetchWorkspaceMembersApi,
  fetchWorkspacesApi,
  fillEvergreenSlotsApi,
  getStoredSignedOut,
  inviteWorkspaceMemberApi,
  loginAuthApi,
  loginDemoFounderApi,
  logoutAuthApi,
  patchAccount,
  patchJobScheduleApi,
  patchWorkspaceSettingsApi,
  PlanLimitError,
  publishJobNowApi,
  redeemPromoCodeApi,
  registerAuthApi,
  removeWorkspaceMemberApi,
  replyInboxCommentApi,
  retryJobPlatform,
  revokeWorkspaceApiKeyApi,
  saveMediaVaultAssetApi,
  setActiveRolePreviewHeader,
  submitTeamDecisionApi,
  syncAnalyticsApi,
  syncInboxApi,
  toggleJobEvergreenApi,
  updateInboxCommentStatusApi,
  updateWorkspaceBioConfigApi,
  updateWorkspaceMemberRoleApi,
} from '../lib/api';

export type PostsTabFilter = 'calendar' | 'upcoming' | 'drafts' | 'published';

const DEFAULT_USER: AuthUser = {
  id: DEFAULT_USER_ID,
  email: 'founder@omnipost.app',
  name: 'Studio Founder',
  planTier: 'studio',
  billingInterval: 'monthly',
  createdAt: new Date().toISOString(),
};

const DEFAULT_USAGE: PlanUsageSummary = {
  planTier: 'studio',
  billingInterval: 'monthly',
  workspacesUsed: 2,
  maxWorkspaces: null,
  accountsInActiveWorkspace: ACCOUNT_GROUPS.length,
  maxAccountsPerWorkspace: null,
  postsThisMonth: 0,
  maxPostsPerMonth: null,
  fullAnalyticsHistory: true,
  allowsClientApprovals: true,
  stripeLiveConfigured: false,
};

const DEFAULT_WS: BrandWorkspace = {
  id: DEFAULT_WORKSPACE_ID,
  ownerUserId: DEFAULT_USER_ID,
  name: 'Creator Studio',
  accentColor: WORKSPACE_COLORS[0],
  createdAt: new Date().toISOString(),
};

const INITIAL_OPTIMISTIC_ACCOUNTS: ConnectedAccount[] = ACCOUNT_GROUPS.map(
  (g) => ({
    id: `acc_sandbox_${DEFAULT_WORKSPACE_ID}_${g.id}`,
    workspaceId: DEFAULT_WORKSPACE_ID,
    platformGroup: g.id,
    mode: 'sandbox',
    handle: g.defaultSandboxHandle,
    displayName: g.defaultSandboxName,
    connectedAt: new Date().toISOString(),
    simulateFailure: false,
  })
);

interface OmniPostContextValue {
  palette: ThemePalette;
  toggleTheme: () => void;
  // Auth & SaaS Billing
  user: AuthUser;
  usage: PlanUsageSummary;
  isSignedOut: boolean;
  requestedAuthMode: 'landing' | 'login' | 'register';
  setRequestedAuthMode: (mode: 'landing' | 'login' | 'register') => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginDemoFounder: () => Promise<void>;
  logout: () => Promise<void>;
  billingModalOpen: boolean;
  billingHighlightTier: PlanTierId;
  billingReason: string | null;
  openBillingModal: (tier?: PlanTierId, reason?: string) => void;
  closeBillingModal: () => void;
  selectPlan: (
    planTier: PlanTierId,
    billingInterval: BillingInterval
  ) => Promise<void>;
  // Workspaces & Channels
  workspaces: BrandWorkspace[];
  workspaceAccountCounts: Record<string, number>;
  activeWorkspace: BrandWorkspace;
  selectWorkspace: (id: string) => void;
  createWorkspace: (
    name: string,
    accentColor?: string,
    seedDemoAccounts?: boolean
  ) => Promise<BrandWorkspace | null>;
  removeWorkspace: (id: string) => Promise<void>;
  accounts: ConnectedAccount[];
  liveConfigured: Record<AccountGroupId, boolean>;
  relayOnline: boolean;
  presets: ContentPreset[];
  createPreset: (params: {
    name: string;
    captionSnippet?: string;
    hashtags?: string;
    firstComment?: string;
  }) => Promise<ContentPreset>;
  removePreset: (id: string) => Promise<void>;
  analytics: WorkspaceAnalyticsSummary;
  analyticsRange: AnalyticsTimeRange;
  setAnalyticsRange: (range: AnalyticsTimeRange) => void;
  syncingAnalytics: boolean;
  syncAnalytics: () => Promise<void>;
  jobs: PublishJob[];
  activeJobsCount: number;
  scheduledCount: number;
  draftsCount: number;
  editingJob: PublishJob | null;
  setEditingJob: (job: PublishJob | null) => void;
  prefillScheduleIso: string | null;
  setPrefillScheduleIso: (iso: string | null) => void;
  preferredPostsFilter: PostsTabFilter;
  setPreferredPostsFilter: (tab: PostsTabFilter) => void;
  refreshAll: () => Promise<void>;
  connectSandbox: (
    group: AccountGroupId,
    handle?: string,
    displayName?: string
  ) => Promise<void>;
  connectLiveBluesky: (identifier: string, appPassword: string) => Promise<void>;
  toggleSimulateFailure: (accountId: string, nextValue: boolean) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  recordCreatedJob: (job: PublishJob) => void;
  publishScheduledNow: (jobId: string) => Promise<void>;
  rescheduleJob: (
    jobId: string,
    scheduledAt: string | null,
    lifecycle?: JobLifecycle
  ) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  retryPlatform: (jobId: string, platformId?: PlatformId) => Promise<void>;
  shareJobForApproval: (jobId: string) => Promise<string | null>;
  members: WorkspaceMember[];
  rolePreview: WorkspaceRole | null;
  effectiveRole: WorkspaceRole;
  setRolePreview: (role: WorkspaceRole | null) => void;
  teamModalOpen: boolean;
  openTeamModal: () => void;
  closeTeamModal: () => void;
  batchModalOpen: boolean;
  openBatchModal: () => void;
  closeBatchModal: () => void;
  toggleWorkspaceRequireApproval: (nextValue: boolean) => Promise<void>;
  inviteMember: (params: {
    email: string;
    name?: string;
    role: Exclude<WorkspaceRole, 'owner'>;
  }) => Promise<WorkspaceMember | null>;
  updateMemberRole: (
    memberId: string,
    role: Exclude<WorkspaceRole, 'owner'>
  ) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  submitTeamApproval: (
    jobId: string,
    decision: 'approved' | 'changes_requested',
    comment?: string
  ) => Promise<void>;
  createBatchJobs: (params: {
    lifecycle?: JobLifecycle;
    holdForApproval?: boolean;
    platforms?: PlatformId[];
    items: BatchScheduleItemInput[];
  }) => Promise<PublishJob[] | null>;
  bioConfig: BioPageConfig | null;
  bioModalOpen: boolean;
  openBioModal: () => void;
  closeBioModal: () => void;
  saveBioConfig: (
    patch: Parameters<typeof updateWorkspaceBioConfigApi>[1]
  ) => Promise<BioPageConfig>;
  inboxComments: SocialCommentItem[];
  unansweredInboxCount: number;
  inboxFilter: InboxFilterStatus;
  setInboxFilter: (f: InboxFilterStatus) => void;
  syncingInbox: boolean;
  syncInbox: () => Promise<void>;
  replyToComment: (commentId: string, body: string) => Promise<void>;
  setCommentStatus: (
    commentId: string,
    status: 'unanswered' | 'replied' | 'archived'
  ) => Promise<void>;
  toggleEvergreen: (
    jobId: string,
    isEvergreen: boolean,
    intervalDays?: number
  ) => Promise<void>;
  fillEvergreenSlots: (daysAhead?: number) => Promise<number>;
  launchModalOpen: boolean;
  openLaunchModal: () => void;
  closeLaunchModal: () => void;
  completePasswordReset: (params: {
    email: string;
    code: string;
    newPassword: string;
  }) => Promise<void>;
  redeemPromoCode: (code: string) => Promise<PromoCodeRecord>;
  apiKeys: WorkspaceApiKey[];
  createApiKey: (
    label: string
  ) => Promise<{ secretKey: string; record: WorkspaceApiKey } | null>;
  revokeApiKey: (keyId: string) => Promise<void>;
  vaultAssets: MediaVaultAsset[];
  vaultModalOpen: boolean;
  openVaultModal: () => void;
  closeVaultModal: () => void;
  saveToVault: (
    params: Parameters<typeof saveMediaVaultAssetApi>[1]
  ) => Promise<void>;
  removeVaultAsset: (assetId: string) => Promise<void>;
}

const OmniPostContext = createContext<OmniPostContextValue | null>(null);

export function OmniPostProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [user, setUser] = useState<AuthUser>(DEFAULT_USER);
  const [usage, setUsage] = useState<PlanUsageSummary>(DEFAULT_USAGE);
  const [isSignedOut, setIsSignedOut] = useState<boolean>(() =>
    getStoredSignedOut()
  );
  const [requestedAuthMode, setRequestedAuthMode] = useState<
    'landing' | 'login' | 'register'
  >('landing');

  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingHighlightTier, setBillingHighlightTier] =
    useState<PlanTierId>('creator');
  const [billingReason, setBillingReason] = useState<string | null>(null);

  const [workspaces, setWorkspaces] = useState<BrandWorkspace[]>([DEFAULT_WS]);
  const [workspaceAccountCounts, setWorkspaceAccountCounts] = useState<
    Record<string, number>
  >({});
  const [activeWorkspaceId, setActiveWorkspaceId] =
    useState<string>(DEFAULT_WORKSPACE_ID);

  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [liveConfigured, setLiveConfigured] = useState<
    Record<AccountGroupId, boolean>
  >({
    tiktok: false,
    instagram: false,
    youtube: false,
    facebook: false,
    x: false,
    threads: false,
    bluesky: false,
    linkedin: false,
  });
  const [relayOnline, setRelayOnline] = useState<boolean>(true);
  const [presets, setPresets] = useState<ContentPreset[]>([]);
  const [analyticsRange, setAnalyticsRangeState] =
    useState<AnalyticsTimeRange>('30d');
  const [analytics, setAnalytics] = useState<WorkspaceAnalyticsSummary>(() =>
    computeWorkspaceAnalytics(DEFAULT_WORKSPACE_ID, [], '30d')
  );
  const [syncingAnalytics, setSyncingAnalytics] = useState<boolean>(false);

  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [editingJob, setEditingJob] = useState<PublishJob | null>(null);
  const [prefillScheduleIso, setPrefillScheduleIso] = useState<string | null>(
    null
  );
  const [preferredPostsFilter, setPreferredPostsFilter] =
    useState<PostsTabFilter>('calendar');

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [rolePreview, setRolePreviewState] = useState<WorkspaceRole | null>(
    null
  );
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [bioConfig, setBioConfig] = useState<BioPageConfig | null>(null);
  const [bioModalOpen, setBioModalOpen] = useState(false);
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<WorkspaceApiKey[]>([]);
  const [vaultAssets, setVaultAssets] = useState<MediaVaultAsset[]>([]);

  const [inboxComments, setInboxComments] = useState<SocialCommentItem[]>([]);
  const [unansweredInboxCount, setUnansweredInboxCount] = useState<number>(0);
  const [inboxFilter, setInboxFilter] = useState<InboxFilterStatus>('unanswered');
  const [syncingInbox, setSyncingInbox] = useState(false);

  const palette = themeMode === 'light' ? LIGHT_PALETTE : DARK_PALETTE;

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ??
    workspaces[0] ??
    DEFAULT_WS;

  const effectiveRole: WorkspaceRole =
    rolePreview ?? activeWorkspace.currentUserRole ?? 'owner';

  const setRolePreview = useCallback((next: WorkspaceRole | null) => {
    setActiveRolePreviewHeader(next);
    setRolePreviewState(next);
  }, []);

  const openTeamModal = useCallback(() => setTeamModalOpen(true), []);
  const closeTeamModal = useCallback(() => setTeamModalOpen(false), []);
  const openBatchModal = useCallback(() => setBatchModalOpen(true), []);
  const closeBatchModal = useCallback(() => setBatchModalOpen(false), []);
  const openBioModal = useCallback(() => setBioModalOpen(true), []);
  const closeBioModal = useCallback(() => setBioModalOpen(false), []);
  const openLaunchModal = useCallback(() => setLaunchModalOpen(true), []);
  const closeLaunchModal = useCallback(() => setLaunchModalOpen(false), []);
  const openVaultModal = useCallback(() => setVaultModalOpen(true), []);
  const closeVaultModal = useCallback(() => setVaultModalOpen(false), []);

  const toggleTheme = useCallback(() => {
    setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const openBillingModal = useCallback(
    (tier: PlanTierId = 'creator', reason?: string) => {
      setBillingHighlightTier(tier);
      setBillingReason(reason ?? null);
      setBillingModalOpen(true);
    },
    []
  );

  const closeBillingModal = useCallback(() => {
    setBillingModalOpen(false);
    setBillingReason(null);
  }, []);

  const setAnalyticsRange = useCallback(
    (nextRange: AnalyticsTimeRange) => {
      if (nextRange !== '7d' && !usage.fullAnalyticsHistory) {
        openBillingModal(
          'creator',
          '30-day and all-time performance insights are included on Creator ($12/mo).'
        );
        return;
      }
      setAnalyticsRangeState(nextRange);
    },
    [usage.fullAnalyticsHistory, openBillingModal]
  );

  const refreshAll = useCallback(async () => {
    if (isSignedOut) return;

    const wsRes = await fetchWorkspacesApi();
    let effectiveWsId = activeWorkspaceId;
    if (wsRes.workspaces.length > 0) {
      setWorkspaces(wsRes.workspaces);
      setWorkspaceAccountCounts(wsRes.accountCounts);
      if (!wsRes.workspaces.some((w) => w.id === activeWorkspaceId)) {
        effectiveWsId = wsRes.workspaces[0].id;
        setActiveWorkspaceId(effectiveWsId);
      }
    }

    const effectiveRange: AnalyticsTimeRange =
      user.planTier === 'free' ? '7d' : analyticsRange;

    const [
      meRes,
      accStatus,
      latestJobs,
      latestPresets,
      latestAnalytics,
      latestMembers,
      latestInbox,
      latestBio,
      latestApiKeys,
      latestVault,
    ] = await Promise.all([
      fetchMeAndUsageApi(effectiveWsId),
      fetchAccountsAndStatus(effectiveWsId),
      fetchJobs(effectiveWsId),
      fetchPresetsApi(effectiveWsId),
      fetchAnalyticsApi(effectiveWsId, effectiveRange),
      fetchWorkspaceMembersApi(effectiveWsId),
      fetchInboxApi(effectiveWsId, inboxFilter),
      fetchWorkspaceBioConfigApi(effectiveWsId).catch(() => null),
      fetchWorkspaceApiKeysApi(effectiveWsId),
      fetchMediaVaultApi(effectiveWsId),
    ]);

    setUser(meRes.user);
    setUsage(meRes.usage);
    if (!meRes.usage.fullAnalyticsHistory && analyticsRange !== '7d') {
      setAnalyticsRangeState('7d');
    }
    setAccounts(accStatus.accounts);
    setLiveConfigured(accStatus.liveConfigured);
    setRelayOnline(accStatus.relayOnline);
    setJobs(latestJobs);
    setPresets(latestPresets);
    setAnalytics(latestAnalytics);
    setMembers(latestMembers);
    setInboxComments(latestInbox.comments);
    setUnansweredInboxCount(latestInbox.unansweredCount);
    if (latestBio) setBioConfig(latestBio);
    setApiKeys(latestApiKeys);
    setVaultAssets(latestVault);
  }, [activeWorkspaceId, analyticsRange, inboxFilter, isSignedOut, user.planTier]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const applyAuthenticatedSession = useCallback(
    async (res: {
      user: AuthUser;
      workspaces: BrandWorkspace[];
      usage: PlanUsageSummary;
    }) => {
      const firstWsId = res.workspaces[0]?.id ?? DEFAULT_WORKSPACE_ID;
      setUser(res.user);
      setUsage(res.usage);
      setWorkspaces(res.workspaces.length > 0 ? res.workspaces : [DEFAULT_WS]);
      setActiveWorkspaceId(firstWsId);
      setEditingJob(null);
      setAnalyticsRangeState(
        res.usage.fullAnalyticsHistory ? '30d' : '7d'
      );
      setIsSignedOut(false);
    },
    []
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await loginAuthApi({ email, password });
      await applyAuthenticatedSession(res);
    },
    [applyAuthenticatedSession]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await registerAuthApi({ name, email, password });
      await applyAuthenticatedSession(res);
    },
    [applyAuthenticatedSession]
  );

  const loginDemoFounder = useCallback(async () => {
    const res = await loginDemoFounderApi();
    await applyAuthenticatedSession(res);
  }, [applyAuthenticatedSession]);

  const logout = useCallback(async () => {
    await logoutAuthApi();
    setEditingJob(null);
    setRequestedAuthMode('landing');
    setIsSignedOut(true);
  }, []);

  const selectPlan = useCallback(
    async (planTier: PlanTierId, billingInterval: BillingInterval) => {
      const res = await checkoutPlanApi({
        planTier,
        billingInterval,
        workspaceId: activeWorkspaceId,
      });
      if (res.mode === 'stripe' && res.checkoutUrl) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.href = res.checkoutUrl;
        } else {
          await Linking.openURL(res.checkoutUrl);
        }
        return;
      }
      if (res.user) setUser(res.user);
      if (res.usage) {
        setUsage(res.usage);
        if (!res.usage.fullAnalyticsHistory) {
          setAnalyticsRangeState('7d');
        }
      }
      setBillingModalOpen(false);
      setBillingReason(null);
    },
    [activeWorkspaceId]
  );

  const selectWorkspace = useCallback((id: string) => {
    setEditingJob(null);
    setActiveWorkspaceId(id);
  }, []);

  const createWorkspace = useCallback(
    async (name: string, accentColor?: string, seedDemoAccounts = false) => {
      try {
        const created = await createWorkspaceApi(
          name,
          accentColor,
          seedDemoAccounts
        );
        setActiveWorkspaceId(created.id);
        await refreshAll();
        return created;
      } catch (err: any) {
        if (err instanceof PlanLimitError || err?.code === 'PLAN_LIMIT_REACHED') {
          openBillingModal(err.requiredTier ?? 'studio', err.message);
          return null;
        }
        throw err;
      }
    },
    [refreshAll, openBillingModal]
  );

  const removeWorkspace = useCallback(
    async (id: string) => {
      const ok = await deleteWorkspaceApi(id);
      if (!ok) return;
      const wsRes = await fetchWorkspacesApi();
      setWorkspaces(wsRes.workspaces);
      setWorkspaceAccountCounts(wsRes.accountCounts);
      if (activeWorkspaceId === id && wsRes.workspaces[0]) {
        setActiveWorkspaceId(wsRes.workspaces[0].id);
      }
      const meRes = await fetchMeAndUsageApi(wsRes.workspaces[0]?.id);
      setUsage(meRes.usage);
    },
    [activeWorkspaceId]
  );

  const createPreset = useCallback(
    async (params: {
      name: string;
      captionSnippet?: string;
      hashtags?: string;
      firstComment?: string;
    }) => {
      const created = await createPresetApi({
        ...params,
        workspaceId: activeWorkspaceId,
      });
      setPresets((prev) => [
        created,
        ...prev.filter((p) => p.id !== created.id),
      ]);
      return created;
    },
    [activeWorkspaceId]
  );

  const removePreset = useCallback(async (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    await deletePresetApi(id);
  }, []);

  const syncAnalytics = useCallback(async () => {
    setSyncingAnalytics(true);
    try {
      const effectiveRange: AnalyticsTimeRange = usage.fullAnalyticsHistory
        ? analyticsRange
        : '7d';
      const res = await syncAnalyticsApi(activeWorkspaceId, effectiveRange);
      setAnalytics(res.analytics);
      if (res.jobs) {
        setJobs(res.jobs);
      }
    } finally {
      setSyncingAnalytics(false);
    }
  }, [activeWorkspaceId, analyticsRange, usage.fullAnalyticsHistory]);

  const activeJobsCount = jobs.filter(
    (job) =>
      (job.lifecycle ?? 'active') === 'active' &&
      Object.values(job.results).some(
        (r) =>
          r &&
          (r.status === 'queued' ||
            r.status === 'uploading' ||
            r.status === 'processing')
      )
  ).length;

  const scheduledCount = jobs.filter((j) => j.lifecycle === 'scheduled').length;
  const draftsCount = jobs.filter((j) => j.lifecycle === 'draft').length;

  const prevActiveCountRef = useRef<number>(activeJobsCount);
  useEffect(() => {
    if (prevActiveCountRef.current > 0 && activeJobsCount === 0) {
      const effectiveRange: AnalyticsTimeRange = usage.fullAnalyticsHistory
        ? analyticsRange
        : '7d';
      void Promise.all([
        fetchAnalyticsApi(activeWorkspaceId, effectiveRange),
        fetchMeAndUsageApi(activeWorkspaceId),
      ]).then(([latestAnalytics, meRes]) => {
        setAnalytics(latestAnalytics);
        setUsage(meRes.usage);
      });
    }
    prevActiveCountRef.current = activeJobsCount;
  }, [
    activeJobsCount,
    activeWorkspaceId,
    analyticsRange,
    usage.fullAnalyticsHistory,
  ]);

  useEffect(() => {
    if (isSignedOut || (activeJobsCount === 0 && scheduledCount === 0)) return;
    const intervalMs = activeJobsCount > 0 ? 650 : 5000;
    const timer = setInterval(() => {
      void fetchJobs(activeWorkspaceId).then(setJobs);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [activeJobsCount, scheduledCount, activeWorkspaceId, isSignedOut]);

  const connectSandbox = useCallback(
    async (group: AccountGroupId, handle?: string, displayName?: string) => {
      try {
        await connectSandboxAccount(
          group,
          handle,
          displayName,
          activeWorkspaceId
        );
        await refreshAll();
      } catch (err: any) {
        if (err instanceof PlanLimitError || err?.code === 'PLAN_LIMIT_REACHED') {
          openBillingModal(err.requiredTier ?? 'creator', err.message);
          return;
        }
        throw err;
      }
    },
    [activeWorkspaceId, refreshAll, openBillingModal]
  );

  const connectLiveBluesky = useCallback(
    async (identifier: string, appPassword: string) => {
      try {
        await connectLiveBlueskyApi({
          identifier,
          appPassword,
          workspaceId: activeWorkspaceId,
        });
        await refreshAll();
      } catch (err: any) {
        if (err instanceof PlanLimitError || err?.code === 'PLAN_LIMIT_REACHED') {
          openBillingModal(err.requiredTier ?? 'creator', err.message);
          return;
        }
        throw err;
      }
    },
    [activeWorkspaceId, refreshAll, openBillingModal]
  );

  const toggleSimulateFailure = useCallback(
    async (accountId: string, nextValue: boolean) => {
      await patchAccount(accountId, { simulateFailure: nextValue });
      await refreshAll();
    },
    [refreshAll]
  );

  const removeAccount = useCallback(
    async (accountId: string) => {
      await disconnectAccount(accountId);
      await refreshAll();
    },
    [refreshAll]
  );

  const recordCreatedJob = useCallback(
    (job: PublishJob) => {
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
      void fetchMeAndUsageApi(activeWorkspaceId).then((meRes) =>
        setUsage(meRes.usage)
      );
    },
    [activeWorkspaceId]
  );

  const publishScheduledNow = useCallback(
    async (jobId: string) => {
      const updated = await publishJobNowApi(jobId);
      if (updated) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      }
      setPreferredPostsFilter('published');
      await refreshAll();
    },
    [refreshAll]
  );

  const deleteJob = useCallback(
    async (jobId: string) => {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      await deleteJobApi(jobId);
      const effectiveRange: AnalyticsTimeRange = usage.fullAnalyticsHistory
        ? analyticsRange
        : '7d';
      const [updatedAnalytics, meRes] = await Promise.all([
        fetchAnalyticsApi(activeWorkspaceId, effectiveRange),
        fetchMeAndUsageApi(activeWorkspaceId),
      ]);
      setAnalytics(updatedAnalytics);
      setUsage(meRes.usage);
    },
    [activeWorkspaceId, analyticsRange, usage.fullAnalyticsHistory]
  );

  const retryPlatform = useCallback(
    async (jobId: string, platformId?: PlatformId) => {
      const updated = await retryJobPlatform(jobId, platformId);
      if (updated) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      }
      await refreshAll();
    },
    [refreshAll]
  );

  const shareJobForApproval = useCallback(
    async (jobId: string): Promise<string | null> => {
      try {
        const res = await createJobReviewLinkApi(jobId);
        setJobs((prev) => prev.map((j) => (j.id === jobId ? res.job : j)));
        return res.shareToken;
      } catch (err: any) {
        if (err instanceof PlanLimitError || err?.code === 'PLAN_LIMIT_REACHED') {
          openBillingModal(err.requiredTier ?? 'studio', err.message);
          return null;
        }
        throw err;
      }
    },
    [openBillingModal]
  );

  const rescheduleJob = useCallback(
    async (
      jobId: string,
      scheduledAt: string | null,
      lifecycle: JobLifecycle = 'scheduled'
    ) => {
      const updated = await patchJobScheduleApi(jobId, {
        lifecycle,
        scheduledAt,
      });
      if (updated) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      }
    },
    []
  );

  const toggleWorkspaceRequireApproval = useCallback(
    async (nextValue: boolean) => {
      try {
        const updated = await patchWorkspaceSettingsApi(activeWorkspace.id, {
          requireApproval: nextValue,
        });
        if (updated) {
          setWorkspaces((prev) =>
            prev.map((w) => (w.id === updated.id ? updated : w))
          );
        }
      } catch (err: any) {
        if (err instanceof PlanLimitError || err?.code === 'PLAN_LIMIT_REACHED') {
          openBillingModal(err.requiredTier ?? 'studio', err.message);
          return;
        }
        throw err;
      }
    },
    [activeWorkspace.id, openBillingModal]
  );

  const inviteMember = useCallback(
    async (params: {
      email: string;
      name?: string;
      role: Exclude<WorkspaceRole, 'owner'>;
    }): Promise<WorkspaceMember | null> => {
      try {
        const res = await inviteWorkspaceMemberApi(activeWorkspace.id, params);
        setMembers(res.members);
        return res.member;
      } catch (err: any) {
        if (err instanceof PlanLimitError || err?.code === 'PLAN_LIMIT_REACHED') {
          openBillingModal(err.requiredTier ?? 'studio', err.message);
          return null;
        }
        throw err;
      }
    },
    [activeWorkspace.id, openBillingModal]
  );

  const updateMemberRole = useCallback(
    async (memberId: string, role: Exclude<WorkspaceRole, 'owner'>) => {
      const nextMembers = await updateWorkspaceMemberRoleApi(
        activeWorkspace.id,
        memberId,
        role
      );
      setMembers(nextMembers);
    },
    [activeWorkspace.id]
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      const nextMembers = await removeWorkspaceMemberApi(
        activeWorkspace.id,
        memberId
      );
      setMembers(nextMembers);
    },
    [activeWorkspace.id]
  );

  const submitTeamApproval = useCallback(
    async (
      jobId: string,
      decision: 'approved' | 'changes_requested',
      comment?: string
    ) => {
      const approverLabel =
        rolePreview === 'approver'
          ? members.find((m) => m.role === 'approver')?.name ||
            `${user.name} (Approver)`
          : user.name;
      const updated = await submitTeamDecisionApi(jobId, {
        decision,
        comment,
        reviewerName: approverLabel,
      });
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
    },
    [members, rolePreview, user.name]
  );

  const createBatchJobs = useCallback(
    async (params: {
      lifecycle?: JobLifecycle;
      holdForApproval?: boolean;
      platforms?: PlatformId[];
      items: BatchScheduleItemInput[];
    }): Promise<PublishJob[] | null> => {
      try {
        const created = await createBatchJobsApi({
          workspaceId: activeWorkspace.id,
          ...params,
        });
        if (created.length > 0) {
          setJobs((prev) => [...created, ...prev]);
          const meRes = await fetchMeAndUsageApi(activeWorkspace.id);
          setUsage(meRes.usage);
        }
        return created;
      } catch (err: any) {
        if (err instanceof PlanLimitError || err?.code === 'PLAN_LIMIT_REACHED') {
          openBillingModal(err.requiredTier ?? 'creator', err.message);
          return null;
        }
        throw err;
      }
    },
    [activeWorkspace.id, openBillingModal]
  );

  const saveBioConfig = useCallback(
    async (patch: Parameters<typeof updateWorkspaceBioConfigApi>[1]) => {
      const updated = await updateWorkspaceBioConfigApi(
        activeWorkspace.id,
        patch
      );
      setBioConfig(updated);
      return updated;
    },
    [activeWorkspace.id]
  );

  const syncInbox = useCallback(async () => {
    setSyncingInbox(true);
    try {
      await syncInboxApi(activeWorkspace.id);
      const refreshed = await fetchInboxApi(activeWorkspace.id, inboxFilter);
      setInboxComments(refreshed.comments);
      setUnansweredInboxCount(refreshed.unansweredCount);
    } finally {
      setSyncingInbox(false);
    }
  }, [activeWorkspace.id, inboxFilter]);

  const replyToComment = useCallback(
    async (commentId: string, body: string) => {
      await replyInboxCommentApi(commentId, body);
      const refreshed = await fetchInboxApi(activeWorkspace.id, inboxFilter);
      setInboxComments(refreshed.comments);
      setUnansweredInboxCount(refreshed.unansweredCount);
    },
    [activeWorkspace.id, inboxFilter]
  );

  const setCommentStatus = useCallback(
    async (
      commentId: string,
      status: 'unanswered' | 'replied' | 'archived'
    ) => {
      await updateInboxCommentStatusApi(commentId, status);
      const refreshed = await fetchInboxApi(activeWorkspace.id, inboxFilter);
      setInboxComments(refreshed.comments);
      setUnansweredInboxCount(refreshed.unansweredCount);
    },
    [activeWorkspace.id, inboxFilter]
  );

  const toggleEvergreen = useCallback(
    async (jobId: string, isEvergreen: boolean, intervalDays = 14) => {
      const updated = await toggleJobEvergreenApi(
        jobId,
        isEvergreen,
        intervalDays
      );
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
    },
    []
  );

  const fillEvergreenSlots = useCallback(
    async (daysAhead = 7): Promise<number> => {
      try {
        const res = await fillEvergreenSlotsApi(activeWorkspace.id, daysAhead);
        if (res.created.length > 0) {
          setJobs((prev) => [...res.created, ...prev]);
        }
        return res.count;
      } catch (err: any) {
        if (err instanceof PlanLimitError || err?.code === 'PLAN_LIMIT_REACHED') {
          openBillingModal(err.requiredTier ?? 'creator', err.message);
          return 0;
        }
        throw err;
      }
    },
    [activeWorkspace.id, openBillingModal]
  );

  const completePasswordReset = useCallback(
    async (params: { email: string; code: string; newPassword: string }) => {
      const res = await confirmPasswordResetApi(params);
      await applyAuthenticatedSession(res);
    },
    [applyAuthenticatedSession]
  );

  const redeemPromoCode = useCallback(
    async (code: string): Promise<PromoCodeRecord> => {
      const res = await redeemPromoCodeApi(code, activeWorkspace.id);
      setUser(res.user);
      setUsage(res.usage);
      return res.promo;
    },
    [activeWorkspace.id]
  );

  const createApiKey = useCallback(
    async (label: string) => {
      try {
        const res = await createWorkspaceApiKeyApi(activeWorkspace.id, label);
        setApiKeys(res.apiKeys);
        return { secretKey: res.secretKey, record: res.apiKey };
      } catch (err: any) {
        if (err instanceof PlanLimitError || err?.code === 'PLAN_LIMIT_REACHED') {
          openBillingModal(err.requiredTier ?? 'studio', err.message);
          return null;
        }
        throw err;
      }
    },
    [activeWorkspace.id, openBillingModal]
  );

  const revokeApiKey = useCallback(
    async (keyId: string) => {
      const next = await revokeWorkspaceApiKeyApi(activeWorkspace.id, keyId);
      setApiKeys(next);
    },
    [activeWorkspace.id]
  );

  const saveToVault = useCallback(
    async (params: Parameters<typeof saveMediaVaultAssetApi>[1]) => {
      const next = await saveMediaVaultAssetApi(activeWorkspace.id, params);
      setVaultAssets(next);
    },
    [activeWorkspace.id]
  );

  const removeVaultAsset = useCallback(
    async (assetId: string) => {
      const next = await deleteMediaVaultAssetApi(activeWorkspace.id, assetId);
      setVaultAssets(next);
    },
    [activeWorkspace.id]
  );

  return (
    <OmniPostContext.Provider
      value={{
        palette,
        toggleTheme,
        user,
        usage,
        isSignedOut,
        requestedAuthMode,
        setRequestedAuthMode,
        login,
        register,
        loginDemoFounder,
        logout,
        billingModalOpen,
        billingHighlightTier,
        billingReason,
        openBillingModal,
        closeBillingModal,
        selectPlan,
        workspaces,
        workspaceAccountCounts,
        activeWorkspace,
        selectWorkspace,
        createWorkspace,
        removeWorkspace,
        accounts,
        liveConfigured,
        relayOnline,
        presets,
        createPreset,
        removePreset,
        analytics,
        analyticsRange,
        setAnalyticsRange,
        syncingAnalytics,
        syncAnalytics,
        jobs,
        activeJobsCount,
        scheduledCount,
        draftsCount,
        editingJob,
        setEditingJob,
        prefillScheduleIso,
        setPrefillScheduleIso,
        preferredPostsFilter,
        setPreferredPostsFilter,
        refreshAll,
        connectSandbox,
        connectLiveBluesky,
        toggleSimulateFailure,
        removeAccount,
        recordCreatedJob,
        publishScheduledNow,
        rescheduleJob,
        deleteJob,
        retryPlatform,
        shareJobForApproval,
        members,
        rolePreview,
        effectiveRole,
        setRolePreview,
        teamModalOpen,
        openTeamModal,
        closeTeamModal,
        batchModalOpen,
        openBatchModal,
        closeBatchModal,
        toggleWorkspaceRequireApproval,
        inviteMember,
        updateMemberRole,
        removeMember,
        submitTeamApproval,
        createBatchJobs,
        bioConfig,
        bioModalOpen,
        openBioModal,
        closeBioModal,
        saveBioConfig,
        inboxComments,
        unansweredInboxCount,
        inboxFilter,
        setInboxFilter,
        syncingInbox,
        syncInbox,
        replyToComment,
        setCommentStatus,
        toggleEvergreen,
        fillEvergreenSlots,
        launchModalOpen,
        openLaunchModal,
        closeLaunchModal,
        completePasswordReset,
        redeemPromoCode,
        apiKeys,
        createApiKey,
        revokeApiKey,
        vaultAssets,
        vaultModalOpen,
        openVaultModal,
        closeVaultModal,
        saveToVault,
        removeVaultAsset,
      }}
    >
      {children}
    </OmniPostContext.Provider>
  );
}

export function useOmniPost() {
  const ctx = useContext(OmniPostContext);
  if (!ctx) {
    throw new Error('useOmniPost must be used inside OmniPostProvider');
  }
  return ctx;
}

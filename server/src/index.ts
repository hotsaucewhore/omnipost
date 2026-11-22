import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import {
  ACCOUNT_GROUPS,
  AccountGroupId,
  AnalyticsTimeRange,
  AuthUser,
  BillingInterval,
  computeWorkspaceAnalytics,
  createDefaultOverrides,
  DEFAULT_WORKSPACE_ID,
  detectPostKind,
  getEffectiveVideoForPlatform,
  JobLifecycle,
  MasterDraft,
  MAX_CAROUSEL_PHOTOS,
  PhotoAssetMeta,
  PlanTierId,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PlatformId,
  PlatformOverride,
  PostApprovalState,
  PublishJob,
  recommendPlatformsForPost,
  resolvePlatformText,
  VideoAssetMeta,
  WorkspaceRole,
} from '../../shared/platforms';
import { validateAllPlatforms } from '../../shared/validator';
import { ADAPTER_REGISTRY } from './adapters';
import { runSandboxPublish } from './adapters/sandbox';
import { generateInitialPostMetrics } from './analytics';
import {
  createStripeCheckoutSession,
  isStripeLiveConfigured,
  verifyStripeCheckoutSession,
  verifyStripeWebhookSignature,
} from './billing';
import {
  buildMetaDataDeletionReceipt,
  renderPrivacyHtml,
  renderTermsHtml,
} from './compliance';
import { fetchAndExtractRss, fetchAndExtractUrl } from './importer';
import { buildLaunchReadinessReport } from './launchCheck';
import { isResendConfigured, sendTransactionalEmail } from './mailer';
import { pickVariantForPlatform, prepareMediaVariants } from './mediaProcessor';
import { store } from './store';

dotenv.config();

const UPLOAD_DIR = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.mp4';
      cb(null, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // Up to 2 GB video relay
  },
});

const pendingOAuthStates = new Map<
  string,
  {
    group: AccountGroupId;
    workspaceId: string;
    codeVerifier?: string;
    redirectUri: string;
  }
>();

async function executePlatformPublish(jobId: string, platformId: PlatformId) {
  const job = store.getJob(jobId);
  if (!job) return;

  const wsId = job.workspaceId || DEFAULT_WORKSPACE_ID;
  const spec = PLATFORM_SPECS[platformId];
  const account = await store.ensureFreshAccountByGroup(spec.accountGroup, wsId);
  if (!account) {
    store.updateJobResult(jobId, platformId, (prev) => ({
      ...prev,
      status: 'failed',
      progressPct: 0,
      statusMessage: 'Account disconnected',
      error: `No ${spec.name} account connected.`,
      updatedAt: new Date().toISOString(),
    }));
    return;
  }

  const adapter = ADAPTER_REGISTRY[spec.accountGroup];
  const files = store.getJobFiles(jobId);
  const override = job.overrides[platformId];
  const postKind = job.postKind ?? detectPostKind(job.video, job.photos);

  const effectiveVideo = job.video
    ? getEffectiveVideoForPlatform(job.video, platformId)
    : undefined;
  const resolvedText = resolvePlatformText(
    platformId,
    job.master,
    override,
    effectiveVideo
  );
  const selectedVideoPath = job.video
    ? pickVariantForPlatform(platformId, {
        defaultVideoPath: files.videoPath,
        verticalVideoPath: files.verticalVideoPath,
        extractedThumbnailPath: files.thumbnailPath,
      })
    : undefined;

  const useLive =
    account.mode === 'live' &&
    (Boolean(account.accessToken) || adapter.isLiveConfigured());

  try {
    const ctx = {
      jobId,
      platformId,
      postKind,
      videoFilePath: selectedVideoPath,
      photoFilePaths: files.photoPaths,
      thumbnailFilePath: files.thumbnailPath,
      videoMeta: job.video,
      photosMeta: job.photos,
      resolvedText,
      override,
      account,
      onProgress: (stage: any, pct: number, message: string) => {
        store.updateJobResult(jobId, platformId, (prev) => ({
          ...prev,
          status: stage,
          progressPct: pct,
          statusMessage: message,
          updatedAt: new Date().toISOString(),
        }));
      },
    };

    const outcome = useLive
      ? await adapter.publishVideo(ctx)
      : await runSandboxPublish(ctx);

    const firstCommentPosted = Boolean(outcome.firstCommentPosted);
    const initialMetrics = generateInitialPostMetrics({
      jobId,
      platformId,
      postKind,
      firstCommentPosted,
      createdAtIso: job.createdAt,
    });

    store.updateJobResult(jobId, platformId, (prev) => ({
      ...prev,
      status: 'published',
      progressPct: 100,
      statusMessage: firstCommentPosted
        ? `Published to ${spec.shortName} (+ 1st comment)`
        : `Published to ${spec.shortName}`,
      mode: useLive ? 'live' : 'sandbox',
      externalPostId: outcome.externalPostId,
      externalUrl: outcome.externalUrl,
      firstCommentPosted,
      metrics: prev.metrics ?? initialMetrics,
      error: undefined,
      updatedAt: new Date().toISOString(),
    }));
  } catch (err: any) {
    store.updateJobResult(jobId, platformId, (prev) => ({
      ...prev,
      status: 'failed',
      statusMessage: `Failed on ${spec.shortName}`,
      error: err?.message || 'Unexpected publishing error',
      updatedAt: new Date().toISOString(),
    }));
  }
}

export function createApp() {
  const app = express();
  app.use(cors());

  // Signed Stripe Subscription Lifecycle Webhook (requires raw unparsed body)
  app.post(
    '/api/billing/webhook',
    express.raw({ type: 'application/json' }),
    (req, res) => {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const sigHeader = req.headers['stripe-signature'] as string | undefined;
      const rawBuf = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            typeof req.body === 'string'
              ? req.body
              : JSON.stringify(req.body ?? {})
          );

      if (
        webhookSecret &&
        !verifyStripeWebhookSignature(rawBuf, sigHeader, webhookSecret)
      ) {
        res.status(400).json({ error: 'Invalid Stripe-Signature header.' });
        return;
      }

      try {
        const event = JSON.parse(rawBuf.toString('utf8'));
        const obj = event?.data?.object ?? {};

        if (event.type === 'checkout.session.completed') {
          const userId = obj?.metadata?.userId;
          const planTier = obj?.metadata?.planTier as PlanTierId | undefined;
          const interval =
            obj?.metadata?.billingInterval === 'annual' ? 'annual' : 'monthly';
          const customerId =
            typeof obj.customer === 'string' ? obj.customer : undefined;
          if (
            userId &&
            (planTier === 'creator' || planTier === 'studio')
          ) {
            store.updateUserPlan(userId, planTier, interval, customerId);
          }
        } else if (event.type === 'customer.subscription.updated') {
          const customerId =
            typeof obj.customer === 'string' ? obj.customer : undefined;
          const user =
            (obj?.metadata?.userId && store.getUserById(obj.metadata.userId)) ||
            (customerId && store.getUserByStripeCustomerId(customerId));
          if (user) {
            const subStatus = String(obj.status || '');
            if (subStatus === 'canceled' || subStatus === 'unpaid') {
              store.updateUserPlan(user.id, 'free', user.billingInterval);
            } else {
              const rawTier = obj?.metadata?.planTier as PlanTierId | undefined;
              const nextTier: PlanTierId =
                rawTier === 'creator' || rawTier === 'studio'
                  ? rawTier
                  : user.planTier;
              const nextInterval: BillingInterval =
                obj?.metadata?.billingInterval === 'annual'
                  ? 'annual'
                  : user.billingInterval;
              store.updateUserPlan(user.id, nextTier, nextInterval, customerId);
            }
          }
        } else if (event.type === 'customer.subscription.deleted') {
          const customerId =
            typeof obj.customer === 'string' ? obj.customer : undefined;
          const user =
            (obj?.metadata?.userId && store.getUserById(obj.metadata.userId)) ||
            (customerId && store.getUserByStripeCustomerId(customerId));
          if (user) {
            store.updateUserPlan(user.id, 'free', 'monthly');
          }
        }

        res.json({ received: true });
      } catch {
        res.status(400).json({ error: 'Malformed Stripe event payload.' });
      }
    }
  );

  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(UPLOAD_DIR));

  const getLiveConfigMap = (): Record<AccountGroupId, boolean> => ({
    tiktok: ADAPTER_REGISTRY.tiktok.isLiveConfigured(),
    instagram: ADAPTER_REGISTRY.instagram.isLiveConfigured(),
    youtube: ADAPTER_REGISTRY.youtube.isLiveConfigured(),
    facebook: ADAPTER_REGISTRY.facebook.isLiveConfigured(),
    x: ADAPTER_REGISTRY.x.isLiveConfigured(),
    threads: ADAPTER_REGISTRY.threads.isLiveConfigured(),
    bluesky: ADAPTER_REGISTRY.bluesky.isLiveConfigured(),
    linkedin: ADAPTER_REGISTRY.linkedin.isLiveConfigured(),
  });

  const resolveRequestUser = (
    req: express.Request,
    res: express.Response
  ): AuthUser | null => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      const user = store.getUserByToken(token);
      if (!user) {
        res.status(401).json({ error: 'Session expired. Please sign in again.' });
        return null;
      }
      return user;
    }
    return store.getDefaultUser();
  };

  const resolveUserWorkspaceId = (
    user: AuthUser,
    requestedWsId?: unknown
  ): string => {
    if (typeof requestedWsId === 'string' && requestedWsId.trim()) {
      const clean = requestedWsId.trim();
      if (store.userCanAccessWorkspace(user.id, clean)) {
        return clean;
      }
    }
    return store.getWorkspaces(user.id)[0]?.id ?? DEFAULT_WORKSPACE_ID;
  };

  const resolveEffectiveWorkspaceRole = (
    req: express.Request,
    user: AuthUser,
    workspaceId: string
  ): WorkspaceRole => {
    const actualRole =
      store.getUserRoleInWorkspace(user.id, workspaceId) ?? 'editor';
    const previewHeader = String(
      req.headers['x-omnipost-role-preview'] || ''
    ).trim() as WorkspaceRole;
    if (
      (actualRole === 'owner' || actualRole === 'admin') &&
      (previewHeader === 'owner' ||
        previewHeader === 'admin' ||
        previewHeader === 'editor' ||
        previewHeader === 'approver')
    ) {
      return previewHeader;
    }
    return actualRole;
  };

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'omnipost-relay-server',
      storage: store.getStorageInfo(),
      liveConfigured: getLiveConfigMap(),
      stripeLiveConfigured: isStripeLiveConfigured(),
    });
  });

  // --- OAUTH APP-REVIEW COMPLIANCE PAGES & META DATA DELETION CALLBACK ---
  app.get('/privacy', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(renderPrivacyHtml());
  });

  app.get('/terms', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(renderTermsHtml());
  });

  app.post('/api/compliance/meta-data-deletion', (req, res) => {
    const baseUrl =
      process.env.PUBLIC_WEB_URL ||
      process.env.PUBLIC_SERVER_URL ||
      `${req.protocol}://${req.get('host')}`;
    res.json(buildMetaDataDeletionReceipt(baseUrl));
  });

  // --- AUTHENTICATION ---
  app.post('/api/auth/register', (req, res) => {
    try {
      const { name, email, password } = req.body ?? {};
      const { user, token, initialWorkspace } = store.registerUser({
        name: String(name ?? ''),
        email: String(email ?? ''),
        password: String(password ?? ''),
      });
      const usage = store.getPlanUsage(user.id, initialWorkspace.id);
      res.status(201).json({
        user,
        token,
        workspaces: [initialWorkspace],
        usage,
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Registration failed.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      const { user, token } = store.loginUser(
        String(email ?? ''),
        String(password ?? '')
      );
      const workspaces = store.getWorkspaces(user.id);
      const usage = store.getPlanUsage(user.id, workspaces[0]?.id);
      res.json({ user, token, workspaces, usage });
    } catch (err: any) {
      res.status(401).json({ error: err?.message || 'Invalid credentials.' });
    }
  });

  app.post('/api/auth/demo', (_req, res) => {
    const user = store.getDefaultUser();
    const token = store.createSessionForUser(user.id);
    const workspaces = store.getWorkspaces(user.id);
    const usage = store.getPlanUsage(user.id, workspaces[0]?.id);
    res.json({ user, token, workspaces, usage });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      store.revokeSession(authHeader.slice('Bearer '.length).trim());
    }
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = resolveUserWorkspaceId(user, req.query.workspaceId);
    const usage = store.getPlanUsage(user.id, wsId);
    res.json({ user, usage });
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    const rawEmail = String(req.body?.email ?? '').trim();
    if (!rawEmail || !rawEmail.includes('@')) {
      res.status(400).json({ error: 'Enter your account email address.' });
      return;
    }

    const issued = store.createPasswordResetCode(rawEmail);
    if (issued.exists && issued.code) {
      const sent = await sendTransactionalEmail({
        toEmail: issued.email,
        subject: `Your OmniPost reset code: ${issued.code}`,
        category: 'password_reset',
        textBody: `Use 6-digit reset code ${issued.code} inside OmniPost within the next 30 minutes to set a new password.`,
      });
      store.recordOutboxEmail(sent);
    }

    res.json({
      ok: true,
      message:
        'If an account matches that email, a 6-digit recovery code has been sent.',
      devResetCode:
        !isResendConfigured() && issued.code ? issued.code : undefined,
    });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    try {
      const { email, code, newPassword } = req.body ?? {};
      const { user, token } = store.resetPasswordWithCode({
        email: String(email ?? ''),
        code: String(code ?? ''),
        newPassword: String(newPassword ?? ''),
      });
      const workspaces = store.getWorkspaces(user.id);
      const usage = store.getPlanUsage(user.id, workspaces[0]?.id);
      res.json({ user, token, workspaces, usage });
    } catch (err: any) {
      res.status(400).json({
        error: err?.message || 'Could not reset password.',
      });
    }
  });

  app.delete('/api/auth/me', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    store.deleteUserById(user.id);
    res.json({ ok: true });
  });

  // --- PLANS & STRIPE BILLING ---
  app.post('/api/billing/checkout', async (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;

    const rawTier = String(req.body?.planTier || 'creator') as PlanTierId;
    const planTier: PlanTierId =
      rawTier === 'free' || rawTier === 'creator' || rawTier === 'studio'
        ? rawTier
        : 'creator';
    const rawInterval = String(req.body?.billingInterval || 'monthly');
    const billingInterval: BillingInterval =
      rawInterval === 'annual' ? 'annual' : 'monthly';
    const wsId = resolveUserWorkspaceId(user, req.body?.workspaceId);

    if (planTier !== 'free' && isStripeLiveConfigured()) {
      try {
        const returnServerBaseUrl =
          process.env.PUBLIC_SERVER_URL ||
          `${req.protocol}://${req.get('host')}`;
        const clientAppUrl =
          String(req.body?.clientAppUrl || '') ||
          process.env.PUBLIC_WEB_URL ||
          'http://localhost:8081';

        const session = await createStripeCheckoutSession({
          userId: user.id,
          userEmail: user.email,
          planTier,
          billingInterval,
          returnServerBaseUrl,
          clientAppUrl,
        });
        res.json({
          mode: 'stripe',
          checkoutUrl: session.checkoutUrl,
          sessionId: session.sessionId,
        });
        return;
      } catch (err: any) {
        res.status(500).json({
          error: err?.message || 'Stripe Checkout session failed.',
        });
        return;
      }
    }

    const updatedUser =
      store.updateUserPlan(user.id, planTier, billingInterval) ?? user;
    const usage = store.getPlanUsage(updatedUser.id, wsId);
    res.json({
      mode: 'sandbox',
      user: updatedUser,
      usage,
    });
  });

  app.get('/api/billing/stripe-return', async (req, res) => {
    const sessionId = String(req.query.session_id || '');
    const appUrl = String(
      req.query.app_url || process.env.PUBLIC_WEB_URL || 'http://localhost:8081'
    );
    if (sessionId) {
      const verified = await verifyStripeCheckoutSession(sessionId);
      if (verified.paid && verified.userId && verified.planTier) {
        store.updateUserPlan(
          verified.userId,
          verified.planTier,
          verified.billingInterval ?? 'monthly',
          verified.customerId
        );
      }
    }
    res.redirect(appUrl);
  });

  app.get('/api/workspaces', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const workspaces = store.getWorkspaces(user.id);
    const allAccounts = store.getPublicAccounts();
    res.json({
      workspaces,
      accountCounts: Object.fromEntries(
        workspaces.map((w) => [
          w.id,
          allAccounts.filter(
            (a) => (a.workspaceId ?? DEFAULT_WORKSPACE_ID) === w.id
          ).length,
        ])
      ),
    });
  });

  app.post('/api/workspaces', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;

    const { name, accentColor, seedDemoAccounts } = req.body ?? {};
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Workspace name is required.' });
      return;
    }

    const usage = store.getPlanUsage(user.id);
    if (
      usage.maxWorkspaces !== null &&
      usage.workspacesUsed >= usage.maxWorkspaces
    ) {
      res.status(402).json({
        code: 'PLAN_LIMIT_REACHED',
        requiredTier: 'studio',
        error:
          'Multi-brand workspaces are included on the Studio plan ($29/mo).',
      });
      return;
    }

    const workspace = store.createWorkspace(
      String(name),
      accentColor,
      seedDemoAccounts !== false,
      user.id
    );
    res.status(201).json({ workspace });
  });

  app.delete('/api/workspaces/:id', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const ok = store.deleteWorkspace(req.params.id, user.id);
    if (!ok) {
      res.status(400).json({ error: 'Cannot delete the last workspace.' });
      return;
    }
    res.json({ ok: true });
  });

  // Workspace Settings (including Approval-Gated Publishing switch)
  app.patch('/api/workspaces/:id', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    const ws = store.getWorkspaceById(wsId);
    if (!ws || !store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    const role = resolveEffectiveWorkspaceRole(req, user, wsId);
    if (role !== 'owner' && role !== 'admin') {
      res.status(403).json({
        error: 'Only Workspace Owners or Admins can change workspace settings.',
      });
      return;
    }

    const { name, accentColor, requireApproval } = req.body ?? {};
    if (requireApproval === true) {
      const ownerId = ws.ownerUserId || user.id;
      const usage = store.getPlanUsage(ownerId, wsId);
      if (!usage.allowsClientApprovals) {
        res.status(402).json({
          code: 'PLAN_LIMIT_REACHED',
          requiredTier: 'studio',
          error:
            'Approval-gated publishing is included on the Studio plan ($29/mo).',
        });
        return;
      }
    }

    const updated = store.updateWorkspaceSettings(wsId, {
      name: typeof name === 'string' ? name : undefined,
      accentColor: typeof accentColor === 'string' ? accentColor : undefined,
      requireApproval:
        typeof requireApproval === 'boolean' ? requireApproval : undefined,
    });
    res.json({
      workspace: updated
        ? { ...updated, currentUserRole: store.getUserRoleInWorkspace(user.id, wsId) ?? 'owner' }
        : null,
    });
  });

  // Team Members & Role Permissions per Brand Workspace
  app.get('/api/workspaces/:id/members', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    if (!store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }
    res.json({
      members: store.getWorkspaceMembers(wsId),
      currentUserRole: store.getUserRoleInWorkspace(user.id, wsId) ?? 'owner',
    });
  });

  app.post('/api/workspaces/:id/members', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    const ws = store.getWorkspaceById(wsId);
    if (!ws || !store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    const callerRole = resolveEffectiveWorkspaceRole(req, user, wsId);
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      res.status(403).json({
        error: 'Only Workspace Owners or Admins can invite team members.',
      });
      return;
    }

    const ownerId = ws.ownerUserId || user.id;
    const usage = store.getPlanUsage(ownerId, wsId);
    if (!usage.allowsClientApprovals) {
      res.status(402).json({
        code: 'PLAN_LIMIT_REACHED',
        requiredTier: 'studio',
        error:
          'Team members & workspace roles are included on the Studio plan ($29/mo).',
      });
      return;
    }

    const { email, name, role } = req.body ?? {};
    const targetRole: Exclude<WorkspaceRole, 'owner'> =
      role === 'admin' || role === 'approver' || role === 'editor'
        ? role
        : 'editor';

    try {
      const member = store.inviteWorkspaceMember({
        workspaceId: wsId,
        email: String(email ?? ''),
        name: name ? String(name) : undefined,
        role: targetRole,
        invitedByName: user.name,
      });

      void sendTransactionalEmail({
        toEmail: member.email,
        subject: `${user.name} invited you to ${ws.name} on OmniPost`,
        category: 'team_invite',
        textBody: `You have been invited as ${targetRole.toUpperCase()} on the "${ws.name}" workspace in OmniPost. Sign in or create an account with ${member.email} to collaborate immediately.`,
      }).then((item) => store.recordOutboxEmail(item));

      res.status(201).json({
        member,
        members: store.getWorkspaceMembers(wsId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Could not invite member.' });
    }
  });

  app.patch('/api/workspaces/:id/members/:memberId', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    const callerRole = resolveEffectiveWorkspaceRole(req, user, wsId);
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      res.status(403).json({
        error: 'Only Workspace Owners or Admins can change member roles.',
      });
      return;
    }

    const rawRole = req.body?.role;
    if (rawRole !== 'admin' && rawRole !== 'editor' && rawRole !== 'approver') {
      res.status(400).json({ error: 'Role must be admin, editor, or approver.' });
      return;
    }

    const updated = store.updateWorkspaceMemberRole(
      req.params.memberId,
      wsId,
      rawRole
    );
    if (!updated) {
      res.status(400).json({ error: 'Cannot change workspace owner role.' });
      return;
    }
    res.json({
      member: updated,
      members: store.getWorkspaceMembers(wsId),
    });
  });

  app.delete('/api/workspaces/:id/members/:memberId', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    const callerRole = resolveEffectiveWorkspaceRole(req, user, wsId);
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      res.status(403).json({
        error: 'Only Workspace Owners or Admins can remove members.',
      });
      return;
    }

    const ok = store.removeWorkspaceMember(req.params.memberId, wsId);
    if (!ok) {
      res.status(400).json({ error: 'Cannot remove workspace owner.' });
      return;
    }
    res.json({ ok: true, members: store.getWorkspaceMembers(wsId) });
  });

  // Saved Content Presets (scoped per Brand Workspace)
  app.get('/api/presets', (req, res) => {
    const wsId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId
        ? req.query.workspaceId
        : DEFAULT_WORKSPACE_ID;
    res.json({ presets: store.getPresets(wsId) });
  });

  app.post('/api/presets', (req, res) => {
    const { workspaceId, name, captionSnippet, hashtags, firstComment } =
      req.body ?? {};
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Preset name is required.' });
      return;
    }
    const hasContent = Boolean(
      String(captionSnippet ?? '').trim() ||
        String(hashtags ?? '').trim() ||
        String(firstComment ?? '').trim()
    );
    if (!hasContent) {
      res.status(400).json({
        error: 'Include a caption snippet, hashtags, or first comment.',
      });
      return;
    }
    const preset = store.createPreset({
      workspaceId: workspaceId ? String(workspaceId) : DEFAULT_WORKSPACE_ID,
      name: String(name),
      captionSnippet: captionSnippet ? String(captionSnippet) : undefined,
      hashtags: hashtags ? String(hashtags) : undefined,
      firstComment: firstComment ? String(firstComment) : undefined,
    });
    res.status(201).json({ preset });
  });

  app.delete('/api/presets/:id', (req, res) => {
    const ok = store.deletePreset(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Preset not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // Cross-Platform Post Analytics & Sync
  app.get('/api/analytics', (req, res) => {
    const wsId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId
        ? req.query.workspaceId
        : DEFAULT_WORKSPACE_ID;
    const rawRange = String(req.query.range || '30d');
    const range: AnalyticsTimeRange =
      rawRange === '7d' || rawRange === '30d' || rawRange === 'all'
        ? rawRange
        : '30d';
    store.ensureWorkspaceMetrics(wsId);
    const analytics = computeWorkspaceAnalytics(
      wsId,
      store.getJobs(wsId),
      range
    );
    res.json({ analytics });
  });

  app.post('/api/analytics/sync', async (req, res) => {
    const wsId =
      typeof req.body?.workspaceId === 'string' && req.body.workspaceId
        ? req.body.workspaceId
        : DEFAULT_WORKSPACE_ID;
    const rawRange = String(req.body?.range || '30d');
    const range: AnalyticsTimeRange =
      rawRange === '7d' || rawRange === '30d' || rawRange === 'all'
        ? rawRange
        : '30d';
    await store.syncWorkspaceMetrics(wsId);
    const jobs = store.getJobs(wsId);
    const analytics = computeWorkspaceAnalytics(wsId, jobs, range);
    res.json({ analytics, jobs });
  });

  app.get('/api/accounts', (req, res) => {
    const wsId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId
        ? req.query.workspaceId
        : DEFAULT_WORKSPACE_ID;
    res.json({
      accounts: store.getPublicAccounts(wsId),
      liveConfigured: getLiveConfigMap(),
    });
  });

  app.post('/api/accounts/sandbox', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;

    const { platformGroup, handle, displayName, workspaceId } = req.body as {
      platformGroup: AccountGroupId;
      handle?: string;
      displayName?: string;
      workspaceId?: string;
    };
    const wsId = resolveUserWorkspaceId(user, workspaceId);
    const groupSpec = ACCOUNT_GROUPS.find((g) => g.id === platformGroup);
    if (!groupSpec) {
      res.status(400).json({ error: 'Invalid platformGroup' });
      return;
    }

    const alreadyLinked = store.getAccountByGroup(groupSpec.id, wsId);
    if (!alreadyLinked) {
      const usage = store.getPlanUsage(user.id, wsId);
      if (
        usage.maxAccountsPerWorkspace !== null &&
        usage.accountsInActiveWorkspace >= usage.maxAccountsPerWorkspace
      ) {
        res.status(402).json({
          code: 'PLAN_LIMIT_REACHED',
          requiredTier: 'creator',
          error: `Starter includes up to ${usage.maxAccountsPerWorkspace} connected channels. Upgrade to Creator ($12/mo) to connect all 8 platforms.`,
        });
        return;
      }
    }

    const connected = store.upsertAccount({
      id: `acc_sandbox_${wsId}_${groupSpec.id}`,
      workspaceId: wsId,
      platformGroup: groupSpec.id,
      mode: 'sandbox',
      handle: handle?.trim() || groupSpec.defaultSandboxHandle,
      displayName: displayName?.trim() || groupSpec.defaultSandboxName,
      connectedAt: new Date().toISOString(),
      simulateFailure: false,
    });

    res.status(201).json({ account: connected });
  });

  // Zero-Review Live Bluesky Connection via Handle + App Password
  app.post('/api/accounts/bluesky/live', async (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;

    const { identifier, appPassword, workspaceId } = req.body ?? {};
    const cleanId = String(identifier ?? '')
      .trim()
      .replace(/^@/, '');
    const cleanPass = String(appPassword ?? '').trim();
    if (!cleanId || !cleanPass) {
      res.status(400).json({
        error:
          'Enter both your Bluesky handle (e.g. you.bsky.social) and an App Password.',
      });
      return;
    }

    const wsId = resolveUserWorkspaceId(user, workspaceId);
    const alreadyLinked = store.getAccountByGroup('bluesky', wsId);
    if (!alreadyLinked) {
      const usage = store.getPlanUsage(user.id, wsId);
      if (
        usage.maxAccountsPerWorkspace !== null &&
        usage.accountsInActiveWorkspace >= usage.maxAccountsPerWorkspace
      ) {
        res.status(402).json({
          code: 'PLAN_LIMIT_REACHED',
          requiredTier: 'creator',
          error: `Starter includes up to ${usage.maxAccountsPerWorkspace} connected channels. Upgrade to Creator ($12/mo) to connect all 8 platforms.`,
        });
        return;
      }
    }

    try {
      const sessionRes = await fetch(
        'https://bsky.social/xrpc/com.atproto.server.createSession',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: cleanId,
            password: cleanPass,
          }),
        }
      );
      const sessionJson: any = await sessionRes.json();
      if (!sessionRes.ok || !sessionJson.accessJwt) {
        res.status(400).json({
          error:
            sessionJson?.message ||
            'Bluesky rejected those credentials. Make sure you created an App Password in Bluesky Settings.',
        });
        return;
      }

      const connected = store.upsertAccount({
        id: `acc_live_${wsId}_bluesky`,
        workspaceId: wsId,
        platformGroup: 'bluesky',
        mode: 'live',
        handle: `@${sessionJson.handle}`,
        displayName: `${sessionJson.handle} (Live)`,
        accessToken: sessionJson.accessJwt,
        refreshToken: sessionJson.refreshJwt,
        expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
        externalAccountId: sessionJson.did,
        connectedAt: new Date().toISOString(),
        simulateFailure: false,
      });

      res.status(201).json({ account: connected });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Could not reach Bluesky AT Protocol server.',
      });
    }
  });

  app.patch('/api/accounts/:id', (req, res) => {
    const updated = store.updateAccount(req.params.id, req.body ?? {});
    if (!updated) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.json({ account: updated });
  });

  app.delete('/api/accounts/:id', (req, res) => {
    const removed = store.removeAccount(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.json({ ok: true });
  });

  // Live Direct OAuth 2.0 Initiation & Callback
  app.get('/api/oauth/:group/start', (req, res) => {
    const group = req.params.group as AccountGroupId;
    const adapter = ADAPTER_REGISTRY[group];
    if (!adapter) {
      res.status(400).send('Unknown platform group.');
      return;
    }
    if (!adapter.isLiveConfigured()) {
      res.status(400).json({
        error: `Live OAuth keys for ${group} are not set in server/.env yet. Use Sandbox mode or configure server/.env.`,
      });
      return;
    }

    const wsId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId
        ? req.query.workspaceId
        : DEFAULT_WORKSPACE_ID;
    const baseUrl =
      process.env.PUBLIC_SERVER_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/api/oauth/${group}/callback`;
    const state = crypto.randomBytes(16).toString('hex');
    const { authUrl, codeVerifier } = adapter.getOAuthUrl(redirectUri, state);

    pendingOAuthStates.set(state, {
      group,
      workspaceId: wsId,
      codeVerifier,
      redirectUri,
    });
    res.redirect(authUrl);
  });

  app.get('/api/oauth/:group/callback', async (req, res) => {
    try {
      const state = String(req.query.state || '');
      const code = String(req.query.code || '');
      const saved = pendingOAuthStates.get(state);
      if (!saved || !code) {
        res.status(400).send('Invalid or expired OAuth state.');
        return;
      }
      pendingOAuthStates.delete(state);

      const adapter = ADAPTER_REGISTRY[saved.group];
      const bundle = await adapter.exchangeCodeForToken(
        code,
        saved.redirectUri,
        saved.codeVerifier
      );

      store.upsertAccount({
        id: `acc_live_${saved.workspaceId}_${saved.group}`,
        workspaceId: saved.workspaceId,
        platformGroup: saved.group,
        mode: 'live',
        handle: bundle.handle,
        displayName: bundle.displayName,
        accessToken: bundle.accessToken,
        refreshToken: bundle.refreshToken,
        expiresAt: bundle.expiresInSec
          ? new Date(Date.now() + bundle.expiresInSec * 1000).toISOString()
          : undefined,
        externalAccountId: bundle.externalAccountId,
        connectedAt: new Date().toISOString(),
      });

      res
        .status(200)
        .send(
          `<html><body style="font-family:sans-serif;background:#090B10;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;"><div><h2>Connected ${bundle.displayName} (${bundle.handle})!</h2><p>You can close this window and return to OmniPost.</p></div></body></html>`
        );
    } catch (err: any) {
      res.status(500).send(`OAuth Error: ${err?.message || 'Unknown error'}`);
    }
  });

  // Single-Upload Multi-Platform Fan-Out Endpoint
  app.post(
    '/api/jobs',
    upload.fields([
      { name: 'video', maxCount: 1 },
      { name: 'photos', maxCount: MAX_CAROUSEL_PHOTOS },
      { name: 'thumbnail', maxCount: 1 },
    ]),
    (req, res) => {
      try {
        const user = resolveRequestUser(req, res);
        if (!user) return;

        const rawPayload =
          typeof req.body?.payload === 'string'
            ? JSON.parse(req.body.payload)
            : req.body;

        const uploadedFiles = req.files as
          | { [fieldname: string]: Express.Multer.File[] }
          | undefined;
        const videoFile = uploadedFiles?.video?.[0];
        const photoFiles = uploadedFiles?.photos ?? [];
        const thumbFile = uploadedFiles?.thumbnail?.[0];

        const lifecycle: JobLifecycle =
          rawPayload?.lifecycle === 'draft' ||
          rawPayload?.lifecycle === 'scheduled'
            ? rawPayload.lifecycle
            : 'active';
        const scheduledAt: string | undefined =
          typeof rawPayload?.scheduledAt === 'string' &&
          rawPayload.scheduledAt.trim()
            ? rawPayload.scheduledAt.trim()
            : undefined;
        const replaceJobId: string | undefined =
          typeof rawPayload?.replaceJobId === 'string' &&
          rawPayload.replaceJobId.trim()
            ? rawPayload.replaceJobId.trim()
            : undefined;

        const hasVideoPayload = Boolean(
          videoFile || rawPayload?.videoMeta?.fileName
        );

        const videoMeta: VideoAssetMeta | null = hasVideoPayload
          ? {
              fileName:
                videoFile?.originalname ||
                rawPayload?.videoMeta?.fileName ||
                'clip.mp4',
              mimeType:
                videoFile?.mimetype ||
                rawPayload?.videoMeta?.mimeType ||
                'video/mp4',
              fileSizeBytes:
                videoFile?.size || rawPayload?.videoMeta?.fileSizeBytes || 0,
              width: Number(rawPayload?.videoMeta?.width) || 1080,
              height: Number(rawPayload?.videoMeta?.height) || 1920,
              durationSec: Number(rawPayload?.videoMeta?.durationSec) || 30,
              thumbnailUri: rawPayload?.videoMeta?.thumbnailUri,
              isSamplePreset: Boolean(rawPayload?.videoMeta?.isSamplePreset),
              edits: rawPayload?.videoMeta?.edits,
            }
          : null;

        const rawPhotos: any[] = Array.isArray(rawPayload?.photosMeta)
          ? rawPayload.photosMeta
          : [];
        const photosMeta: PhotoAssetMeta[] =
          photoFiles.length > 0
            ? photoFiles.map((f, idx) => ({
                id: rawPhotos[idx]?.id || `ph_${idx}`,
                fileName: f.originalname || `photo_${idx + 1}.jpg`,
                mimeType: f.mimetype || 'image/jpeg',
                fileSizeBytes: f.size,
                width: Number(rawPhotos[idx]?.width) || 1080,
                height: Number(rawPhotos[idx]?.height) || 1350,
              }))
            : rawPhotos.map((p, idx) => ({
                id: String(p?.id || `ph_${idx}`),
                fileName: String(p?.fileName || `photo_${idx + 1}.jpg`),
                mimeType: String(p?.mimeType || 'image/jpeg'),
                width: Number(p?.width) || 1080,
                height: Number(p?.height) || 1350,
                isSamplePreset: Boolean(p?.isSamplePreset),
                sampleTint: p?.sampleTint,
                sampleLabel: p?.sampleLabel,
              }));

        const postKind = detectPostKind(videoMeta, photosMeta);

        const wsId: string = resolveUserWorkspaceId(
          user,
          rawPayload?.workspaceId
        );
        const ws = store.getWorkspaceById(wsId);
        const callerRole = resolveEffectiveWorkspaceRole(req, user, wsId);

        if (callerRole === 'editor' && lifecycle === 'active') {
          res.status(403).json({
            error:
              'Editors cannot publish immediately. Schedule this post or save as a draft for approval.',
          });
          return;
        }

        if (lifecycle !== 'draft' && !replaceJobId) {
          const ownerId = ws?.ownerUserId || user.id;
          const usage = store.getPlanUsage(ownerId, wsId);
          if (
            usage.maxPostsPerMonth !== null &&
            usage.postsThisMonth >= usage.maxPostsPerMonth
          ) {
            res.status(402).json({
              code: 'PLAN_LIMIT_REACHED',
              requiredTier: 'creator',
              error: `You have used all ${usage.maxPostsPerMonth} monthly posts on the Starter plan. Upgrade to Creator ($12/mo) for unlimited publishing.`,
            });
            return;
          }
        }

        const master: MasterDraft = {
          title: String(rawPayload?.master?.title ?? ''),
          caption: String(rawPayload?.master?.caption ?? ''),
          hashtags: String(rawPayload?.master?.hashtags ?? ''),
          firstComment: rawPayload?.master?.firstComment
            ? String(rawPayload.master.firstComment)
            : undefined,
        };

        const defaultOverrides = createDefaultOverrides();
        const overrides: Record<PlatformId, PlatformOverride> = {
          ...defaultOverrides,
          ...(rawPayload?.overrides ?? {}),
        };

        const enabledPlatforms = PLATFORM_ORDER.filter(
          (id) => overrides[id]?.enabled
        );

        if (lifecycle !== 'draft') {
          if (enabledPlatforms.length === 0) {
            res
              .status(400)
              .json({ error: 'Enable at least one destination platform.' });
            return;
          }
          if (lifecycle === 'scheduled' && !scheduledAt) {
            res
              .status(400)
              .json({ error: 'Choose a date and time to schedule this post.' });
            return;
          }

          const validations = validateAllPlatforms(
            videoMeta,
            master,
            overrides,
            store.getPublicAccounts(wsId),
            photosMeta
          );
          const blockingIssues = enabledPlatforms.flatMap((id) =>
            validations[id].issues.filter((i) => i.severity === 'error')
          );

          if (blockingIssues.length > 0 && !rawPayload?.force) {
            res.status(400).json({
              error: blockingIssues[0].message,
              issues: blockingIssues,
            });
            return;
          }
        }

        const existingJob = replaceJobId ? store.getJob(replaceJobId) : undefined;
        const previousFiles = replaceJobId
          ? store.getJobFiles(replaceJobId)
          : {};

        const jobId =
          existingJob?.id ||
          `job_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const now = new Date().toISOString();
        const results: PublishJob['results'] = {};

        for (const id of enabledPlatforms) {
          const acc = store.getAccountByGroup(
            PLATFORM_SPECS[id].accountGroup,
            wsId
          );
          results[id] = {
            platformId: id,
            status: 'queued',
            progressPct: lifecycle === 'active' ? 5 : 0,
            statusMessage:
              lifecycle === 'draft'
                ? 'Saved in draft'
                : lifecycle === 'scheduled'
                ? 'Scheduled'
                : `Queued for ${PLATFORM_SPECS[id].shortName}...`,
            mode: acc?.mode === 'live' ? 'live' : 'sandbox',
            updatedAt: now,
          };
        }

        const resolvedVideoPath = videoFile?.path ?? previousFiles.videoPath;
        const resolvedPhotoPaths =
          photoFiles.length > 0
            ? photoFiles.map((f) => f.path)
            : previousFiles.photoPaths;
        const resolvedThumbPath = thumbFile?.path ?? previousFiles.thumbnailPath;

        const shouldHoldForApproval =
          lifecycle !== 'active' &&
          (Boolean(ws?.requireApproval) ||
            callerRole === 'editor' ||
            Boolean(rawPayload?.holdForApproval));

        const initialApproval: PostApprovalState | undefined =
          existingJob?.approval ??
          (shouldHoldForApproval
            ? {
                shareToken: `rev_${crypto.randomBytes(12).toString('hex')}`,
                status: 'pending',
                updatedAt: now,
                comments: [],
              }
            : undefined);

        const job = store.createJob(
          {
            id: jobId,
            workspaceId: wsId,
            createdAt: existingJob?.createdAt ?? now,
            updatedAt: now,
            lifecycle,
            scheduledAt: lifecycle === 'scheduled' ? scheduledAt : undefined,
            postKind,
            createdByName: existingJob?.createdByName ?? user.name,
            createdByRole: existingJob?.createdByRole ?? callerRole,
            isEvergreen:
              rawPayload?.isEvergreen !== undefined
                ? Boolean(rawPayload.isEvergreen)
                : existingJob?.isEvergreen,
            evergreenIntervalDays:
              rawPayload?.evergreenIntervalDays !== undefined
                ? Number(rawPayload.evergreenIntervalDays) || 14
                : existingJob?.evergreenIntervalDays,
            video: videoMeta,
            photos: photosMeta.length > 0 ? photosMeta : undefined,
            master,
            overrides,
            results,
            approval: initialApproval,
          },
          {
            videoPath: resolvedVideoPath,
            verticalVideoPath: videoFile?.path
              ? undefined
              : previousFiles.verticalVideoPath,
            photoPaths: resolvedPhotoPaths,
            thumbnailPath: resolvedThumbPath,
          }
        );

        // Pre-render FFmpeg variants in background; fan out immediately only if lifecycle === 'active'
        void (async () => {
          if (resolvedVideoPath && videoMeta?.edits) {
            if (lifecycle === 'active') {
              for (const id of enabledPlatforms) {
                store.updateJobResult(jobId, id, (prev) => ({
                  ...prev,
                  status: 'processing',
                  progressPct: 12,
                  statusMessage: 'Rendering trim & aspect-ratio variants...',
                  updatedAt: new Date().toISOString(),
                }));
              }
            }
            const prepared = await prepareMediaVariants(
              jobId,
              resolvedVideoPath,
              resolvedThumbPath,
              videoMeta,
              enabledPlatforms,
              UPLOAD_DIR
            );
            store.setJobFiles(jobId, {
              videoPath: prepared.defaultVideoPath,
              verticalVideoPath: prepared.verticalVideoPath,
              thumbnailPath: prepared.extractedThumbnailPath,
            });
          }

          if (lifecycle === 'active') {
            for (const id of enabledPlatforms) {
              void executePlatformPublish(jobId, id);
            }
          }
        })();

        res.status(201).json({ job });
      } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to create publish job' });
      }
    }
  );

  // Bulk Batch Scheduler — Create & auto-slot multiple posts across the calendar in one pass
  app.post(
    '/api/jobs/batch',
    (req, res, next) => {
      if (req.is('multipart/form-data')) {
        upload.array('mediaFiles', 30)(req, res, next);
        return;
      }
      next();
    },
    (req, res) => {
      try {
        const user = resolveRequestUser(req, res);
        if (!user) return;

        const uploadedFiles = Array.isArray(req.files)
          ? (req.files as Express.Multer.File[])
          : [];
        const rawBody = req.body?.payload
          ? JSON.parse(String(req.body.payload))
          : req.body ?? {};

        const rawItems: any[] = Array.isArray(rawBody?.items)
          ? rawBody.items
          : [];
        if (rawItems.length === 0) {
          res
            .status(400)
            .json({ error: 'Add at least one post to schedule in a batch.' });
          return;
        }
        if (rawItems.length > 30) {
          res
            .status(400)
            .json({ error: 'Batches support up to 30 posts at a time.' });
          return;
        }

        const wsId = resolveUserWorkspaceId(user, rawBody?.workspaceId);
        const ws = store.getWorkspaceById(wsId);
        const callerRole = resolveEffectiveWorkspaceRole(req, user, wsId);
        const batchLifecycle: JobLifecycle =
          rawBody?.lifecycle === 'draft' ? 'draft' : 'scheduled';
        const holdForApproval =
          Boolean(ws?.requireApproval) ||
          callerRole === 'editor' ||
          Boolean(rawBody?.holdForApproval);

        if (batchLifecycle !== 'draft') {
          const ownerId = ws?.ownerUserId || user.id;
          const usage = store.getPlanUsage(ownerId, wsId);
          if (
            usage.maxPostsPerMonth !== null &&
            usage.postsThisMonth + rawItems.length > usage.maxPostsPerMonth
          ) {
            const remaining = Math.max(
              0,
              usage.maxPostsPerMonth - usage.postsThisMonth
            );
            res.status(402).json({
              code: 'PLAN_LIMIT_REACHED',
              requiredTier: 'creator',
              error: `Starter includes ${usage.maxPostsPerMonth} monthly posts (${remaining} left), and this batch has ${rawItems.length} posts. Upgrade to Creator ($12/mo) for unlimited batch scheduling.`,
            });
            return;
          }
        }

        const linkedAccounts = store.getPublicAccounts(wsId);
        const linkedGroups = new Set(linkedAccounts.map((a) => a.platformGroup));
        const createdJobs: PublishJob[] = [];

        for (let idx = 0; idx < rawItems.length; idx++) {
          const item = rawItems[idx] ?? {};
          const now = new Date().toISOString();

          const fileIndex =
            typeof item.fileIndex === 'number' &&
            item.fileIndex >= 0 &&
            item.fileIndex < uploadedFiles.length
              ? item.fileIndex
              : undefined;
          const attachedFile =
            fileIndex !== undefined ? uploadedFiles[fileIndex] : undefined;

          const isUploadedVideo = Boolean(
            attachedFile && attachedFile.mimetype.startsWith('video/')
          );
          const isUploadedImage = Boolean(
            attachedFile && attachedFile.mimetype.startsWith('image/')
          );

          const videoMeta: VideoAssetMeta | null = item.videoMeta
            ? {
                fileName:
                  attachedFile?.originalname ||
                  item.videoMeta.fileName ||
                  `batch-video-${idx + 1}.mp4`,
                mimeType:
                  attachedFile?.mimetype ||
                  item.videoMeta.mimeType ||
                  'video/mp4',
                fileSizeBytes:
                  attachedFile?.size ?? item.videoMeta.fileSizeBytes ?? 0,
                width: Number(item.videoMeta.width) || 1080,
                height: Number(item.videoMeta.height) || 1920,
                durationSec: Number(item.videoMeta.durationSec) || 30,
                isSamplePreset: Boolean(item.videoMeta.isSamplePreset),
                edits: item.videoMeta.edits,
              }
            : isUploadedVideo && attachedFile
            ? {
                fileName: attachedFile.originalname,
                mimeType: attachedFile.mimetype || 'video/mp4',
                fileSizeBytes: attachedFile.size,
                width: 1080,
                height: 1920,
                durationSec: 30,
              }
            : null;

          const photosMeta: PhotoAssetMeta[] = Array.isArray(item.photosMeta)
            ? item.photosMeta.slice(0, MAX_CAROUSEL_PHOTOS).map((p: any, pIdx: number) => ({
                id: p?.id || `ph_${Date.now()}_${idx}_${pIdx}`,
                fileName: p?.fileName || `photo_${pIdx + 1}.jpg`,
                mimeType: p?.mimeType || 'image/jpeg',
                width: Number(p?.width) || 1080,
                height: Number(p?.height) || 1350,
                isSamplePreset: Boolean(p?.isSamplePreset),
                sampleTint: p?.sampleTint,
                sampleLabel: p?.sampleLabel,
              }))
            : isUploadedImage && attachedFile
            ? [
                {
                  id: `ph_${Date.now()}_${idx}`,
                  fileName: attachedFile.originalname,
                  mimeType: attachedFile.mimetype || 'image/jpeg',
                  fileSizeBytes: attachedFile.size,
                  width: 1080,
                  height: 1350,
                },
              ]
            : [];

          const postKind = detectPostKind(videoMeta, photosMeta);
          const master: MasterDraft = {
            title: String(item.master?.title ?? item.title ?? ''),
            caption: String(item.master?.caption ?? item.caption ?? ''),
            hashtags: String(item.master?.hashtags ?? item.hashtags ?? ''),
            firstComment:
              item.master?.firstComment ?? item.firstComment
                ? String(item.master?.firstComment ?? item.firstComment)
                : undefined,
          };

          if (
            postKind === 'text' &&
            !master.caption.trim() &&
            !master.title.trim()
          ) {
            continue;
          }

          const overrides = createDefaultOverrides();
          if (item.overrides) {
            Object.assign(overrides, item.overrides);
          } else {
            const rec = recommendPlatformsForPost(videoMeta, photosMeta);
            const requestedPlatforms: PlatformId[] | null = Array.isArray(
              rawBody?.platforms
            )
              ? rawBody.platforms
              : null;

            for (const pid of PLATFORM_ORDER) {
              const spec = PLATFORM_SPECS[pid];
              const formatSupported =
                postKind === 'video'
                  ? spec.supportsVideo
                  : postKind === 'photo'
                  ? spec.supportsPhotos
                  : spec.supportsTextOnly;
              const isLinked =
                linkedGroups.size === 0 || linkedGroups.has(spec.accountGroup);

              if (requestedPlatforms) {
                overrides[pid].enabled =
                  requestedPlatforms.includes(pid) &&
                  formatSupported &&
                  isLinked;
              } else {
                overrides[pid].enabled = Boolean(rec[pid]) && isLinked;
              }
            }
          }

          let enabledPlatforms = PLATFORM_ORDER.filter(
            (id) => overrides[id]?.enabled
          );
          if (enabledPlatforms.length === 0) {
            // Fallback to any format-compatible platform if none matched
            for (const pid of PLATFORM_ORDER) {
              const spec = PLATFORM_SPECS[pid];
              const ok =
                postKind === 'video'
                  ? spec.supportsVideo
                  : postKind === 'photo'
                  ? spec.supportsPhotos
                  : spec.supportsTextOnly;
              if (ok) {
                overrides[pid].enabled = true;
              }
            }
            enabledPlatforms = PLATFORM_ORDER.filter(
              (id) => overrides[id]?.enabled
            );
          }

          // Auto-trim caption onto customCaption if a short-limit platform (like X / Bluesky) exceeds limit
          for (const pid of enabledPlatforms) {
            const maxC = PLATFORM_SPECS[pid].maxCaptionChars;
            const resolved = resolvePlatformText(
              pid,
              master,
              overrides[pid],
              videoMeta ?? undefined
            );
            if (resolved.combinedCaptionOrDescription.length > maxC) {
              overrides[pid] = {
                ...overrides[pid],
                useCustomText: true,
                customTitle: master.title.slice(0, 90),
                customCaption: `${master.caption.slice(0, Math.max(40, maxC - 24)).trimEnd()}…`,
                customHashtags: '',
                customFirstComment: master.firstComment,
              };
            }
          }

          const itemLifecycle: JobLifecycle =
            item.lifecycle === 'draft' ? 'draft' : batchLifecycle;
          const itemScheduledAt =
            itemLifecycle === 'scheduled'
              ? String(
                  item.scheduledAt ||
                    new Date(Date.now() + (idx + 1) * 24 * 3600 * 1000).toISOString()
                )
              : undefined;

          const results: PublishJob['results'] = {};
          for (const pid of enabledPlatforms) {
            const acc = store.getAccountByGroup(
              PLATFORM_SPECS[pid].accountGroup,
              wsId
            );
            results[pid] = {
              platformId: pid,
              status: 'queued',
              progressPct: 0,
              statusMessage:
                itemLifecycle === 'draft' ? 'Saved in draft' : 'Scheduled',
              mode: acc?.mode === 'live' ? 'live' : 'sandbox',
              updatedAt: now,
            };
          }

          const jobId = `job_${Date.now()}_${idx}_${crypto
            .randomBytes(2)
            .toString('hex')}`;

          const approval: PostApprovalState | undefined = holdForApproval
            ? {
                shareToken: `rev_${crypto.randomBytes(12).toString('hex')}`,
                status: 'pending',
                updatedAt: now,
                comments: [],
              }
            : undefined;

          const created = store.createJob(
            {
              id: jobId,
              workspaceId: wsId,
              createdAt: now,
              updatedAt: now,
              lifecycle: itemLifecycle,
              scheduledAt: itemScheduledAt,
              postKind,
              createdByName: user.name,
              createdByRole: callerRole,
              video: videoMeta,
              photos: photosMeta.length > 0 ? photosMeta : undefined,
              master,
              overrides,
              results,
              approval,
            },
            {
              videoPath: isUploadedVideo ? attachedFile?.path : undefined,
              photoPaths:
                isUploadedImage && attachedFile ? [attachedFile.path] : undefined,
            }
          );

          createdJobs.push(created);
        }

        res.status(201).json({ jobs: createdJobs });
      } catch (err: any) {
        res.status(500).json({
          error: err?.message || 'Failed to create batch schedule.',
        });
      }
    }
  );

  app.get('/api/jobs', (req, res) => {
    const wsId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId
        ? req.query.workspaceId
        : undefined;
    res.json({ jobs: store.getJobs(wsId) });
  });

  app.get('/api/jobs/:id', (req, res) => {
    const job = store.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ job });
  });

  // Granular Retry (retry one failed platform or all failed platforms without re-uploading!)
  app.post('/api/jobs/:id/retry', (req, res) => {
    const job = store.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const requestedPlatform = req.body?.platformId as PlatformId | undefined;
    const targets: PlatformId[] = requestedPlatform
      ? [requestedPlatform]
      : (Object.keys(job.results) as PlatformId[]).filter(
          (id) => job.results[id]?.status === 'failed'
        );

    if (targets.length === 0) {
      res.status(400).json({ error: 'No failed platforms to retry.' });
      return;
    }

    for (const id of targets) {
      store.updateJobResult(job.id, id, (prev) => ({
        ...prev,
        status: 'queued',
        progressPct: 5,
        statusMessage: `Retrying ${PLATFORM_SPECS[id].shortName}...`,
        error: undefined,
        updatedAt: new Date().toISOString(),
      }));
      void executePlatformPublish(job.id, id);
    }

    res.json({ job: store.getJob(job.id) });
  });

  // Trigger a scheduled or draft job immediately
  app.post('/api/jobs/:id/publish-now', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;

    const job = store.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const wsId = job.workspaceId || DEFAULT_WORKSPACE_ID;
    const callerRole = resolveEffectiveWorkspaceRole(req, user, wsId);
    if (callerRole === 'editor') {
      res.status(403).json({
        error:
          'Editors cannot publish directly. Ask an Owner, Admin, or Approver to sign off.',
      });
      return;
    }
    if (job.approval?.status === 'changes_requested') {
      res.status(400).json({
        error:
          'Changes were requested on this post. Approve the updated post before publishing.',
      });
      return;
    }

    const enabled = PLATFORM_ORDER.filter((id) => job.overrides[id]?.enabled);
    const now = new Date().toISOString();
    const results: PublishJob['results'] = {};
    for (const id of enabled) {
      const acc = store.getAccountByGroup(
        PLATFORM_SPECS[id].accountGroup,
        wsId
      );
      results[id] = {
        platformId: id,
        status: 'queued',
        progressPct: 5,
        statusMessage: `Queued for ${PLATFORM_SPECS[id].shortName}...`,
        mode: acc?.mode === 'live' ? 'live' : 'sandbox',
        updatedAt: now,
      };
    }

    const updated = store.patchJob(job.id, {
      lifecycle: 'active',
      scheduledAt: undefined,
      results,
    });

    for (const id of enabled) {
      void executePlatformPublish(job.id, id);
    }

    res.json({ job: updated });
  });

  // Update schedule time or move scheduled post back to draft
  app.patch('/api/jobs/:id', (req, res) => {
    const existing = store.getJob(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const { lifecycle, scheduledAt } = req.body ?? {};
    const nextLifecycle: JobLifecycle =
      lifecycle === 'draft' || lifecycle === 'scheduled' || lifecycle === 'active'
        ? lifecycle
        : existing.lifecycle ?? 'active';

    let nextResults = existing.results;
    if (
      nextLifecycle === 'scheduled' &&
      Object.keys(existing.results ?? {}).length === 0
    ) {
      const wsId = existing.workspaceId || DEFAULT_WORKSPACE_ID;
      const enabled = PLATFORM_ORDER.filter(
        (id) => existing.overrides[id]?.enabled
      );
      const now = new Date().toISOString();
      nextResults = {};
      for (const id of enabled) {
        const acc = store.getAccountByGroup(
          PLATFORM_SPECS[id].accountGroup,
          wsId
        );
        nextResults[id] = {
          platformId: id,
          status: 'queued',
          progressPct: 0,
          statusMessage: 'Scheduled',
          mode: acc?.mode === 'live' ? 'live' : 'sandbox',
          updatedAt: now,
        };
      }
    }

    const updated = store.patchJob(req.params.id, {
      ...(lifecycle ? { lifecycle: nextLifecycle } : {}),
      ...(scheduledAt !== undefined
        ? { scheduledAt: scheduledAt === null ? undefined : String(scheduledAt) }
        : {}),
      results: nextResults,
    });
    res.json({ job: updated });
  });

  app.delete('/api/jobs/:id', (req, res) => {
    const ok = store.deleteJob(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ ok: true });
  });

  // In-App Team Approval Sign-Off (Owner / Admin / Approver)
  app.post('/api/jobs/:id/team-decision', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;

    const job = store.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }

    const wsId = job.workspaceId || DEFAULT_WORKSPACE_ID;
    const callerRole = resolveEffectiveWorkspaceRole(req, user, wsId);
    if (callerRole === 'editor') {
      res.status(403).json({
        error:
          'Editors cannot approve their own posts. Switch to or ask an Approver, Admin, or Owner.',
      });
      return;
    }

    const { decision, comment, reviewerName } = req.body ?? {};
    if (decision !== 'approved' && decision !== 'changes_requested') {
      res
        .status(400)
        .json({ error: 'Decision must be approved or changes_requested.' });
      return;
    }

    const updated = store.submitTeamJobDecision(job.id, {
      reviewerName: String(reviewerName ?? '').trim() || user.name,
      decision,
      comment: comment ? String(comment) : undefined,
    });
    res.json({ job: updated });
  });

  // --- 1-CLICK SHAREABLE CLIENT APPROVAL LINKS ---
  app.post('/api/jobs/:id/share-review', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;

    const job = store.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }

    const usage = store.getPlanUsage(user.id, job.workspaceId);
    if (!usage.allowsClientApprovals) {
      res.status(402).json({
        code: 'PLAN_LIMIT_REACHED',
        requiredTier: 'studio',
        error:
          'Shareable client approval links are included on the Studio plan ($29/mo).',
      });
      return;
    }

    const updated = store.ensureJobApprovalLink(job.id);
    if (!updated?.approval) {
      res.status(500).json({ error: 'Could not create review link.' });
      return;
    }
    res.json({
      job: updated,
      shareToken: updated.approval.shareToken,
    });
  });

  // Public No-Login Client Review Portal Endpoints
  app.get('/api/review/:token', (req, res) => {
    const review = store.getPublicReviewByToken(String(req.params.token || ''));
    if (!review) {
      res.status(404).json({ error: 'Review link expired or not found.' });
      return;
    }
    res.json({ review });
  });

  app.post('/api/review/:token/decision', (req, res) => {
    const { reviewerName, decision, comment } = req.body ?? {};
    if (decision !== 'approved' && decision !== 'changes_requested') {
      res
        .status(400)
        .json({ error: 'Decision must be approved or changes_requested.' });
      return;
    }
    if (decision === 'changes_requested' && !String(comment ?? '').trim()) {
      res.status(400).json({
        error: 'Add a short note so the creator knows what to adjust.',
      });
      return;
    }
    const updated = store.submitClientReviewDecision(
      String(req.params.token || ''),
      {
        reviewerName: String(reviewerName ?? '').trim() || 'Client Reviewer',
        decision,
        comment: comment ? String(comment) : undefined,
      }
    );
    if (!updated) {
      res.status(404).json({ error: 'Review link expired or not found.' });
      return;
    }

    const reviewedJob = store.getJob(updated.job.id);
    const reviewedWs = reviewedJob?.workspaceId
      ? store.getWorkspaceById(reviewedJob.workspaceId)
      : null;
    const wsOwner = reviewedWs?.ownerUserId
      ? store.getUserById(reviewedWs.ownerUserId)
      : store.getDefaultUser();
    if (wsOwner?.email) {
      const label =
        decision === 'approved' ? 'Approved' : 'Requested changes on';
      void sendTransactionalEmail({
        toEmail: wsOwner.email,
        subject: `Client review: ${
          String(reviewerName || 'Client').trim()
        } ${label.toLowerCase()} your post`,
        category: 'client_review',
        textBody: `${
          String(reviewerName || 'Client').trim()
        } marked "${
          updated.job.master.title ||
          updated.job.master.caption.slice(0, 48) ||
          'Queued post'
        }" as ${decision.replace('_', ' ')}${
          comment ? ` — "${String(comment).trim()}"` : ''
        }.`,
      }).then((item) => store.recordOutboxEmail(item));
    }

    res.json({ review: updated });
  });

  // --- TRACK 1: LINK-IN-BIO (/u/:slug) & CLICK ATTRIBUTION ---
  app.get('/api/workspaces/:id/bio', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    if (!store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }
    res.json({ config: store.getBioPageConfig(wsId) });
  });

  app.put('/api/workspaces/:id/bio', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    if (!store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }
    const role = resolveEffectiveWorkspaceRole(req, user, wsId);
    if (role === 'approver') {
      res.status(403).json({
        error: 'Approvers can review posts, not edit Link-in-Bio settings.',
      });
      return;
    }

    try {
      const updated = store.updateBioPageConfig(wsId, req.body ?? {});
      res.json({ config: updated });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Could not update bio page.' });
    }
  });

  app.get('/api/bio/:slug', (req, res) => {
    const trackView = req.query.trackView === '1';
    const bio = store.getPublicBioPageBySlug(
      String(req.params.slug || ''),
      trackView
    );
    if (!bio) {
      res.status(404).json({ error: 'Bio page not found.' });
      return;
    }
    res.json({ bio });
  });

  app.post('/api/bio/:slug/click', (req, res) => {
    const { targetType, targetId } = req.body ?? {};
    if (
      (targetType !== 'link' && targetType !== 'post') ||
      !String(targetId || '').trim()
    ) {
      res.status(400).json({ error: 'targetType and targetId are required.' });
      return;
    }
    const recorded = store.recordBioPageClick(
      String(req.params.slug || ''),
      targetType,
      String(targetId)
    );
    if (!recorded) {
      res.status(404).json({ error: 'Bio page not found.' });
      return;
    }
    res.json({ ok: true, ...recorded });
  });

  // --- TRACK 2: UNIFIED COMMENTS INBOX & QUICK REPLIES ---
  app.get('/api/inbox', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = resolveUserWorkspaceId(user, req.query.workspaceId);
    const rawFilter = String(req.query.filter || 'all');
    const filter =
      rawFilter === 'unanswered' ||
      rawFilter === 'replied' ||
      rawFilter === 'archived'
        ? rawFilter
        : 'all';
    res.json(store.getInboxComments(wsId, filter));
  });

  app.post('/api/inbox/sync', async (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = resolveUserWorkspaceId(user, req.body?.workspaceId);
    const synced = await store.syncWorkspaceInbox(wsId);
    res.json(synced);
  });

  app.post('/api/inbox/:id/reply', async (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const body = String(req.body?.body ?? '').trim();
    if (!body) {
      res.status(400).json({ error: 'Write a reply message first.' });
      return;
    }
    try {
      const updated = await store.replyToInboxComment(req.params.id, body);
      if (!updated) {
        res.status(404).json({ error: 'Comment not found.' });
        return;
      }
      res.json({ comment: updated });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Could not send reply.' });
    }
  });

  app.patch('/api/inbox/:id', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const status = req.body?.status;
    if (
      status !== 'unanswered' &&
      status !== 'replied' &&
      status !== 'archived'
    ) {
      res.status(400).json({ error: 'Invalid comment status.' });
      return;
    }
    const updated = store.updateInboxCommentStatus(req.params.id, status);
    if (!updated) {
      res.status(404).json({ error: 'Comment not found.' });
      return;
    }
    res.json({ comment: updated });
  });

  // --- TRACK 3: URL / RSS IMPORTER & EVERGREEN QUEUE RECYCLING ---
  app.post('/api/import/url', async (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const rawUrl = String(req.body?.url ?? '').trim();
    if (!rawUrl) {
      res.status(400).json({ error: 'Paste an article, product, or video URL.' });
      return;
    }
    try {
      const preview = await fetchAndExtractUrl(rawUrl);
      res.json({ preview });
    } catch (err: any) {
      res.status(400).json({
        error: err?.message || 'Could not extract metadata from that URL.',
      });
    }
  });

  app.post('/api/import/rss', async (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const rawUrl = String(req.body?.feedUrl ?? '').trim();
    if (!rawUrl) {
      res.status(400).json({ error: 'Paste an RSS or Atom feed URL.' });
      return;
    }
    try {
      const feed = await fetchAndExtractRss(rawUrl);
      res.json({ feed });
    } catch (err: any) {
      res.status(400).json({
        error: err?.message || 'Could not read RSS/Atom feed.',
      });
    }
  });

  app.post('/api/jobs/:id/evergreen', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const job = store.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    const updated = store.setJobEvergreen(
      job.id,
      Boolean(req.body?.isEvergreen),
      Number(req.body?.intervalDays) || 14
    );
    res.json({ job: updated });
  });

  app.post('/api/workspaces/:id/fill-evergreen', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    if (!store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    const ws = store.getWorkspaceById(wsId);
    const ownerId = ws?.ownerUserId || user.id;
    const usage = store.getPlanUsage(ownerId, wsId);
    if (
      usage.maxPostsPerMonth !== null &&
      usage.postsThisMonth >= usage.maxPostsPerMonth
    ) {
      res.status(402).json({
        code: 'PLAN_LIMIT_REACHED',
        requiredTier: 'creator',
        error:
          'Evergreen calendar auto-fill requires available monthly post slots or Creator ($12/mo).',
      });
      return;
    }

    const daysAhead = Math.min(21, Math.max(3, Number(req.body?.daysAhead) || 7));
    const created = store.fillOpenSlotsWithEvergreen(wsId, daysAhead);
    res.json({ created, count: created.length });
  });

  // --- TRACK 4: LAUNCH READINESS & PRODUCTION SPA STATIC SERVING ---
  app.get('/api/launch-readiness', (req, res) => {
    const origin = `${req.protocol}://${req.get('host')}`;
    res.json({ readiness: buildLaunchReadinessReport(origin) });
  });

  // --- FOUNDER ADMIN CONSOLE & PROMO / BETA ACCESS CODES ---
  const requireFounderAdmin = (
    req: express.Request,
    res: express.Response
  ): AuthUser | null => {
    const user = resolveRequestUser(req, res);
    if (!user) return null;
    if (!user.isFounderAdmin) {
      res
        .status(403)
        .json({ error: 'Founder admin permissions are required.' });
      return null;
    }
    return user;
  };

  app.get('/api/admin/overview', (req, res) => {
    if (!requireFounderAdmin(req, res)) return;
    res.json({ overview: store.getAdminOverview() });
  });

  app.patch('/api/admin/users/:id/plan', (req, res) => {
    if (!requireFounderAdmin(req, res)) return;
    const rawTier = req.body?.planTier;
    const planTier: PlanTierId =
      rawTier === 'creator' || rawTier === 'studio' || rawTier === 'free'
        ? rawTier
        : 'free';
    const interval: BillingInterval =
      req.body?.billingInterval === 'annual' ? 'annual' : 'monthly';
    const updated = store.updateUserPlan(req.params.id, planTier, interval);
    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user: updated, overview: store.getAdminOverview() });
  });

  app.post('/api/admin/promo-codes', (req, res) => {
    if (!requireFounderAdmin(req, res)) return;
    try {
      const { code, grantTier, billingInterval, maxUses, note } =
        req.body ?? {};
      const promo = store.createPromoCode({
        code: String(code ?? ''),
        grantTier: grantTier === 'studio' ? 'studio' : 'creator',
        billingInterval: billingInterval === 'annual' ? 'annual' : 'monthly',
        maxUses: Number(maxUses) || 50,
        note: note ? String(note) : undefined,
      });
      res.status(201).json({ promo, promoCodes: store.getPromoCodes() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Could not create promo code.' });
    }
  });

  app.delete('/api/admin/promo-codes/:code', (req, res) => {
    if (!requireFounderAdmin(req, res)) return;
    store.deletePromoCode(req.params.code);
    res.json({ ok: true, promoCodes: store.getPromoCodes() });
  });

  app.post('/api/billing/redeem-promo', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    try {
      const { user: updatedUser, promo } = store.redeemPromoCode(
        user.id,
        String(req.body?.code ?? '')
      );
      const wsId = resolveUserWorkspaceId(updatedUser, req.body?.workspaceId);
      const usage = store.getPlanUsage(updatedUser.id, wsId);
      res.json({ user: updatedUser, usage, promo });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Could not redeem promo code.' });
    }
  });

  // --- STUDIO REST API KEYS & PUBLIC AUTOMATION API (/api/v1/*) ---
  app.get('/api/workspaces/:id/api-keys', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    if (!store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }
    res.json({ apiKeys: store.listWorkspaceApiKeys(wsId) });
  });

  app.post('/api/workspaces/:id/api-keys', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    const ws = store.getWorkspaceById(wsId);
    if (!ws || !store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    const ownerId = ws.ownerUserId || user.id;
    const usage = store.getPlanUsage(ownerId, wsId);
    if (!usage.allowsClientApprovals) {
      res.status(402).json({
        code: 'PLAN_LIMIT_REACHED',
        requiredTier: 'studio',
        error:
          'REST API keys & Zapier/Make automation are included on Studio ($29/mo).',
      });
      return;
    }

    const created = store.createWorkspaceApiKey({
      workspaceId: wsId,
      ownerUserId: ownerId,
      label: String(req.body?.label ?? 'Zapier / Make Automation'),
    });
    res.status(201).json({
      apiKey: created.record,
      secretKey: created.secretKey,
      apiKeys: store.listWorkspaceApiKeys(wsId),
    });
  });

  app.delete('/api/workspaces/:id/api-keys/:keyId', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    if (!store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }
    store.revokeWorkspaceApiKey(req.params.keyId, wsId);
    res.json({ ok: true, apiKeys: store.listWorkspaceApiKeys(wsId) });
  });

  app.post('/api/v1/posts', async (req, res) => {
    const bearer = String(req.headers.authorization || '').startsWith('Bearer ')
      ? String(req.headers.authorization).slice('Bearer '.length).trim()
      : '';
    const headerKey = String(req.headers['x-api-key'] || '').trim();
    const rawKey = headerKey || bearer;
    const auth = store.authenticateApiKey(rawKey);
    if (!auth) {
      res.status(401).json({
        error:
          'Valid Studio API key required (Authorization: Bearer omni_live_... or X-API-Key).',
      });
      return;
    }

    try {
      let title = String(req.body?.title ?? '').trim();
      let caption = String(req.body?.caption ?? '').trim();
      let hashtags = String(req.body?.hashtags ?? '').trim();
      let firstComment = req.body?.firstComment
        ? String(req.body.firstComment).trim()
        : undefined;

      if (req.body?.url && !caption) {
        const extracted = await fetchAndExtractUrl(String(req.body.url));
        title = title || extracted.title;
        caption = extracted.suggestedCaption;
        hashtags = hashtags || extracted.suggestedHashtags;
        firstComment = firstComment || extracted.suggestedFirstComment;
      }

      if (!caption && !title) {
        res.status(400).json({
          error: 'Provide caption text or a url to extract.',
        });
        return;
      }

      const rawLifecycle = req.body?.lifecycle;
      const lifecycle: JobLifecycle =
        rawLifecycle === 'draft' ||
        rawLifecycle === 'active' ||
        rawLifecycle === 'scheduled'
          ? rawLifecycle
          : req.body?.scheduledAt
          ? 'scheduled'
          : 'draft';

      const scheduledAt =
        lifecycle === 'scheduled'
          ? String(
              req.body?.scheduledAt ||
                new Date(Date.now() + 24 * 3600 * 1000).toISOString()
            )
          : undefined;

      const overrides = createDefaultOverrides();
      const rec = recommendPlatformsForPost(null, []);
      const linked = new Set(
        store.getPublicAccounts(auth.workspaceId).map((a) => a.platformGroup)
      );
      for (const pid of PLATFORM_ORDER) {
        overrides[pid].enabled =
          Boolean(rec[pid]) &&
          (linked.size === 0 || linked.has(PLATFORM_SPECS[pid].accountGroup));
      }

      const enabled = PLATFORM_ORDER.filter((pid) => overrides[pid]?.enabled);
      const now = new Date().toISOString();
      const results: PublishJob['results'] = {};
      for (const pid of enabled) {
        const acc = store.getAccountByGroup(
          PLATFORM_SPECS[pid].accountGroup,
          auth.workspaceId
        );
        results[pid] = {
          platformId: pid,
          status: 'queued',
          progressPct: lifecycle === 'active' ? 5 : 0,
          statusMessage:
            lifecycle === 'draft'
              ? 'Saved via API'
              : lifecycle === 'scheduled'
              ? 'Scheduled via API'
              : 'Queued via API',
          mode: acc?.mode === 'live' ? 'live' : 'sandbox',
          updatedAt: now,
        };
      }

      const jobId = `job_api_${Date.now()}_${crypto
        .randomBytes(3)
        .toString('hex')}`;
      const created = store.createJob(
        {
          id: jobId,
          workspaceId: auth.workspaceId,
          createdAt: now,
          updatedAt: now,
          lifecycle,
          scheduledAt,
          postKind: 'text',
          createdByName: 'API Automation',
          isEvergreen: Boolean(req.body?.isEvergreen),
          video: null,
          master: {
            title,
            caption,
            hashtags,
            firstComment,
          },
          overrides,
          results,
        },
        {}
      );

      if (lifecycle === 'active') {
        for (const pid of enabled) {
          void executePlatformPublish(jobId, pid);
        }
      }

      res.status(201).json({ job: created });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'API post creation failed.' });
    }
  });

  // --- WORKSPACE MEDIA VAULT ---
  app.get('/api/workspaces/:id/vault', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    if (!store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }
    res.json({ assets: store.getMediaVaultAssets(wsId) });
  });

  app.post('/api/workspaces/:id/vault', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    if (!store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }
    const { kind, label, fileName, mimeType, width, height, durationSec, sampleTint } =
      req.body ?? {};
    const asset = store.createMediaVaultAsset({
      workspaceId: wsId,
      kind: kind === 'video' ? 'video' : 'photo',
      label: String(label || fileName || 'Saved brand asset'),
      fileName: String(
        fileName || (kind === 'video' ? 'vault-clip.mp4' : 'vault-slide.jpg')
      ),
      mimeType: String(
        mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg')
      ),
      width: Number(width) || 1080,
      height: Number(height) || (kind === 'video' ? 1920 : 1350),
      durationSec: durationSec ? Number(durationSec) : undefined,
      sampleTint: sampleTint ? String(sampleTint) : undefined,
    });
    res.status(201).json({
      asset,
      assets: store.getMediaVaultAssets(wsId),
    });
  });

  app.delete('/api/workspaces/:id/vault/:assetId', (req, res) => {
    const user = resolveRequestUser(req, res);
    if (!user) return;
    const wsId = req.params.id;
    if (!store.userCanAccessWorkspace(user.id, wsId)) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }
    store.deleteMediaVaultAsset(req.params.assetId, wsId);
    res.json({ ok: true, assets: store.getMediaVaultAssets(wsId) });
  });

  const staticWebDir =
    process.env.STATIC_WEB_DIR ||
    path.resolve(__dirname, '../../mobile/dist');
  if (fs.existsSync(path.join(staticWebDir, 'index.html'))) {
    app.use(express.static(staticWebDir));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/uploads/') ||
        req.path === '/privacy' ||
        req.path === '/terms'
      ) {
        next();
        return;
      }
      res.sendFile(path.join(staticWebDir, 'index.html'));
    });
  }

  return app;
}

export function runDueScheduledTick() {
  const due = store.getDueScheduledJobs(new Date().toISOString());
  for (const job of due) {
    const wsId = job.workspaceId || DEFAULT_WORKSPACE_ID;
    const enabled = PLATFORM_ORDER.filter((id) => job.overrides[id]?.enabled);
    const now = new Date().toISOString();
    const results: PublishJob['results'] = {};
    for (const id of enabled) {
      const acc = store.getAccountByGroup(
        PLATFORM_SPECS[id].accountGroup,
        wsId
      );
      results[id] = {
        platformId: id,
        status: 'queued',
        progressPct: 5,
        statusMessage: `Scheduled window reached — sending to ${PLATFORM_SPECS[id].shortName}...`,
        mode: acc?.mode === 'live' ? 'live' : 'sandbox',
        updatedAt: now,
      };
    }
    store.patchJob(job.id, {
      lifecycle: 'active',
      results,
    });
    for (const id of enabled) {
      void executePlatformPublish(job.id, id);
    }
  }
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 4000;
  const app = createApp();
  const timer = setInterval(runDueScheduledTick, 5000);
  timer.unref();
  app.listen(port, '0.0.0.0', () => {
    console.log(`OmniPost Relay Server listening on http://0.0.0.0:${port}`);
  });
}

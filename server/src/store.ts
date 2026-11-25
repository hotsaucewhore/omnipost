import crypto from 'crypto';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import {
  ACCOUNT_GROUPS,
  AccountGroupId,
  AdminOverviewSummary,
  ApprovalComment,
  AuthUser,
  BillingInterval,
  BioCustomLink,
  BioPageConfig,
  BioPostCard,
  BrandWorkspace,
  ConnectedAccount,
  ContentPreset,
  DEFAULT_USER_ID,
  DEFAULT_WORKSPACE_ID,
  detectPostKind,
  EmailOutboxItem,
  extractFirstUrl,
  InboxFilterStatus,
  MediaVaultAsset,
  MemberInviteStatus,
  PLAN_TIERS,
  PlanTierId,
  PlanUsageSummary,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PostApprovalState,
  PromoCodeRecord,
  PublicBioPagePayload,
  PublicReviewPayload,
  PublishJob,
  SocialCommentItem,
  SocialCommentReply,
  WORKSPACE_COLORS,
  WorkspaceApiKey,
  WorkspaceMember,
  WorkspaceRole,
} from '../../shared/platforms';
import { StoredAccountRecord } from './adapters/types';
import {
  createSeededCalendarPipelineJobs,
  createSeededPublishedJobs,
  generateInitialPostMetrics,
  refreshPostMetrics,
} from './analytics';
import {
  generateSessionToken,
  hashPassword,
  verifyPassword,
} from './auth';
import { isStripeLiveConfigured } from './billing';
import {
  createSeededInboxComments,
  fetchLiveBlueskyRepliesForJob,
  tryPublishLiveBlueskyReply,
} from './inbox';
import {
  isAccountTokenExpiring,
  requestProviderTokenRefresh,
} from './tokenRefresher';

export interface StoredJobFiles {
  videoPath?: string;
  verticalVideoPath?: string;
  photoPaths?: string[];
  thumbnailPath?: string;
}

export interface StoredUserRecord extends AuthUser {
  passwordHash: string;
}

const DATA_DIR = path.resolve(__dirname, '../data');
const SQLITE_FILE = path.join(DATA_DIR, 'omnipost.sqlite');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'db.json');
const MIGRATED_JSON_BACKUP = path.join(DATA_DIR, 'db.legacy.migrated.json');

function slugifyWorkspace(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 12) || 'brand'
  );
}

function toPublicUser(row: any): AuthUser {
  const id = String(row.id);
  const email = String(row.email);
  const configuredAdmin = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const isFounderAdmin =
    id === DEFAULT_USER_ID ||
    email === 'founder@omnipost.app' ||
    (Boolean(configuredAdmin) && email === configuredAdmin);
  return {
    id,
    email,
    name: String(row.name),
    planTier: (row.plan_tier as PlanTierId) || 'free',
    billingInterval: (row.billing_interval as BillingInterval) || 'monthly',
    stripeCustomerId: row.stripe_customer_id
      ? String(row.stripe_customer_id)
      : undefined,
    isFounderAdmin,
    createdAt: String(row.created_at),
  };
}

function rowToStoredAccount(row: any): StoredAccountRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id || DEFAULT_WORKSPACE_ID),
    platformGroup: row.platform_group as AccountGroupId,
    mode: row.mode === 'live' ? 'live' : 'sandbox',
    handle: String(row.handle),
    displayName: String(row.display_name),
    accessToken: row.access_token ? String(row.access_token) : undefined,
    refreshToken: row.refresh_token ? String(row.refresh_token) : undefined,
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    externalAccountId: row.external_account_id
      ? String(row.external_account_id)
      : undefined,
    connectedAt: String(row.connected_at),
    simulateFailure: Boolean(row.simulate_failure),
  };
}

function toPublicAccount(record: StoredAccountRecord): ConnectedAccount {
  const { accessToken, refreshToken: _rt, expiresAt: _exp, ...pub } = record;
  return {
    ...pub,
    accessTokenMasked: accessToken ? `${accessToken.slice(0, 6)}...` : undefined,
  };
}

function createDefaultFounderUser(now: string): StoredUserRecord {
  return {
    id: DEFAULT_USER_ID,
    email: 'founder@omnipost.app',
    name: 'Studio Founder',
    planTier: 'studio',
    billingInterval: 'monthly',
    passwordHash: hashPassword('omnipost123'),
    createdAt: now,
  };
}

function buildDemoAccountsForWorkspace(
  workspaceId: string,
  workspaceName: string,
  now: string,
  mode: 'all' | 'personal_subset' | 'free_starter' = 'all'
): StoredAccountRecord[] {
  const slug = slugifyWorkspace(workspaceName);
  const groups =
    mode === 'free_starter'
      ? ACCOUNT_GROUPS.filter((g) =>
          ['instagram', 'tiktok', 'x'].includes(g.id)
        )
      : mode === 'personal_subset'
      ? ACCOUNT_GROUPS.filter((g) =>
          ['tiktok', 'instagram', 'x', 'threads', 'bluesky'].includes(g.id)
        )
      : ACCOUNT_GROUPS;

  return groups.map((group) => {
    const isDefault = workspaceId === DEFAULT_WORKSPACE_ID;
    const handle = isDefault
      ? group.defaultSandboxHandle
      : group.id === 'bluesky'
      ? `@${slug}.bsky.social`
      : group.id === 'facebook' || group.id === 'linkedin'
      ? workspaceName
      : `@${slug}.${group.id.slice(0, 3)}`;

    return {
      id: `acc_sandbox_${workspaceId}_${group.id}`,
      workspaceId,
      platformGroup: group.id,
      mode: 'sandbox',
      handle,
      displayName: isDefault
        ? group.defaultSandboxName
        : `${workspaceName} (${group.name})`,
      connectedAt: now,
      simulateFailure: false,
    };
  });
}

export function createSeededPresets(now: string): ContentPreset[] {
  return [
    {
      id: 'preset_seed_ws_default_1',
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: 'Studio tags',
      hashtags: 'creatorstudio filmmaking behindthescenes gear',
      createdAt: now,
    },
    {
      id: 'preset_seed_ws_default_2',
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: 'Newsletter CTA (1st comment)',
      firstComment:
        'Full breakdown + project files in this week’s note -> https://studio.example.com/notes',
      createdAt: now,
    },
    {
      id: 'preset_seed_ws_default_3',
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: 'New episode drop',
      captionSnippet:
        'New episode is out today — here is the 60-second takeaway:',
      hashtags: 'podcast creatorclips interview',
      firstComment:
        'Watch the full episode here -> https://youtube.com/@CreatorStudioYT',
      createdAt: now,
    },
    {
      id: 'preset_seed_ws_personal_1',
      workspaceId: 'ws_personal',
      name: 'Build in public tags',
      hashtags: 'buildinpublic productdesign indiehacker',
      createdAt: now,
    },
    {
      id: 'preset_seed_ws_personal_2',
      workspaceId: 'ws_personal',
      name: 'Essay link (1st comment)',
      firstComment: 'Read the full essay -> https://notes.example.com',
      createdAt: now,
    },
  ];
}

class SqliteStore {
  private db: DatabaseSync;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    this.db = new DatabaseSync(SQLITE_FILE);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        plan_tier TEXT NOT NULL DEFAULT 'free',
        billing_interval TEXT NOT NULL DEFAULT 'monthly',
        stripe_customer_id TEXT,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        accent_color TEXT NOT NULL,
        require_approval INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_user_id);

      CREATE TABLE IF NOT EXISTS workspace_members (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        user_id TEXT,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'editor',
        status TEXT NOT NULL DEFAULT 'invited',
        invite_token TEXT,
        invited_by_name TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(workspace_id, email)
      );
      CREATE INDEX IF NOT EXISTS idx_ws_members_ws ON workspace_members(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_ws_members_email ON workspace_members(email);

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        platform_group TEXT NOT NULL,
        mode TEXT NOT NULL,
        handle TEXT NOT NULL,
        display_name TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        expires_at TEXT,
        external_account_id TEXT,
        connected_at TEXT NOT NULL,
        simulate_failure INTEGER NOT NULL DEFAULT 0,
        UNIQUE(workspace_id, platform_group)
      );
      CREATE INDEX IF NOT EXISTS idx_accounts_ws ON accounts(workspace_id);

      CREATE TABLE IF NOT EXISTS presets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        caption_snippet TEXT,
        hashtags TEXT,
        first_comment TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_presets_ws ON presets(workspace_id);

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        lifecycle TEXT NOT NULL DEFAULT 'active',
        scheduled_at TEXT,
        share_token TEXT UNIQUE,
        payload_json TEXT NOT NULL,
        files_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_ws_created ON jobs(workspace_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_scheduled ON jobs(lifecycle, scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_share_token ON jobs(share_token);

      CREATE TABLE IF NOT EXISTS bio_pages (
        workspace_id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bio_pages_slug ON bio_pages(slug);

      CREATE TABLE IF NOT EXISTS inbox_comments (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unanswered',
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inbox_ws_created ON inbox_comments(workspace_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS promo_codes (
        code TEXT PRIMARY KEY,
        grant_tier TEXT NOT NULL,
        billing_interval TEXT NOT NULL DEFAULT 'monthly',
        max_uses INTEGER NOT NULL DEFAULT 100,
        used_count INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS promo_redemptions (
        code TEXT NOT NULL,
        user_id TEXT NOT NULL,
        redeemed_at TEXT NOT NULL,
        PRIMARY KEY (code, user_id)
      );

      CREATE TABLE IF NOT EXISTS password_resets (
        email TEXT PRIMARY KEY,
        reset_code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS email_outbox (
        id TEXT PRIMARY KEY,
        to_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        category TEXT NOT NULL,
        preview_text TEXT NOT NULL,
        delivery_mode TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        label TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        last_used_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_ws ON api_keys(workspace_id);

      CREATE TABLE IF NOT EXISTS media_vault (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        duration_sec REAL,
        sample_tint TEXT,
        file_path TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_media_vault_ws ON media_vault(workspace_id, created_at DESC);
    `);

    this.ensureSchemaMigrations();
    this.bootstrapOrMigrate();
    this.ensureCalendarPipelineSeeded();
    this.ensureTeamMembersSeeded();
    this.ensureBioInboxAndEvergreenSeeded();
    this.ensureCommercialOpsAndVaultSeeded();
  }

  private ensureSchemaMigrations() {
    const wsCols = this.db
      .prepare('PRAGMA table_info(workspaces)')
      .all() as { name: string }[];
    if (!wsCols.some((c) => c.name === 'require_approval')) {
      this.db.exec(
        'ALTER TABLE workspaces ADD COLUMN require_approval INTEGER NOT NULL DEFAULT 0'
      );
    }
  }

  private ensureTeamMembersSeeded() {
    // Ensure every workspace owner has an explicit owner row in workspace_members
    const wsRows = this.db
      .prepare(
        `SELECT w.id, w.owner_user_id, w.created_at, u.email, u.name
         FROM workspaces w
         LEFT JOIN users u ON u.id = w.owner_user_id`
      )
      .all() as any[];

    for (const w of wsRows) {
      const ownerEmail = String(w.email || 'founder@omnipost.app').toLowerCase();
      const ownerName = String(w.name || 'Studio Founder');
      this.db
        .prepare(
          `INSERT OR IGNORE INTO workspace_members
            (id, workspace_id, user_id, email, name, role, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'owner', 'active', ?)`
        )
        .run(
          `mem_owner_${w.id}`,
          String(w.id),
          String(w.owner_user_id),
          ownerEmail,
          ownerName,
          String(w.created_at || new Date().toISOString())
        );
    }

    const flag = this.db
      .prepare("SELECT value FROM meta WHERE key = 'seeded_team_members_v1'")
      .get() as { value: string } | undefined;
    if (flag?.value === '1') return;

    const now = new Date().toISOString();
    this.runInTransaction(() => {
      const demoCollaborators: WorkspaceMember[] = [
        {
          id: 'mem_seed_devon',
          workspaceId: DEFAULT_WORKSPACE_ID,
          email: 'devon@creatorstudio.co',
          name: 'Devon Park',
          role: 'editor',
          status: 'active',
          invitedByName: 'Studio Founder',
          createdAt: now,
        },
        {
          id: 'mem_seed_maya',
          workspaceId: DEFAULT_WORKSPACE_ID,
          email: 'maya@creatorstudio.co',
          name: 'Maya Lin',
          role: 'approver',
          status: 'active',
          invitedByName: 'Studio Founder',
          createdAt: now,
        },
      ];

      for (const m of demoCollaborators) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO workspace_members
              (id, workspace_id, user_id, email, name, role, status, invited_by_name, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            m.id,
            m.workspaceId,
            m.userId ?? null,
            m.email,
            m.name,
            m.role,
            m.status,
            m.invitedByName ?? null,
            m.createdAt
          );
      }

      this.db
        .prepare(
          "INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded_team_members_v1', '1')"
        )
        .run();
    });
  }

  private ensureBioInboxAndEvergreenSeeded() {
    const flag = this.db
      .prepare(
        "SELECT value FROM meta WHERE key = 'seeded_bio_inbox_evergreen_v1'"
      )
      .get() as { value: string } | undefined;
    if (flag?.value === '1') return;

    const now = new Date().toISOString();
    this.runInTransaction(() => {
      // 1. Default Link-in-Bio page for Creator Studio & Personal Brand
      const defaultBio: BioPageConfig = {
        workspaceId: DEFAULT_WORKSPACE_ID,
        slug: 'creatorstudio',
        headline: 'Creator Studio',
        bio: 'Lighting setups, clean audio chains, and practical filmmaking notes.',
        theme: 'paper',
        customLinks: [
          {
            id: 'lnk_seed_1',
            label: 'Free Studio Lighting Diagram & Gear List',
            url: 'https://studio.example.com/lighting',
            clicks: 42,
          },
          {
            id: 'lnk_seed_2',
            label: 'Podcast Vocal EQ Preset Pack',
            url: 'https://studio.example.com/audio-preset',
            clicks: 29,
          },
          {
            id: 'lnk_seed_3',
            label: 'Weekly Creator Workflow Newsletter',
            url: 'https://studio.example.com/newsletter',
            clicks: 18,
          },
        ],
        postLinkUrls: {},
        postClicks: {
          job_seed_ws_default_1: 31,
          job_seed_ws_default_2: 19,
        },
        totalViews: 412,
        totalClicks: 139,
        updatedAt: now,
      };

      const personalBio: BioPageConfig = {
        workspaceId: 'ws_personal',
        slug: 'personal',
        headline: 'Personal Brand',
        bio: 'Product craft, calm software notes, and weekend sketches.',
        theme: 'graphite',
        customLinks: [
          {
            id: 'lnk_p_1',
            label: 'Essays on Calm Software Design',
            url: 'https://notes.example.com/calm-ui',
            clicks: 22,
          },
        ],
        postLinkUrls: {},
        postClicks: {},
        totalViews: 128,
        totalClicks: 22,
        updatedAt: now,
      };

      for (const cfg of [defaultBio, personalBio]) {
        const wsExists = this.db
          .prepare('SELECT id FROM workspaces WHERE id = ?')
          .get(cfg.workspaceId);
        if (wsExists) {
          this.db
            .prepare(
              `INSERT OR IGNORE INTO bio_pages (workspace_id, slug, payload_json, updated_at)
               VALUES (?, ?, ?, ?)`
            )
            .run(cfg.workspaceId, cfg.slug, JSON.stringify(cfg), now);
        }
      }

      // 2. Unified Inbox seeded comments
      for (const item of createSeededInboxComments()) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO inbox_comments (id, workspace_id, status, created_at, payload_json)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(
            item.id,
            item.workspaceId,
            item.status,
            item.createdAt,
            JSON.stringify(item)
          );
      }

      // 3. Mark one timeless published post as Evergreen out-of-the-box
      const evergreenCandidate = this.getJob('job_seed_ws_default_3');
      if (evergreenCandidate && !evergreenCandidate.isEvergreen) {
        evergreenCandidate.isEvergreen = true;
        evergreenCandidate.evergreenIntervalDays = 14;
        this.upsertJobRaw(evergreenCandidate);
      }

      this.db
        .prepare(
          "INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded_bio_inbox_evergreen_v1', '1')"
        )
        .run();
    });
  }

  private ensureCommercialOpsAndVaultSeeded() {
    const flag = this.db
      .prepare("SELECT value FROM meta WHERE key = 'seeded_ops_vault_v1'")
      .get() as { value: string } | undefined;
    if (flag?.value === '1') return;

    const now = new Date().toISOString();
    this.runInTransaction(() => {
      // Seed launch promo / beta access codes
      const promos: PromoCodeRecord[] = [
        {
          code: 'EARLYBIRD',
          grantTier: 'creator',
          billingInterval: 'monthly',
          maxUses: 100,
          usedCount: 0,
          note: 'Product Hunt / Early Creator launch access ($12 tier)',
          active: true,
          createdAt: now,
        },
        {
          code: 'AGENCY30',
          grantTier: 'studio',
          billingInterval: 'monthly',
          maxUses: 50,
          usedCount: 0,
          note: '30-day Studio agency partner access ($29 tier)',
          active: true,
          createdAt: now,
        },
      ];

      for (const p of promos) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO promo_codes
              (code, grant_tier, billing_interval, max_uses, used_count, note, active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            p.code,
            p.grantTier,
            p.billingInterval,
            p.maxUses,
            p.usedCount,
            p.note ?? null,
            p.active ? 1 : 0,
            p.createdAt
          );
      }

      // Seed reusable Brand Media Vault assets on Creator Studio
      const vaultSeeds: MediaVaultAsset[] = [
        {
          id: 'vault_seed_1',
          workspaceId: DEFAULT_WORKSPACE_ID,
          kind: 'photo',
          label: 'Brand Outro Slide · Follow CTA',
          fileName: 'brand-outro-4x5.jpg',
          mimeType: 'image/jpeg',
          width: 1080,
          height: 1350,
          sampleTint: '#252B29',
          createdAt: now,
        },
        {
          id: 'vault_seed_2',
          workspaceId: DEFAULT_WORKSPACE_ID,
          kind: 'photo',
          label: 'Gear List Spec Sheet Card',
          fileName: 'gear-spec-slide.jpg',
          mimeType: 'image/jpeg',
          width: 1080,
          height: 1350,
          sampleTint: '#3D342C',
          createdAt: now,
        },
        {
          id: 'vault_seed_3',
          workspaceId: DEFAULT_WORKSPACE_ID,
          kind: 'photo',
          label: 'Newsletter Subscribe End-Card',
          fileName: 'newsletter-cta-slide.jpg',
          mimeType: 'image/jpeg',
          width: 1080,
          height: 1350,
          sampleTint: '#2A3642',
          createdAt: now,
        },
        {
          id: 'vault_seed_4',
          workspaceId: DEFAULT_WORKSPACE_ID,
          kind: 'video',
          label: 'Overhead Desk B-Roll Loop (14s)',
          fileName: 'desk-broll-loop-9x16.mp4',
          mimeType: 'video/mp4',
          width: 1080,
          height: 1920,
          durationSec: 14,
          sampleTint: '#1F2322',
          createdAt: now,
        },
      ];

      for (const asset of vaultSeeds) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO media_vault
              (id, workspace_id, kind, label, file_name, mime_type, width, height, duration_sec, sample_tint, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            asset.id,
            asset.workspaceId,
            asset.kind,
            asset.label,
            asset.fileName,
            asset.mimeType,
            asset.width,
            asset.height,
            asset.durationSec ?? null,
            asset.sampleTint ?? null,
            asset.createdAt
          );
      }

      this.db
        .prepare(
          "INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded_ops_vault_v1', '1')"
        )
        .run();
    });
  }

  private ensureCalendarPipelineSeeded() {
    const flag = this.db
      .prepare("SELECT value FROM meta WHERE key = 'seeded_calendar_pipeline_v1'")
      .get() as { value: string } | undefined;
    if (flag?.value === '1') return;

    this.runInTransaction(() => {
      for (const job of createSeededCalendarPipelineJobs()) {
        const exists = this.db
          .prepare('SELECT id FROM jobs WHERE id = ?')
          .get(job.id);
        if (!exists) {
          this.upsertJobRaw(job, {});
        }
      }
      this.db
        .prepare(
          "INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded_calendar_pipeline_v1', '1')"
        )
        .run();
    });
  }

  private runInTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private insertUserRaw(u: StoredUserRecord) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO users
          (id, email, name, plan_tier, billing_interval, stripe_customer_id, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        u.id,
        u.email.toLowerCase(),
        u.name,
        u.planTier || 'free',
        u.billingInterval || 'monthly',
        u.stripeCustomerId ?? null,
        u.passwordHash,
        u.createdAt
      );
  }

  private insertWorkspaceRaw(w: BrandWorkspace) {
    const ownerId = w.ownerUserId || DEFAULT_USER_ID;
    this.db
      .prepare(
        `INSERT OR IGNORE INTO workspaces
          (id, owner_user_id, name, accent_color, require_approval, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        w.id,
        ownerId,
        w.name,
        w.accentColor,
        w.requireApproval ? 1 : 0,
        w.createdAt
      );

    const ownerRow = this.db
      .prepare('SELECT email, name FROM users WHERE id = ?')
      .get(ownerId) as { email?: string; name?: string } | undefined;

    this.db
      .prepare(
        `INSERT OR IGNORE INTO workspace_members
          (id, workspace_id, user_id, email, name, role, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'owner', 'active', ?)`
      )
      .run(
        `mem_owner_${w.id}`,
        w.id,
        ownerId,
        String(ownerRow?.email || 'founder@omnipost.app').toLowerCase(),
        String(ownerRow?.name || 'Studio Founder'),
        w.createdAt
      );
  }

  private upsertAccountRaw(a: StoredAccountRecord) {
    this.db
      .prepare(
        `INSERT INTO accounts
          (id, workspace_id, platform_group, mode, handle, display_name, access_token, refresh_token, expires_at, external_account_id, connected_at, simulate_failure)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, platform_group) DO UPDATE SET
           id = excluded.id,
           mode = excluded.mode,
           handle = excluded.handle,
           display_name = excluded.display_name,
           access_token = excluded.access_token,
           refresh_token = excluded.refresh_token,
           expires_at = excluded.expires_at,
           external_account_id = excluded.external_account_id,
           connected_at = excluded.connected_at,
           simulate_failure = excluded.simulate_failure`
      )
      .run(
        a.id,
        a.workspaceId || DEFAULT_WORKSPACE_ID,
        a.platformGroup,
        a.mode,
        a.handle,
        a.displayName,
        a.accessToken ?? null,
        a.refreshToken ?? null,
        a.expiresAt ?? null,
        a.externalAccountId ?? null,
        a.connectedAt,
        a.simulateFailure ? 1 : 0
      );
  }

  private insertPresetRaw(p: ContentPreset) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO presets
          (id, workspace_id, name, caption_snippet, hashtags, first_comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        p.id,
        p.workspaceId || DEFAULT_WORKSPACE_ID,
        p.name,
        p.captionSnippet ?? null,
        p.hashtags ?? null,
        p.firstComment ?? null,
        p.createdAt
      );
  }

  private upsertJobRaw(job: PublishJob, files?: StoredJobFiles) {
    const normalized: PublishJob = {
      ...job,
      workspaceId: job.workspaceId || DEFAULT_WORKSPACE_ID,
    };
    const postKind =
      normalized.postKind ?? detectPostKind(normalized.video, normalized.photos);
    for (const pid of PLATFORM_ORDER) {
      const res = normalized.results[pid];
      if (res && res.status === 'published' && !res.metrics) {
        res.metrics = generateInitialPostMetrics({
          jobId: normalized.id,
          platformId: pid,
          postKind,
          firstCommentPosted: res.firstCommentPosted,
          createdAtIso: normalized.createdAt,
        });
      }
    }

    const existingRow = this.db
      .prepare('SELECT files_json FROM jobs WHERE id = ?')
      .get(normalized.id) as { files_json: string } | undefined;
    const filesJson = files
      ? JSON.stringify(files)
      : existingRow?.files_json || '{}';

    this.db
      .prepare(
        `INSERT INTO jobs
          (id, workspace_id, created_at, updated_at, lifecycle, scheduled_at, share_token, payload_json, files_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           updated_at = excluded.updated_at,
           lifecycle = excluded.lifecycle,
           scheduled_at = excluded.scheduled_at,
           share_token = excluded.share_token,
           payload_json = excluded.payload_json,
           files_json = excluded.files_json`
      )
      .run(
        normalized.id,
        normalized.workspaceId!,
        normalized.createdAt,
        normalized.updatedAt ?? normalized.createdAt,
        normalized.lifecycle ?? 'active',
        normalized.scheduledAt ?? null,
        normalized.approval?.shareToken ?? null,
        JSON.stringify(normalized),
        filesJson
      );
  }

  private bootstrapOrMigrate() {
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM users')
      .get() as { cnt: number };
    if (Number(countRow?.cnt || 0) > 0) {
      return;
    }

    const now = new Date().toISOString();

    if (fs.existsSync(LEGACY_JSON_FILE)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(LEGACY_JSON_FILE, 'utf-8'));
        this.runInTransaction(() => {
          const users: StoredUserRecord[] =
            Array.isArray(legacy.users) && legacy.users.length > 0
              ? legacy.users
              : [createDefaultFounderUser(now)];
          if (!users.some((u) => u.id === DEFAULT_USER_ID)) {
            users.unshift(createDefaultFounderUser(now));
          }
          for (const u of users) this.insertUserRaw(u);

          if (Array.isArray(legacy.sessions)) {
            const stmt = this.db.prepare(
              'INSERT OR IGNORE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)'
            );
            for (const s of legacy.sessions) {
              stmt.run(s.token, s.userId, s.createdAt || now);
            }
          }

          const workspaces: BrandWorkspace[] =
            Array.isArray(legacy.workspaces) && legacy.workspaces.length > 0
              ? legacy.workspaces
              : [
                  {
                    id: DEFAULT_WORKSPACE_ID,
                    ownerUserId: DEFAULT_USER_ID,
                    name: 'Creator Studio',
                    accentColor: WORKSPACE_COLORS[0],
                    createdAt: now,
                  },
                  {
                    id: 'ws_personal',
                    ownerUserId: DEFAULT_USER_ID,
                    name: 'Personal Brand',
                    accentColor: WORKSPACE_COLORS[1],
                    createdAt: now,
                  },
                ];
          for (const w of workspaces) this.insertWorkspaceRaw(w);

          if (Array.isArray(legacy.accounts)) {
            for (const a of legacy.accounts) this.upsertAccountRaw(a);
          }

          const presets: ContentPreset[] =
            Array.isArray(legacy.presets) && legacy.presets.length > 0
              ? legacy.presets
              : createSeededPresets(now);
          for (const p of presets) this.insertPresetRaw(p);

          const jobs: PublishJob[] =
            Array.isArray(legacy.jobs) && legacy.jobs.length > 0
              ? legacy.jobs
              : createSeededPublishedJobs();
          const jobFilesMap: Record<string, StoredJobFiles> =
            legacy.jobFiles ?? {};
          for (const j of jobs) {
            this.upsertJobRaw(j, jobFilesMap[j.id] ?? {});
          }
        });

        try {
          fs.renameSync(LEGACY_JSON_FILE, MIGRATED_JSON_BACKUP);
        } catch {
          // Keep legacy file untouched if locked
        }
        return;
      } catch {
        // Fall through to clean initial seed if legacy JSON was malformed
      }
    }

    this.runInTransaction(() => {
      const founder = createDefaultFounderUser(now);
      this.insertUserRaw(founder);

      const wsDefault: BrandWorkspace = {
        id: DEFAULT_WORKSPACE_ID,
        ownerUserId: founder.id,
        name: 'Creator Studio',
        accentColor: WORKSPACE_COLORS[0],
        createdAt: now,
      };
      const wsPersonal: BrandWorkspace = {
        id: 'ws_personal',
        ownerUserId: founder.id,
        name: 'Personal Brand',
        accentColor: WORKSPACE_COLORS[1],
        createdAt: now,
      };
      this.insertWorkspaceRaw(wsDefault);
      this.insertWorkspaceRaw(wsPersonal);

      for (const acc of [
        ...buildDemoAccountsForWorkspace(
          wsDefault.id,
          wsDefault.name,
          now,
          'all'
        ),
        ...buildDemoAccountsForWorkspace(
          wsPersonal.id,
          wsPersonal.name,
          now,
          'personal_subset'
        ),
      ]) {
        this.upsertAccountRaw(acc);
      }

      for (const preset of createSeededPresets(now)) {
        this.insertPresetRaw(preset);
      }

      for (const job of createSeededPublishedJobs()) {
        this.upsertJobRaw(job, {});
      }
    });
  }

  getStorageInfo() {
    return {
      engine: 'sqlite-wal' as const,
      databaseFile: path.basename(SQLITE_FILE),
    };
  }

  // --- AUTH & BILLING ---
  getDefaultUser(): AuthUser {
    const row =
      this.db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(DEFAULT_USER_ID) ??
      this.db.prepare('SELECT * FROM users ORDER BY created_at ASC LIMIT 1').get();
    return toPublicUser(row);
  }

  getUserById(userId: string): AuthUser | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId);
    return row ? toPublicUser(row) : null;
  }

  getUserByStripeCustomerId(customerId: string): AuthUser | null {
    if (!customerId) return null;
    const row = this.db
      .prepare('SELECT * FROM users WHERE stripe_customer_id = ?')
      .get(customerId);
    return row ? toPublicUser(row) : null;
  }

  getUserByToken(token: string): AuthUser | null {
    const row = this.db
      .prepare(
        `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?`
      )
      .get(token);
    return row ? toPublicUser(row) : null;
  }

  createSessionForUser(userId: string): string {
    const token = generateSessionToken();
    this.db
      .prepare(
        'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)'
      )
      .run(token, userId, new Date().toISOString());
    return token;
  }

  revokeSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  registerUser(params: {
    name: string;
    email: string;
    password: string;
  }): { user: AuthUser; token: string; initialWorkspace: BrandWorkspace } {
    const cleanEmail = params.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Enter a valid email address.');
    }
    if (!params.password || params.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    const existing = this.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(cleanEmail);
    if (existing) {
      throw new Error(
        'An account with this email already exists. Sign in instead.'
      );
    }

    const now = new Date().toISOString();
    const cleanName = params.name.trim() || cleanEmail.split('@')[0];
    const userRecord: StoredUserRecord = {
      id: `usr_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
      email: cleanEmail,
      name: cleanName,
      planTier: 'free',
      billingInterval: 'monthly',
      passwordHash: hashPassword(params.password),
      createdAt: now,
    };

    const wsName = `${cleanName.split(' ')[0]}'s Brand`;
    const wsId = `ws_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const initialWorkspace: BrandWorkspace = {
      id: wsId,
      ownerUserId: userRecord.id,
      name: wsName,
      accentColor: WORKSPACE_COLORS[0],
      createdAt: now,
    };
    const token = generateSessionToken();

    this.runInTransaction(() => {
      this.insertUserRaw(userRecord);
      this.insertWorkspaceRaw(initialWorkspace);
      this.insertPresetRaw({
        id: `preset_${Date.now().toString(36)}_starter`,
        workspaceId: wsId,
        name: 'Brand CTA (1st comment)',
        firstComment: 'Learn more -> https://example.com',
        createdAt: now,
      });
      this.db
        .prepare(
          'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)'
        )
        .run(token, userRecord.id, now);
      // Claim any pending team workspace invitations matching this email
      this.db
        .prepare(
          `UPDATE workspace_members
           SET user_id = ?, status = 'active'
           WHERE email = ?`
        )
        .run(userRecord.id, cleanEmail);
    });

    const { passwordHash: _pw, ...pubUser } = userRecord;
    return {
      user: pubUser,
      token,
      initialWorkspace,
    };
  }

  loginUser(
    email: string,
    password: string
  ): { user: AuthUser; token: string } {
    const cleanEmail = email.trim().toLowerCase();
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(cleanEmail) as any;
    if (!row || !verifyPassword(password, String(row.password_hash))) {
      throw new Error('Incorrect email or password.');
    }
    this.db
      .prepare(
        `UPDATE workspace_members
         SET user_id = ?, status = 'active'
         WHERE email = ?`
      )
      .run(String(row.id), cleanEmail);
    const token = this.createSessionForUser(String(row.id));
    return { user: toPublicUser(row), token };
  }

  deleteUserById(userId: string) {
    if (userId === DEFAULT_USER_ID) return;
    this.runInTransaction(() => {
      const wsRows = this.db
        .prepare('SELECT id FROM workspaces WHERE owner_user_id = ?')
        .all(userId) as { id: string }[];
      for (const w of wsRows) {
        this.db.prepare('DELETE FROM accounts WHERE workspace_id = ?').run(w.id);
        this.db.prepare('DELETE FROM presets WHERE workspace_id = ?').run(w.id);
        this.db.prepare('DELETE FROM jobs WHERE workspace_id = ?').run(w.id);
        this.db
          .prepare('DELETE FROM workspace_members WHERE workspace_id = ?')
          .run(w.id);
        this.db.prepare('DELETE FROM bio_pages WHERE workspace_id = ?').run(w.id);
        this.db
          .prepare('DELETE FROM inbox_comments WHERE workspace_id = ?')
          .run(w.id);
        this.db.prepare('DELETE FROM api_keys WHERE workspace_id = ?').run(w.id);
        this.db
          .prepare('DELETE FROM media_vault WHERE workspace_id = ?')
          .run(w.id);
      }
      this.db
        .prepare('DELETE FROM promo_redemptions WHERE user_id = ?')
        .run(userId);
      this.db
        .prepare('DELETE FROM workspace_members WHERE user_id = ?')
        .run(userId);
      this.db
        .prepare('DELETE FROM workspaces WHERE owner_user_id = ?')
        .run(userId);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });
  }

  updateUserPlan(
    userId: string,
    planTier: PlanTierId,
    billingInterval: BillingInterval = 'monthly',
    stripeCustomerId?: string
  ): AuthUser | null {
    const existing = this.getUserById(userId);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE users
         SET plan_tier = ?, billing_interval = ?, stripe_customer_id = COALESCE(?, stripe_customer_id)
         WHERE id = ?`
      )
      .run(planTier, billingInterval, stripeCustomerId ?? null, userId);
    return this.getUserById(userId);
  }

  getPlanUsage(userId: string, activeWorkspaceId?: string): PlanUsageSummary {
    const user = this.getUserById(userId) ?? this.getDefaultUser();
    const tierSpec = PLAN_TIERS[user.planTier];
    const userWorkspaces = this.getWorkspaces(user.id);
    const userWsIds = new Set(userWorkspaces.map((w) => w.id));

    const targetWsId =
      activeWorkspaceId && userWsIds.has(activeWorkspaceId)
        ? activeWorkspaceId
        : userWorkspaces[0]?.id ?? DEFAULT_WORKSPACE_ID;

    const accCountRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM accounts WHERE workspace_id = ?')
      .get(targetWsId) as { cnt: number };

    const now = new Date();
    const monthStartIso = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();

    const ownedWorkspaces = userWorkspaces.filter(
      (w) => w.ownerUserId === user.id
    );

    let postsThisMonth = 0;
    if (ownedWorkspaces.length > 0) {
      const placeholders = ownedWorkspaces.map(() => '?').join(',');
      const postCountRow = this.db
        .prepare(
          `SELECT COUNT(*) as cnt FROM jobs
           WHERE workspace_id IN (${placeholders})
             AND lifecycle != 'draft'
             AND id NOT LIKE 'job_seed_%'
             AND created_at >= ?`
        )
        .get(...ownedWorkspaces.map((w) => w.id), monthStartIso) as {
        cnt: number;
      };
      postsThisMonth = Number(postCountRow?.cnt || 0);
    }

    return {
      planTier: user.planTier,
      billingInterval: user.billingInterval,
      workspacesUsed: ownedWorkspaces.length,
      maxWorkspaces: tierSpec.maxWorkspaces,
      accountsInActiveWorkspace: Number(accCountRow?.cnt || 0),
      maxAccountsPerWorkspace: tierSpec.maxAccountsPerWorkspace,
      postsThisMonth,
      maxPostsPerMonth: tierSpec.maxPostsPerMonth,
      fullAnalyticsHistory: tierSpec.fullAnalyticsHistory,
      allowsClientApprovals: tierSpec.allowsClientApprovals,
      stripeLiveConfigured: isStripeLiveConfigured(),
    };
  }

  // --- WORKSPACES & TEAM ROLES ---
  getWorkspaces(userId: string = DEFAULT_USER_ID): BrandWorkspace[] {
    const userRow = this.getUserById(userId);
    const userEmail = (userRow?.email || '').toLowerCase();

    const ownedRows = this.db
      .prepare(
        'SELECT * FROM workspaces WHERE owner_user_id = ? ORDER BY created_at ASC'
      )
      .all(userId) as any[];

    const map = new Map<string, BrandWorkspace>();
    for (const r of ownedRows) {
      map.set(String(r.id), {
        id: String(r.id),
        ownerUserId: String(r.owner_user_id),
        name: String(r.name),
        accentColor: String(r.accent_color),
        requireApproval: Boolean(r.require_approval),
        currentUserRole: 'owner',
        createdAt: String(r.created_at),
      });
    }

    const sharedRows = this.db
      .prepare(
        `SELECT w.*, m.role AS member_role
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
         WHERE (m.user_id = ? OR (? != '' AND m.email = ?))
         ORDER BY w.created_at ASC`
      )
      .all(userId, userEmail, userEmail) as any[];

    for (const r of sharedRows) {
      const wsId = String(r.id);
      if (map.has(wsId)) continue;
      map.set(wsId, {
        id: wsId,
        ownerUserId: String(r.owner_user_id),
        name: String(r.name),
        accentColor: String(r.accent_color),
        requireApproval: Boolean(r.require_approval),
        currentUserRole: (r.member_role as WorkspaceRole) || 'editor',
        createdAt: String(r.created_at),
      });
    }

    return Array.from(map.values());
  }

  getWorkspaceById(workspaceId: string): BrandWorkspace | null {
    const r = this.db
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(workspaceId) as any;
    if (!r) return null;
    return {
      id: String(r.id),
      ownerUserId: String(r.owner_user_id),
      name: String(r.name),
      accentColor: String(r.accent_color),
      requireApproval: Boolean(r.require_approval),
      createdAt: String(r.created_at),
    };
  }

  userOwnsWorkspace(userId: string, workspaceId: string): boolean {
    const row = this.db
      .prepare(
        'SELECT id FROM workspaces WHERE id = ? AND owner_user_id = ?'
      )
      .get(workspaceId, userId);
    return Boolean(row);
  }

  getUserRoleInWorkspace(
    userId: string,
    workspaceId: string
  ): WorkspaceRole | null {
    if (this.userOwnsWorkspace(userId, workspaceId)) return 'owner';
    const userRow = this.getUserById(userId);
    const userEmail = (userRow?.email || '').toLowerCase();
    const row = this.db
      .prepare(
        `SELECT role FROM workspace_members
         WHERE workspace_id = ?
           AND (user_id = ? OR (? != '' AND email = ?))
         LIMIT 1`
      )
      .get(workspaceId, userId, userEmail, userEmail) as
      | { role: string }
      | undefined;
    if (!row) return null;
    const r = row.role as WorkspaceRole;
    return r === 'owner' || r === 'admin' || r === 'editor' || r === 'approver'
      ? r
      : 'editor';
  }

  userCanAccessWorkspace(userId: string, workspaceId: string): boolean {
    return this.getUserRoleInWorkspace(userId, workspaceId) !== null;
  }

  updateWorkspaceSettings(
    workspaceId: string,
    patch: {
      name?: string;
      accentColor?: string;
      requireApproval?: boolean;
    }
  ): BrandWorkspace | null {
    const existing = this.getWorkspaceById(workspaceId);
    if (!existing) return null;
    const nextName =
      patch.name !== undefined && patch.name.trim()
        ? patch.name.trim()
        : existing.name;
    const nextColor =
      patch.accentColor !== undefined && patch.accentColor.trim()
        ? patch.accentColor.trim()
        : existing.accentColor;
    const nextReqApproval =
      patch.requireApproval !== undefined
        ? patch.requireApproval
        : Boolean(existing.requireApproval);

    this.db
      .prepare(
        `UPDATE workspaces
         SET name = ?, accent_color = ?, require_approval = ?
         WHERE id = ?`
      )
      .run(nextName, nextColor, nextReqApproval ? 1 : 0, workspaceId);

    return this.getWorkspaceById(workspaceId);
  }

  getWorkspaceMembers(workspaceId: string): WorkspaceMember[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM workspace_members
         WHERE workspace_id = ?
         ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'approver' THEN 2 ELSE 3 END, created_at ASC`
      )
      .all(workspaceId) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      userId: r.user_id ? String(r.user_id) : undefined,
      email: String(r.email),
      name: String(r.name),
      role: (r.role as WorkspaceRole) || 'editor',
      status: (r.status as MemberInviteStatus) || 'invited',
      inviteToken: r.invite_token ? String(r.invite_token) : undefined,
      invitedByName: r.invited_by_name ? String(r.invited_by_name) : undefined,
      createdAt: String(r.created_at),
    }));
  }

  inviteWorkspaceMember(params: {
    workspaceId: string;
    email: string;
    name?: string;
    role: Exclude<WorkspaceRole, 'owner'>;
    invitedByName?: string;
  }): WorkspaceMember {
    const cleanEmail = params.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Enter a valid collaborator email address.');
    }
    const cleanName =
      params.name?.trim() ||
      cleanEmail
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const existingUser = this.db
      .prepare('SELECT id, name FROM users WHERE email = ?')
      .get(cleanEmail) as { id: string; name: string } | undefined;

    const now = new Date().toISOString();
    const id = `mem_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const inviteToken = `inv_${crypto.randomBytes(10).toString('hex')}`;
    const status: MemberInviteStatus = existingUser ? 'active' : 'invited';

    this.db
      .prepare(
        `INSERT INTO workspace_members
          (id, workspace_id, user_id, email, name, role, status, invite_token, invited_by_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, email) DO UPDATE SET
           role = excluded.role,
           name = excluded.name,
           user_id = COALESCE(workspace_members.user_id, excluded.user_id),
           status = CASE WHEN workspace_members.user_id IS NOT NULL OR excluded.user_id IS NOT NULL THEN 'active' ELSE workspace_members.status END`
      )
      .run(
        id,
        params.workspaceId,
        existingUser?.id ?? null,
        cleanEmail,
        existingUser?.name || cleanName,
        params.role,
        status,
        inviteToken,
        params.invitedByName ?? null,
        now
      );

    const saved = this.db
      .prepare(
        'SELECT * FROM workspace_members WHERE workspace_id = ? AND email = ?'
      )
      .get(params.workspaceId, cleanEmail) as any;

    return {
      id: String(saved.id),
      workspaceId: String(saved.workspace_id),
      userId: saved.user_id ? String(saved.user_id) : undefined,
      email: String(saved.email),
      name: String(saved.name),
      role: (saved.role as WorkspaceRole) || 'editor',
      status: (saved.status as MemberInviteStatus) || 'invited',
      inviteToken: saved.invite_token ? String(saved.invite_token) : undefined,
      invitedByName: saved.invited_by_name
        ? String(saved.invited_by_name)
        : undefined,
      createdAt: String(saved.created_at),
    };
  }

  updateWorkspaceMemberRole(
    memberId: string,
    workspaceId: string,
    role: Exclude<WorkspaceRole, 'owner'>
  ): WorkspaceMember | null {
    const existing = this.db
      .prepare(
        'SELECT * FROM workspace_members WHERE id = ? AND workspace_id = ?'
      )
      .get(memberId, workspaceId) as any;
    if (!existing || existing.role === 'owner') return null;

    this.db
      .prepare(
        'UPDATE workspace_members SET role = ? WHERE id = ? AND workspace_id = ?'
      )
      .run(role, memberId, workspaceId);

    return (
      this.getWorkspaceMembers(workspaceId).find((m) => m.id === memberId) ??
      null
    );
  }

  removeWorkspaceMember(memberId: string, workspaceId: string): boolean {
    const existing = this.db
      .prepare(
        'SELECT role FROM workspace_members WHERE id = ? AND workspace_id = ?'
      )
      .get(memberId, workspaceId) as { role: string } | undefined;
    if (!existing || existing.role === 'owner') return false;

    const res = this.db
      .prepare(
        'DELETE FROM workspace_members WHERE id = ? AND workspace_id = ?'
      )
      .run(memberId, workspaceId);
    return Number(res.changes || 0) > 0;
  }

  createWorkspace(
    name: string,
    accentColor?: string,
    seedDemoAccounts = true,
    ownerUserId: string = DEFAULT_USER_ID
  ): BrandWorkspace {
    const cleanName = name.trim() || 'New Workspace';
    const now = new Date().toISOString();
    const id = `ws_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const userWs = this.getWorkspaces(ownerUserId);
    const color =
      accentColor ||
      WORKSPACE_COLORS[userWs.length % WORKSPACE_COLORS.length];

    const ws: BrandWorkspace = {
      id,
      ownerUserId,
      name: cleanName,
      accentColor: color,
      requireApproval: false,
      currentUserRole: 'owner',
      createdAt: now,
    };

    this.runInTransaction(() => {
      this.insertWorkspaceRaw(ws);
      if (seedDemoAccounts) {
        const user = this.getUserById(ownerUserId);
        const demoMode = user?.planTier === 'free' ? 'free_starter' : 'all';
        for (const acc of buildDemoAccountsForWorkspace(
          id,
          cleanName,
          now,
          demoMode
        )) {
          this.upsertAccountRaw(acc);
        }
      }
    });
    return ws;
  }

  deleteWorkspace(id: string, ownerUserId: string = DEFAULT_USER_ID): boolean {
    const owned = this.getWorkspaces(ownerUserId).filter(
      (w) => w.ownerUserId === ownerUserId
    );
    if (owned.length <= 1) return false;
    if (!owned.some((w) => w.id === id)) return false;

    this.runInTransaction(() => {
      this.db.prepare('DELETE FROM accounts WHERE workspace_id = ?').run(id);
      this.db.prepare('DELETE FROM presets WHERE workspace_id = ?').run(id);
      this.db.prepare('DELETE FROM jobs WHERE workspace_id = ?').run(id);
      this.db
        .prepare('DELETE FROM workspace_members WHERE workspace_id = ?')
        .run(id);
      this.db.prepare('DELETE FROM bio_pages WHERE workspace_id = ?').run(id);
      this.db
        .prepare('DELETE FROM inbox_comments WHERE workspace_id = ?')
        .run(id);
      this.db.prepare('DELETE FROM api_keys WHERE workspace_id = ?').run(id);
      this.db.prepare('DELETE FROM media_vault WHERE workspace_id = ?').run(id);
      this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    });
    return true;
  }

  // --- PRESETS ---
  getPresets(workspaceId: string = DEFAULT_WORKSPACE_ID): ContentPreset[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM presets WHERE workspace_id = ? ORDER BY created_at DESC'
      )
      .all(workspaceId) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      name: String(r.name),
      captionSnippet: r.caption_snippet ? String(r.caption_snippet) : undefined,
      hashtags: r.hashtags ? String(r.hashtags) : undefined,
      firstComment: r.first_comment ? String(r.first_comment) : undefined,
      createdAt: String(r.created_at),
    }));
  }

  createPreset(params: {
    workspaceId?: string;
    name: string;
    captionSnippet?: string;
    hashtags?: string;
    firstComment?: string;
  }): ContentPreset {
    const preset: ContentPreset = {
      id: `preset_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
      workspaceId: params.workspaceId || DEFAULT_WORKSPACE_ID,
      name: params.name.trim() || 'Untitled preset',
      captionSnippet: params.captionSnippet?.trim() || undefined,
      hashtags: params.hashtags?.trim() || undefined,
      firstComment: params.firstComment?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    this.insertPresetRaw(preset);
    return preset;
  }

  deletePreset(id: string): boolean {
    const res = this.db.prepare('DELETE FROM presets WHERE id = ?').run(id);
    return Number(res.changes || 0) > 0;
  }

  // --- ACCOUNTS & TOKEN REFRESH ---
  getPublicAccounts(workspaceId?: string): ConnectedAccount[] {
    const rows = workspaceId
      ? (this.db
          .prepare('SELECT * FROM accounts WHERE workspace_id = ?')
          .all(workspaceId) as any[])
      : (this.db.prepare('SELECT * FROM accounts').all() as any[]);
    return rows.map((r) => toPublicAccount(rowToStoredAccount(r)));
  }

  getAccountByGroup(
    group: AccountGroupId,
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): StoredAccountRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM accounts WHERE workspace_id = ? AND platform_group = ?'
      )
      .get(workspaceId, group) as any;
    return row ? rowToStoredAccount(row) : undefined;
  }

  async ensureFreshAccountByGroup(
    group: AccountGroupId,
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): Promise<StoredAccountRecord | undefined> {
    const account = this.getAccountByGroup(group, workspaceId);
    if (!account) return undefined;
    if (!isAccountTokenExpiring(account)) {
      return account;
    }

    try {
      const refreshed = await requestProviderTokenRefresh(account);
      if (refreshed) {
        const updatedRecord: StoredAccountRecord = {
          ...account,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? account.refreshToken,
          expiresAt: refreshed.expiresAt ?? account.expiresAt,
        };
        this.upsertAccountRaw(updatedRecord);
        return updatedRecord;
      }
    } catch {
      // Keep existing token so adapter surfaces exact upstream message if revoked
    }
    return account;
  }

  getAccountById(id: string): StoredAccountRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(id) as any;
    return row ? rowToStoredAccount(row) : undefined;
  }

  upsertAccount(record: StoredAccountRecord): ConnectedAccount {
    const normalized: StoredAccountRecord = {
      ...record,
      workspaceId: record.workspaceId || DEFAULT_WORKSPACE_ID,
    };
    this.upsertAccountRaw(normalized);
    return toPublicAccount(normalized);
  }

  updateAccount(
    id: string,
    patch: Partial<
      Pick<StoredAccountRecord, 'simulateFailure' | 'handle' | 'displayName'>
    >
  ): ConnectedAccount | null {
    const existing = this.getAccountById(id);
    if (!existing) return null;
    const updated: StoredAccountRecord = {
      ...existing,
      simulateFailure:
        typeof patch.simulateFailure === 'boolean'
          ? patch.simulateFailure
          : existing.simulateFailure,
      handle:
        typeof patch.handle === 'string' && patch.handle.trim()
          ? patch.handle.trim()
          : existing.handle,
      displayName:
        typeof patch.displayName === 'string' && patch.displayName.trim()
          ? patch.displayName.trim()
          : existing.displayName,
    };
    this.upsertAccountRaw(updated);
    return toPublicAccount(updated);
  }

  removeAccount(id: string): boolean {
    const res = this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    return Number(res.changes || 0) > 0;
  }

  // --- JOBS & CLIENT APPROVAL LINKS ---
  getJobs(workspaceId?: string): PublishJob[] {
    const rows = workspaceId
      ? (this.db
          .prepare(
            'SELECT payload_json FROM jobs WHERE workspace_id = ? ORDER BY created_at DESC'
          )
          .all(workspaceId) as { payload_json: string }[])
      : (this.db
          .prepare('SELECT payload_json FROM jobs ORDER BY created_at DESC')
          .all() as { payload_json: string }[]);
    return rows.map((r) => JSON.parse(r.payload_json) as PublishJob);
  }

  getJob(id: string): PublishJob | undefined {
    const row = this.db
      .prepare('SELECT payload_json FROM jobs WHERE id = ?')
      .get(id) as { payload_json: string } | undefined;
    return row ? (JSON.parse(row.payload_json) as PublishJob) : undefined;
  }

  getJobFiles(id: string): StoredJobFiles {
    const row = this.db
      .prepare('SELECT files_json FROM jobs WHERE id = ?')
      .get(id) as { files_json: string } | undefined;
    return row ? (JSON.parse(row.files_json) as StoredJobFiles) : {};
  }

  setJobFiles(id: string, files: StoredJobFiles) {
    this.db
      .prepare('UPDATE jobs SET files_json = ? WHERE id = ?')
      .run(JSON.stringify(files), id);
  }

  createJob(job: PublishJob, files: StoredJobFiles): PublishJob {
    const existing = this.getJob(job.id);
    const merged: PublishJob = {
      ...job,
      workspaceId: job.workspaceId || DEFAULT_WORKSPACE_ID,
      approval: job.approval ?? existing?.approval,
    };
    this.upsertJobRaw(merged, files);
    return this.getJob(merged.id)!;
  }

  updateJobResult(
    jobId: string,
    platformId: keyof PublishJob['results'],
    updater: (
      prev: NonNullable<PublishJob['results'][typeof platformId]>
    ) => NonNullable<PublishJob['results'][typeof platformId]>
  ) {
    const job = this.getJob(jobId);
    if (!job || !job.results[platformId]) return;
    job.results[platformId] = updater(job.results[platformId]!);
    job.updatedAt = new Date().toISOString();
    this.upsertJobRaw(job);
  }

  patchJob(
    id: string,
    patch: Partial<
      Pick<
        PublishJob,
        | 'lifecycle'
        | 'scheduledAt'
        | 'updatedAt'
        | 'results'
        | 'approval'
        | 'isEvergreen'
        | 'evergreenIntervalDays'
        | 'lastRecycledAt'
      >
    >
  ): PublishJob | null {
    const job = this.getJob(id);
    if (!job) return null;
    const updated: PublishJob = {
      ...job,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.upsertJobRaw(updated);
    return updated;
  }

  ensureJobApprovalLink(jobId: string): PublishJob | null {
    const job = this.getJob(jobId);
    if (!job) return null;
    if (job.approval?.shareToken) {
      return job;
    }
    const approval: PostApprovalState = {
      shareToken: `rev_${crypto.randomBytes(12).toString('hex')}`,
      status: 'pending',
      updatedAt: new Date().toISOString(),
      comments: [],
    };
    return this.patchJob(jobId, { approval });
  }

  getPublicReviewByToken(shareToken: string): PublicReviewPayload | null {
    if (!shareToken) return null;
    const row = this.db
      .prepare('SELECT payload_json FROM jobs WHERE share_token = ?')
      .get(shareToken) as { payload_json: string } | undefined;
    if (!row) return null;
    const job = JSON.parse(row.payload_json) as PublishJob;
    if (!job.approval) return null;

    const wsId = job.workspaceId || DEFAULT_WORKSPACE_ID;
    const ws = this.getWorkspaceById(wsId);
    const accounts = this.getPublicAccounts(wsId).map((a) => ({
      platformGroup: a.platformGroup,
      handle: a.handle,
      displayName: a.displayName,
    }));

    return {
      workspaceName: ws?.name || 'Brand Studio',
      workspaceColor: ws?.accentColor || WORKSPACE_COLORS[0],
      accounts,
      job: {
        id: job.id,
        createdAt: job.createdAt,
        lifecycle: job.lifecycle,
        scheduledAt: job.scheduledAt,
        postKind: job.postKind,
        video: job.video,
        photos: job.photos,
        master: job.master,
        overrides: job.overrides,
        approval: job.approval,
      },
    };
  }

  submitClientReviewDecision(
    shareToken: string,
    params: {
      reviewerName: string;
      decision: 'approved' | 'changes_requested';
      comment?: string;
    }
  ): PublicReviewPayload | null {
    const row = this.db
      .prepare('SELECT payload_json FROM jobs WHERE share_token = ?')
      .get(shareToken) as { payload_json: string } | undefined;
    if (!row) return null;

    const job = JSON.parse(row.payload_json) as PublishJob;
    if (!job.approval) return null;

    const now = new Date().toISOString();
    const cleanReviewer = params.reviewerName.trim() || 'Client Reviewer';
    const cleanBody =
      params.comment?.trim() ||
      (params.decision === 'approved'
        ? 'Approved for publishing.'
        : 'Requested revisions.');

    const entry: ApprovalComment = {
      id: `cmt_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
      authorName: cleanReviewer,
      role: 'client',
      body: cleanBody,
      decision: params.decision,
      createdAt: now,
    };

    const nextApproval: PostApprovalState = {
      ...job.approval,
      status: params.decision,
      reviewerName: cleanReviewer,
      updatedAt: now,
      comments: [...job.approval.comments, entry],
    };

    this.patchJob(job.id, { approval: nextApproval });
    return this.getPublicReviewByToken(shareToken);
  }

  submitTeamJobDecision(
    jobId: string,
    params: {
      reviewerName: string;
      decision: 'approved' | 'changes_requested';
      comment?: string;
    }
  ): PublishJob | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const now = new Date().toISOString();
    const cleanReviewer = params.reviewerName.trim() || 'Workspace Reviewer';
    const cleanBody =
      params.comment?.trim() ||
      (params.decision === 'approved'
        ? 'Approved for publishing.'
        : 'Requested changes before publishing.');

    const existingApproval: PostApprovalState = job.approval ?? {
      shareToken: `rev_${crypto.randomBytes(12).toString('hex')}`,
      status: 'pending',
      updatedAt: now,
      comments: [],
    };

    const entry: ApprovalComment = {
      id: `cmt_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
      authorName: cleanReviewer,
      role: 'team',
      body: cleanBody,
      decision: params.decision,
      createdAt: now,
    };

    const nextApproval: PostApprovalState = {
      ...existingApproval,
      status: params.decision,
      reviewerName: cleanReviewer,
      updatedAt: now,
      comments: [...existingApproval.comments, entry],
    };

    return this.patchJob(jobId, { approval: nextApproval });
  }

  deleteJob(id: string): boolean {
    const res = this.db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
    return Number(res.changes || 0) > 0;
  }

  getDueScheduledJobs(nowIso: string): PublishJob[] {
    const rows = this.db
      .prepare(
        `SELECT j.payload_json, COALESCE(w.require_approval, 0) AS ws_require_approval
         FROM jobs j
         LEFT JOIN workspaces w ON w.id = j.workspace_id
         WHERE j.lifecycle = 'scheduled'
           AND j.scheduled_at IS NOT NULL
           AND j.scheduled_at <= ?`
      )
      .all(nowIso) as { payload_json: string; ws_require_approval: number }[];

    const ready: PublishJob[] = [];
    for (const r of rows) {
      const job = JSON.parse(r.payload_json) as PublishJob;
      const appStatus = job.approval?.status;
      // Never auto-publish if a reviewer requested changes
      if (appStatus === 'changes_requested') continue;
      // Hold if workspace requires approval (or editor-created pending review) and not yet approved
      if (Boolean(r.ws_require_approval) && appStatus !== 'approved') continue;
      if (job.createdByRole === 'editor' && appStatus !== 'approved') continue;
      ready.push(job);
    }
    return ready;
  }

  // --- ANALYTICS ---
  ensureWorkspaceMetrics(workspaceId: string = DEFAULT_WORKSPACE_ID) {
    const jobs = this.getJobs(workspaceId);
    for (const job of jobs) {
      let mutated = false;
      const postKind = job.postKind ?? detectPostKind(job.video, job.photos);
      for (const pid of PLATFORM_ORDER) {
        const res = job.results[pid];
        if (res && res.status === 'published' && !res.metrics) {
          res.metrics = generateInitialPostMetrics({
            jobId: job.id,
            platformId: pid,
            postKind,
            firstCommentPosted: res.firstCommentPosted,
            createdAtIso: job.createdAt,
          });
          mutated = true;
        }
      }
      if (mutated) {
        this.upsertJobRaw(job);
      }
    }
  }

  async syncWorkspaceMetrics(workspaceId: string = DEFAULT_WORKSPACE_ID) {
    const jobs = this.getJobs(workspaceId);
    for (const job of jobs) {
      let mutated = false;
      const postKind = job.postKind ?? detectPostKind(job.video, job.photos);
      for (const pid of PLATFORM_ORDER) {
        const res = job.results[pid];
        if (!res || res.status !== 'published') continue;
        if (!res.metrics) {
          res.metrics = generateInitialPostMetrics({
            jobId: job.id,
            platformId: pid,
            postKind,
            firstCommentPosted: res.firstCommentPosted,
            createdAtIso: job.createdAt,
          });
        } else {
          const acc = this.getAccountByGroup(
            PLATFORM_SPECS[pid].accountGroup,
            workspaceId
          );
          res.metrics = await refreshPostMetrics({
            prev: res.metrics,
            jobId: job.id,
            platformId: pid,
            mode: acc?.mode === 'live' ? 'live' : 'sandbox',
            externalPostId: res.externalPostId,
            firstCommentPosted: res.firstCommentPosted,
          });
        }
        mutated = true;
      }
      if (mutated) {
        this.upsertJobRaw(job);
      }
    }
  }

  // --- TRACK 1: LINK-IN-BIO (/u/:slug) & CLICK ATTRIBUTION ---
  private buildDefaultBioConfig(workspaceId: string): BioPageConfig {
    const ws = this.getWorkspaceById(workspaceId);
    const baseSlug = slugifyWorkspace(ws?.name || workspaceId);
    let slug = baseSlug;
    const clash = this.db
      .prepare(
        'SELECT workspace_id FROM bio_pages WHERE slug = ? AND workspace_id != ?'
      )
      .get(slug, workspaceId);
    if (clash) {
      slug = `${baseSlug}-${workspaceId.slice(-4)}`;
    }
    const now = new Date().toISOString();
    return {
      workspaceId,
      slug,
      headline: ws?.name || 'Brand Studio',
      bio: 'Latest videos, carousels, and featured links.',
      theme: 'paper',
      customLinks: [],
      postLinkUrls: {},
      postClicks: {},
      totalViews: 0,
      totalClicks: 0,
      updatedAt: now,
    };
  }

  getBioPageConfig(workspaceId: string = DEFAULT_WORKSPACE_ID): BioPageConfig {
    const row = this.db
      .prepare('SELECT payload_json FROM bio_pages WHERE workspace_id = ?')
      .get(workspaceId) as { payload_json: string } | undefined;
    if (row) {
      return JSON.parse(row.payload_json) as BioPageConfig;
    }
    const created = this.buildDefaultBioConfig(workspaceId);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO bio_pages (workspace_id, slug, payload_json, updated_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        workspaceId,
        created.slug,
        JSON.stringify(created),
        created.updatedAt
      );
    return created;
  }

  updateBioPageConfig(
    workspaceId: string,
    patch: {
      slug?: string;
      headline?: string;
      bio?: string;
      theme?: 'paper' | 'graphite';
      customLinks?: Array<{ id?: string; label: string; url: string; clicks?: number }>;
      postLinkUrls?: Record<string, string>;
    }
  ): BioPageConfig {
    const current = this.getBioPageConfig(workspaceId);
    let nextSlug = current.slug;
    if (patch.slug !== undefined) {
      const cleaned = patch.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32);
      if (!cleaned) {
        throw new Error('Choose a valid handle slug (letters, numbers, hyphens).');
      }
      const existing = this.db
        .prepare(
          'SELECT workspace_id FROM bio_pages WHERE slug = ? AND workspace_id != ?'
        )
        .get(cleaned, workspaceId);
      if (existing) {
        throw new Error(`The link /u/${cleaned} is already taken.`);
      }
      nextSlug = cleaned;
    }

    const prevLinksById = new Map(current.customLinks.map((l) => [l.id, l]));
    const nextLinks: BioCustomLink[] =
      patch.customLinks !== undefined
        ? patch.customLinks
            .filter((l) => String(l.label || '').trim() && String(l.url || '').trim())
            .map((l, idx) => {
              const id =
                l.id && prevLinksById.has(l.id)
                  ? l.id
                  : l.id || `lnk_${Date.now()}_${idx}`;
              const cleanUrl = /^https?:\/\//i.test(l.url.trim())
                ? l.url.trim()
                : `https://${l.url.trim()}`;
              return {
                id,
                label: l.label.trim(),
                url: cleanUrl,
                clicks: prevLinksById.get(id)?.clicks ?? l.clicks ?? 0,
              };
            })
        : current.customLinks;

    const now = new Date().toISOString();
    const updated: BioPageConfig = {
      ...current,
      slug: nextSlug,
      headline:
        patch.headline !== undefined
          ? patch.headline.trim() || current.headline
          : current.headline,
      bio: patch.bio !== undefined ? patch.bio.trim() : current.bio,
      theme:
        patch.theme === 'paper' || patch.theme === 'graphite'
          ? patch.theme
          : current.theme,
      customLinks: nextLinks,
      postLinkUrls:
        patch.postLinkUrls !== undefined
          ? { ...current.postLinkUrls, ...patch.postLinkUrls }
          : current.postLinkUrls,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO bio_pages (workspace_id, slug, payload_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET
           slug = excluded.slug,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`
      )
      .run(workspaceId, updated.slug, JSON.stringify(updated), now);

    return updated;
  }

  getPublicBioPageBySlug(
    slug: string,
    trackView = false
  ): PublicBioPagePayload | null {
    const cleanSlug = slug.trim().toLowerCase();
    const row = this.db
      .prepare(
        'SELECT workspace_id, payload_json FROM bio_pages WHERE slug = ?'
      )
      .get(cleanSlug) as
      | { workspace_id: string; payload_json: string }
      | undefined;
    if (!row) return null;

    const config = JSON.parse(row.payload_json) as BioPageConfig;
    if (trackView) {
      config.totalViews = (config.totalViews || 0) + 1;
      this.db
        .prepare(
          'UPDATE bio_pages SET payload_json = ?, updated_at = ? WHERE workspace_id = ?'
        )
        .run(
          JSON.stringify(config),
          new Date().toISOString(),
          row.workspace_id
        );
    }

    const ws = this.getWorkspaceById(row.workspace_id);
    const accounts = this.getPublicAccounts(row.workspace_id).map((a) => ({
      platformGroup: a.platformGroup,
      handle: a.handle,
      displayName: a.displayName,
    }));

    const jobs = this.getJobs(row.workspace_id).filter(
      (j) => (j.lifecycle ?? 'active') === 'active'
    );

    const posts: BioPostCard[] = [];
    for (const job of jobs) {
      const explicitUrl = config.postLinkUrls?.[job.id]?.trim();
      const firstCommentUrl = extractFirstUrl(job.master.firstComment);
      const captionUrl = extractFirstUrl(job.master.caption);
      const firstExternalUrl = Object.values(job.results).find(
        (r) => r?.externalUrl
      )?.externalUrl;

      const destinationUrl =
        explicitUrl || firstCommentUrl || captionUrl || firstExternalUrl || '';
      if (!destinationUrl) continue;

      const postKind = job.postKind ?? detectPostKind(job.video, job.photos);
      posts.push({
        jobId: job.id,
        postKind,
        title:
          job.master.title.trim() ||
          job.master.caption.split('\n')[0]?.trim().slice(0, 68) ||
          'Published post',
        captionPreview: job.master.caption.trim().slice(0, 120),
        destinationUrl,
        clicks: config.postClicks?.[job.id] ?? 0,
        createdAt: job.createdAt,
        sampleTint: job.photos?.[0]?.sampleTint,
        photoCount: job.photos?.length,
      });
    }

    return {
      workspaceName: ws?.name || config.headline,
      workspaceColor: ws?.accentColor || WORKSPACE_COLORS[0],
      config,
      accounts,
      posts: posts.slice(0, 18),
    };
  }

  recordBioPageClick(
    slug: string,
    targetType: 'link' | 'post',
    targetId: string
  ): { url: string | null; totalClicks: number } | null {
    const cleanSlug = slug.trim().toLowerCase();
    const row = this.db
      .prepare(
        'SELECT workspace_id, payload_json FROM bio_pages WHERE slug = ?'
      )
      .get(cleanSlug) as
      | { workspace_id: string; payload_json: string }
      | undefined;
    if (!row) return null;

    const config = JSON.parse(row.payload_json) as BioPageConfig;
    let resolvedUrl: string | null = null;

    if (targetType === 'link') {
      const link = config.customLinks.find((l) => l.id === targetId);
      if (link) {
        link.clicks = (link.clicks || 0) + 1;
        resolvedUrl = link.url;
      }
    } else {
      config.postClicks = config.postClicks || {};
      config.postClicks[targetId] = (config.postClicks[targetId] || 0) + 1;
      const job = this.getJob(targetId);
      if (job) {
        resolvedUrl =
          config.postLinkUrls?.[targetId] ||
          extractFirstUrl(job.master.firstComment) ||
          extractFirstUrl(job.master.caption) ||
          Object.values(job.results).find((r) => r?.externalUrl)?.externalUrl ||
          null;

        // Attribute Link-in-Bio click straight into Insights post metrics!
        const firstPubPlatform = PLATFORM_ORDER.find(
          (pid) => job.results[pid]?.status === 'published'
        );
        if (firstPubPlatform && job.results[firstPubPlatform]) {
          this.ensureWorkspaceMetrics(row.workspace_id);
          const refreshedJob = this.getJob(targetId);
          const targetRes = refreshedJob?.results[firstPubPlatform];
          if (refreshedJob && targetRes?.metrics) {
            targetRes.metrics = {
              ...targetRes.metrics,
              linkClicks: (targetRes.metrics.linkClicks || 0) + 1,
              lastSyncedAt: new Date().toISOString(),
            };
            this.upsertJobRaw(refreshedJob);
          }
        }
      }
    }

    config.totalClicks = (config.totalClicks || 0) + 1;
    this.db
      .prepare(
        'UPDATE bio_pages SET payload_json = ?, updated_at = ? WHERE workspace_id = ?'
      )
      .run(
        JSON.stringify(config),
        new Date().toISOString(),
        row.workspace_id
      );

    return { url: resolvedUrl, totalClicks: config.totalClicks };
  }

  // --- TRACK 2: UNIFIED COMMENTS INBOX ---
  getInboxComments(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
    filter: InboxFilterStatus = 'all'
  ): { comments: SocialCommentItem[]; unansweredCount: number } {
    const allRows = this.db
      .prepare(
        `SELECT payload_json, status FROM inbox_comments
         WHERE workspace_id = ?
         ORDER BY created_at DESC`
      )
      .all(workspaceId) as { payload_json: string; status: string }[];

    const allItems = allRows.map(
      (r) => JSON.parse(r.payload_json) as SocialCommentItem
    );
    const unansweredCount = allItems.filter(
      (c) => c.status === 'unanswered'
    ).length;

    const filtered =
      filter === 'all'
        ? allItems.filter((c) => c.status !== 'archived')
        : allItems.filter((c) => c.status === filter);

    return { comments: filtered, unansweredCount };
  }

  async syncWorkspaceInbox(
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): Promise<{ comments: SocialCommentItem[]; unansweredCount: number }> {
    const jobs = this.getJobs(workspaceId).filter(
      (j) => (j.lifecycle ?? 'active') === 'active'
    );
    for (const job of jobs) {
      const liveBsky = await fetchLiveBlueskyRepliesForJob(job);
      for (const item of liveBsky) {
        const exists = this.db
          .prepare('SELECT id FROM inbox_comments WHERE id = ?')
          .get(item.id);
        if (!exists) {
          this.db
            .prepare(
              `INSERT INTO inbox_comments (id, workspace_id, status, created_at, payload_json)
               VALUES (?, ?, ?, ?, ?)`
            )
            .run(
              item.id,
              workspaceId,
              item.status,
              item.createdAt,
              JSON.stringify(item)
            );
        }
      }
    }
    return this.getInboxComments(workspaceId, 'all');
  }

  async replyToInboxComment(
    commentId: string,
    replyBody: string
  ): Promise<SocialCommentItem | null> {
    const row = this.db
      .prepare('SELECT payload_json FROM inbox_comments WHERE id = ?')
      .get(commentId) as { payload_json: string } | undefined;
    if (!row) return null;

    const comment = JSON.parse(row.payload_json) as SocialCommentItem;
    const cleanBody = replyBody.trim();
    if (!cleanBody) {
      throw new Error('Write a reply message first.');
    }

    const group = PLATFORM_SPECS[comment.platformId].accountGroup;
    const acc = this.getAccountByGroup(group, comment.workspaceId);

    let sentLive = false;
    if (comment.platformId === 'bluesky') {
      sentLive = await tryPublishLiveBlueskyReply(acc, comment, cleanBody);
    }

    const reply: SocialCommentReply = {
      id: `rep_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
      authorHandle: acc?.handle || '@studio',
      body: cleanBody,
      mode: sentLive ? 'live' : 'sandbox',
      createdAt: new Date().toISOString(),
    };

    const updated: SocialCommentItem = {
      ...comment,
      status: 'replied',
      replies: [...comment.replies, reply],
    };

    this.db
      .prepare(
        'UPDATE inbox_comments SET status = ?, payload_json = ? WHERE id = ?'
      )
      .run(updated.status, JSON.stringify(updated), commentId);

    return updated;
  }

  updateInboxCommentStatus(
    commentId: string,
    status: 'unanswered' | 'replied' | 'archived'
  ): SocialCommentItem | null {
    const row = this.db
      .prepare('SELECT payload_json FROM inbox_comments WHERE id = ?')
      .get(commentId) as { payload_json: string } | undefined;
    if (!row) return null;

    const comment = JSON.parse(row.payload_json) as SocialCommentItem;
    const updated: SocialCommentItem = { ...comment, status };
    this.db
      .prepare(
        'UPDATE inbox_comments SET status = ?, payload_json = ? WHERE id = ?'
      )
      .run(status, JSON.stringify(updated), commentId);
    return updated;
  }

  // --- TRACK 3: EVERGREEN QUEUE RECYCLING ---
  setJobEvergreen(
    jobId: string,
    isEvergreen: boolean,
    intervalDays = 14
  ): PublishJob | null {
    return this.patchJob(jobId, {
      isEvergreen,
      evergreenIntervalDays: Math.max(3, Math.min(90, Math.round(intervalDays || 14))),
    });
  }

  fillOpenSlotsWithEvergreen(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
    daysAhead = 7
  ): PublishJob[] {
    const allJobs = this.getJobs(workspaceId);
    const evergreenPool = allJobs.filter(
      (j) => j.isEvergreen && !j.recycledFromJobId
    );
    if (evergreenPool.length === 0) {
      return [];
    }

    // Collect local YYYY-MM-DD keys that already have a scheduled post
    const bookedDayKeys = new Set<string>();
    for (const j of allJobs) {
      if (j.lifecycle === 'scheduled' && j.scheduledAt) {
        const d = new Date(j.scheduledAt);
        if (!Number.isNaN(d.getTime())) {
          bookedDayKeys.add(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
              2,
              '0'
            )}-${String(d.getDate()).padStart(2, '0')}`
          );
        }
      }
    }

    const ws = this.getWorkspaceById(workspaceId);
    const created: PublishJob[] = [];
    let poolCursor = 0;

    for (let offset = 1; offset <= daysAhead; offset++) {
      const candidate = new Date();
      candidate.setDate(candidate.getDate() + offset);
      const dow = candidate.getDay();
      // Fill open weekdays (Mon-Fri) so weekend cadence stays calm
      if (dow === 0 || dow === 6) continue;

      const key = `${candidate.getFullYear()}-${String(
        candidate.getMonth() + 1
      ).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
      if (bookedDayKeys.has(key)) continue;

      candidate.setHours(9, 30, 0, 0);
      const source = evergreenPool[poolCursor % evergreenPool.length];
      poolCursor++;

      const now = new Date().toISOString();
      const enabled = PLATFORM_ORDER.filter((pid) => source.overrides[pid]?.enabled);
      const results: PublishJob['results'] = {};
      for (const pid of enabled) {
        const acc = this.getAccountByGroup(
          PLATFORM_SPECS[pid].accountGroup,
          workspaceId
        );
        results[pid] = {
          platformId: pid,
          status: 'queued',
          progressPct: 0,
          statusMessage: 'Scheduled (Evergreen)',
          mode: acc?.mode === 'live' ? 'live' : 'sandbox',
          updatedAt: now,
        };
      }

      const cloneId = `job_evg_${Date.now()}_${offset}_${crypto
        .randomBytes(2)
        .toString('hex')}`;
      const sourceFiles = this.getJobFiles(source.id);
      const clone: PublishJob = {
        id: cloneId,
        workspaceId,
        createdAt: now,
        updatedAt: now,
        lifecycle: 'scheduled',
        scheduledAt: candidate.toISOString(),
        postKind: source.postKind,
        recycledFromJobId: source.id,
        video: source.video,
        photos: source.photos,
        master: { ...source.master },
        overrides: JSON.parse(JSON.stringify(source.overrides)),
        results,
        approval: ws?.requireApproval
          ? {
              shareToken: `rev_${crypto.randomBytes(12).toString('hex')}`,
              status: 'pending',
              updatedAt: now,
              comments: [],
            }
          : undefined,
      };

      this.upsertJobRaw(clone, sourceFiles);
      this.patchJob(source.id, { lastRecycledAt: now });
      bookedDayKeys.add(key);
      created.push(clone);
    }

    return created;
  }

  // --- FOUNDER ADMIN CONSOLE & PROMO CODES ---
  getPromoCodes(): PromoCodeRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM promo_codes ORDER BY created_at DESC')
      .all() as any[];
    return rows.map((r) => ({
      code: String(r.code),
      grantTier: (r.grant_tier as 'creator' | 'studio') || 'creator',
      billingInterval: (r.billing_interval as BillingInterval) || 'monthly',
      maxUses: Number(r.max_uses || 100),
      usedCount: Number(r.used_count || 0),
      note: r.note ? String(r.note) : undefined,
      active: Boolean(r.active),
      createdAt: String(r.created_at),
    }));
  }

  createPromoCode(params: {
    code: string;
    grantTier: 'creator' | 'studio';
    billingInterval?: BillingInterval;
    maxUses?: number;
    note?: string;
  }): PromoCodeRecord {
    const cleanCode = params.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, '');
    if (cleanCode.length < 3) {
      throw new Error('Promo code must be at least 3 characters.');
    }
    const now = new Date().toISOString();
    const interval = params.billingInterval || 'monthly';
    const maxUses = Math.max(1, Math.min(100_000, Number(params.maxUses) || 50));

    this.db
      .prepare(
        `INSERT INTO promo_codes
          (code, grant_tier, billing_interval, max_uses, used_count, note, active, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 1, ?)
         ON CONFLICT(code) DO UPDATE SET
           grant_tier = excluded.grant_tier,
           billing_interval = excluded.billing_interval,
           max_uses = excluded.max_uses,
           note = excluded.note,
           active = 1`
      )
      .run(cleanCode, params.grantTier, interval, maxUses, params.note ?? null, now);

    return this.getPromoCodes().find((p) => p.code === cleanCode)!;
  }

  deletePromoCode(code: string): boolean {
    const clean = code.trim().toUpperCase();
    const res = this.db
      .prepare('DELETE FROM promo_codes WHERE code = ?')
      .run(clean);
    return Number(res.changes || 0) > 0;
  }

  redeemPromoCode(
    userId: string,
    rawCode: string
  ): { user: AuthUser; promo: PromoCodeRecord } {
    const cleanCode = rawCode.trim().toUpperCase();
    if (!cleanCode) {
      throw new Error('Enter a promo or beta access code.');
    }

    const row = this.db
      .prepare('SELECT * FROM promo_codes WHERE code = ?')
      .get(cleanCode) as any;
    if (!row || !row.active) {
      throw new Error('Invalid or inactive promo code.');
    }
    if (Number(row.used_count || 0) >= Number(row.max_uses || 1)) {
      throw new Error('This promo code has reached its maximum redemptions.');
    }

    const already = this.db
      .prepare(
        'SELECT code FROM promo_redemptions WHERE code = ? AND user_id = ?'
      )
      .get(cleanCode, userId);
    if (already) {
      throw new Error('You have already redeemed this code on your account.');
    }

    const grantTier = (row.grant_tier as 'creator' | 'studio') || 'creator';
    const interval = (row.billing_interval as BillingInterval) || 'monthly';

    this.runInTransaction(() => {
      this.db
        .prepare(
          'INSERT INTO promo_redemptions (code, user_id, redeemed_at) VALUES (?, ?, ?)'
        )
        .run(cleanCode, userId, new Date().toISOString());
      this.db
        .prepare(
          'UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ?'
        )
        .run(cleanCode);
      this.updateUserPlan(userId, grantTier, interval);
    });

    const updatedUser = this.getUserById(userId)!;
    const updatedPromo = this.getPromoCodes().find((p) => p.code === cleanCode)!;
    return { user: updatedUser, promo: updatedPromo };
  }

  getAdminOverview(): AdminOverviewSummary {
    const userRows = this.db
      .prepare('SELECT * FROM users ORDER BY created_at DESC')
      .all() as any[];
    const wsCounts = this.db
      .prepare(
        'SELECT owner_user_id, COUNT(*) as cnt FROM workspaces GROUP BY owner_user_id'
      )
      .all() as { owner_user_id: string; cnt: number }[];
    const wsCountMap = new Map(
      wsCounts.map((r) => [String(r.owner_user_id), Number(r.cnt || 0)])
    );

    const totalWsRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM workspaces')
      .get() as { cnt: number };

    const allJobs = this.getJobs();
    let scheduledJobs = 0;
    let publishedJobs = 0;
    let failedJobs = 0;
    for (const j of allJobs) {
      if (j.lifecycle === 'scheduled') scheduledJobs++;
      else if ((j.lifecycle ?? 'active') === 'active') publishedJobs++;
      if (Object.values(j.results).some((r) => r?.status === 'failed')) {
        failedJobs++;
      }
    }

    let freeUsers = 0;
    let creatorUsers = 0;
    let studioUsers = 0;
    let mrrUsd = 0;

    const users = userRows.map((r) => {
      const pub = toPublicUser(r);
      if (pub.planTier === 'creator') {
        creatorUsers++;
        mrrUsd +=
          pub.billingInterval === 'annual'
            ? PLAN_TIERS.creator.annualMonthlyPriceUsd
            : PLAN_TIERS.creator.monthlyPriceUsd;
      } else if (pub.planTier === 'studio') {
        studioUsers++;
        mrrUsd +=
          pub.billingInterval === 'annual'
            ? PLAN_TIERS.studio.annualMonthlyPriceUsd
            : PLAN_TIERS.studio.monthlyPriceUsd;
      } else {
        freeUsers++;
      }
      return {
        ...pub,
        workspacesCount: wsCountMap.get(pub.id) ?? 0,
      };
    });

    return {
      mrrUsd,
      arrUsd: mrrUsd * 12,
      counts: {
        totalUsers: users.length,
        freeUsers,
        creatorUsers,
        studioUsers,
        totalWorkspaces: Number(totalWsRow?.cnt || 0),
        scheduledJobs,
        publishedJobs,
        failedJobs,
      },
      users,
      promoCodes: this.getPromoCodes(),
      recentEmails: this.getRecentOutboxEmails(20),
    };
  }

  // --- PASSWORD RESET & TRANSACTIONAL EMAIL OUTBOX ---
  recordOutboxEmail(item: EmailOutboxItem) {
    this.db
      .prepare(
        `INSERT INTO email_outbox
          (id, to_email, subject, category, preview_text, delivery_mode, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        item.id,
        item.toEmail,
        item.subject,
        item.category,
        item.previewText,
        item.deliveryMode,
        item.createdAt
      );
  }

  getRecentOutboxEmails(limit = 25): EmailOutboxItem[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT ?'
      )
      .all(limit) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      toEmail: String(r.to_email),
      subject: String(r.subject),
      category: r.category as EmailOutboxItem['category'],
      previewText: String(r.preview_text),
      deliveryMode: r.delivery_mode as EmailOutboxItem['deliveryMode'],
      createdAt: String(r.created_at),
    }));
  }

  createPasswordResetCode(rawEmail: string): {
    exists: boolean;
    email: string;
    code?: string;
  } {
    const cleanEmail = rawEmail.trim().toLowerCase();
    const row = this.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(cleanEmail) as { id: string } | undefined;
    if (!row) {
      return { exists: false, email: cleanEmail };
    }
    const code = String(crypto.randomInt(100000, 999999));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    this.db
      .prepare(
        `INSERT INTO password_resets (email, reset_code, expires_at, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           reset_code = excluded.reset_code,
           expires_at = excluded.expires_at,
           created_at = excluded.created_at`
      )
      .run(cleanEmail, code, expiresAt, now.toISOString());

    return { exists: true, email: cleanEmail, code };
  }

  resetPasswordWithCode(params: {
    email: string;
    code: string;
    newPassword: string;
  }): { user: AuthUser; token: string } {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanCode = params.code.trim();
    if (!params.newPassword || params.newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters.');
    }

    const resetRow = this.db
      .prepare('SELECT * FROM password_resets WHERE email = ?')
      .get(cleanEmail) as any;
    if (!resetRow || String(resetRow.reset_code) !== cleanCode) {
      throw new Error('Invalid or expired 6-digit reset code.');
    }
    if (new Date(String(resetRow.expires_at)).getTime() < Date.now()) {
      throw new Error('Reset code expired. Request a fresh code.');
    }

    const userRow = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(cleanEmail) as any;
    if (!userRow) {
      throw new Error('Account not found.');
    }

    const newHash = hashPassword(params.newPassword);
    this.runInTransaction(() => {
      this.db
        .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(newHash, String(userRow.id));
      this.db
        .prepare('DELETE FROM password_resets WHERE email = ?')
        .run(cleanEmail);
    });

    const token = this.createSessionForUser(String(userRow.id));
    return { user: toPublicUser(userRow), token };
  }

  // --- STUDIO PUBLIC REST API KEYS (/api/v1/*) ---
  private hashApiKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  listWorkspaceApiKeys(workspaceId: string): WorkspaceApiKey[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC'
      )
      .all(workspaceId) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      label: String(r.label),
      keyPrefix: String(r.key_prefix),
      lastUsedAt: r.last_used_at ? String(r.last_used_at) : undefined,
      createdAt: String(r.created_at),
    }));
  }

  createWorkspaceApiKey(params: {
    workspaceId: string;
    ownerUserId: string;
    label: string;
  }): { record: WorkspaceApiKey; secretKey: string } {
    const cleanLabel = params.label.trim() || 'Zapier / Automation Key';
    const rawRandom = crypto.randomBytes(18).toString('base64url');
    const secretKey = `omni_live_${rawRandom}`;
    const keyPrefix = `${secretKey.slice(0, 15)}…`;
    const keyHash = this.hashApiKey(secretKey);
    const id = `key_${Date.now().toString(36)}_${crypto
      .randomBytes(2)
      .toString('hex')}`;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO api_keys
          (id, workspace_id, owner_user_id, label, key_prefix, key_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.workspaceId,
        params.ownerUserId,
        cleanLabel,
        keyPrefix,
        keyHash,
        now
      );

    return {
      record: {
        id,
        workspaceId: params.workspaceId,
        label: cleanLabel,
        keyPrefix,
        createdAt: now,
      },
      secretKey,
    };
  }

  revokeWorkspaceApiKey(keyId: string, workspaceId: string): boolean {
    const res = this.db
      .prepare('DELETE FROM api_keys WHERE id = ? AND workspace_id = ?')
      .run(keyId, workspaceId);
    return Number(res.changes || 0) > 0;
  }

  authenticateApiKey(
    rawKey: string
  ): { workspaceId: string; ownerUserId: string } | null {
    const clean = rawKey.trim();
    if (!clean.startsWith('omni_live_')) return null;
    const keyHash = this.hashApiKey(clean);
    const row = this.db
      .prepare('SELECT id, workspace_id, owner_user_id FROM api_keys WHERE key_hash = ?')
      .get(keyHash) as
      | { id: string; workspace_id: string; owner_user_id: string }
      | undefined;
    if (!row) return null;

    this.db
      .prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
      .run(new Date().toISOString(), String(row.id));

    return {
      workspaceId: String(row.workspace_id),
      ownerUserId: String(row.owner_user_id),
    };
  }

  // --- WORKSPACE MEDIA VAULT ---
  getMediaVaultAssets(
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): MediaVaultAsset[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM media_vault WHERE workspace_id = ? ORDER BY created_at DESC'
      )
      .all(workspaceId) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      kind: r.kind === 'video' ? 'video' : 'photo',
      label: String(r.label),
      fileName: String(r.file_name),
      mimeType: String(r.mime_type),
      width: Number(r.width || 1080),
      height: Number(r.height || 1350),
      durationSec: r.duration_sec ? Number(r.duration_sec) : undefined,
      sampleTint: r.sample_tint ? String(r.sample_tint) : undefined,
      createdAt: String(r.created_at),
    }));
  }

  createMediaVaultAsset(params: {
    workspaceId: string;
    kind: 'photo' | 'video';
    label: string;
    fileName: string;
    mimeType: string;
    width?: number;
    height?: number;
    durationSec?: number;
    sampleTint?: string;
    filePath?: string;
  }): MediaVaultAsset {
    const id = `vault_${Date.now().toString(36)}_${crypto
      .randomBytes(2)
      .toString('hex')}`;
    const now = new Date().toISOString();
    const asset: MediaVaultAsset = {
      id,
      workspaceId: params.workspaceId,
      kind: params.kind,
      label: params.label.trim() || params.fileName,
      fileName: params.fileName,
      mimeType: params.mimeType,
      width: params.width || 1080,
      height: params.height || (params.kind === 'video' ? 1920 : 1350),
      durationSec: params.durationSec,
      sampleTint: params.sampleTint || '#2E3432',
      createdAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO media_vault
          (id, workspace_id, kind, label, file_name, mime_type, width, height, duration_sec, sample_tint, file_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        asset.id,
        asset.workspaceId,
        asset.kind,
        asset.label,
        asset.fileName,
        asset.mimeType,
        asset.width,
        asset.height,
        asset.durationSec ?? null,
        asset.sampleTint ?? null,
        params.filePath ?? null,
        asset.createdAt
      );

    return asset;
  }

  deleteMediaVaultAsset(assetId: string, workspaceId: string): boolean {
    const res = this.db
      .prepare('DELETE FROM media_vault WHERE id = ? AND workspace_id = ?')
      .run(assetId, workspaceId);
    return Number(res.changes || 0) > 0;
  }
}

export const store = new SqliteStore();

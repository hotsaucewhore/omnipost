import {
  AccountGroupId,
  ConnectedAccount,
  PhotoAssetMeta,
  PlatformId,
  PlatformOverride,
  PostKind,
  PublishStage,
  ResolvedPlatformContent,
  VideoAssetMeta,
} from '../../../shared/platforms';

export interface StoredAccountRecord extends ConnectedAccount {
  accessToken?: string;
  refreshToken?: string;
  externalAccountId?: string;
  expiresAt?: string;
}

export interface OAuthTokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresInSec?: number;
  externalAccountId: string;
  handle: string;
  displayName: string;
}

export interface PublishAdapterContext {
  jobId: string;
  platformId: PlatformId;
  postKind: PostKind;
  videoFilePath?: string;
  photoFilePaths?: string[];
  thumbnailFilePath?: string;
  videoMeta: VideoAssetMeta | null;
  photosMeta?: PhotoAssetMeta[];
  resolvedText: ResolvedPlatformContent;
  override: PlatformOverride;
  account: StoredAccountRecord;
  onProgress: (stage: PublishStage, pct: number, message: string) => void;
}

export interface PlatformAdapter {
  accountGroup: AccountGroupId;
  isLiveConfigured(): boolean;
  getOAuthUrl(redirectUri: string, state: string): { authUrl: string; codeVerifier?: string };
  exchangeCodeForToken(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OAuthTokenBundle>;
  publishVideo(
    ctx: PublishAdapterContext
  ): Promise<{
    externalPostId: string;
    externalUrl: string;
    firstCommentPosted?: boolean;
  }>;
}
